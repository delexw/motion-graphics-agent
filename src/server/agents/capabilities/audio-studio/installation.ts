import { existsSync } from "node:fs";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "@iarna/toml";
import { z } from "zod";
import { command } from "../../../runtime/process";
import { acquireFileLease } from "../../../runtime/file-lease";
import { dataRoot, safeMessage } from "../../../runtime/config";
import { userHome } from "../../../runtime/platform";
import { connectAudioStudio } from "./client";
import { audioStudioTools } from "./capability";
import {
  audioStudioRepository,
  audioStudioInstallationRoot,
  audioStudioExecutable,
  audioStudioFileHash,
  installedAudioStudio,
  verifyAudioStudioInstallation,
  type AudioStudioInstallation,
} from "./installation-state";

type RunCommand = (
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
) => Promise<string>;
type Probe = (executable: string, workspace: string, signal: AbortSignal) => Promise<void>;
const runCommand: RunCommand = (executable, args, cwd, signal) =>
  command(
    executable,
    args,
    cwd,
    signal,
    () => {},
    15 * 60_000,
    false,
    () => {},
    {
      HOME: userHome(),
      USERPROFILE: userHome(),
      GIT_TERMINAL_PROMPT: "0",
      AUDIO_STUDIO_NONINTERACTIVE: "1",
    },
  );
/** MCP handshake and tool contracts only: never loads weights or invokes generation. */
const probeAudioStudio: Probe = async (executable, workspace, signal) => {
  const client = await connectAudioStudio(workspace, executable, signal);
  try {
    await validateAudioStudioMcp(client, signal);
  } finally {
    await client.close();
  }
};

/** Contract inspection does not call any exposed audio operation. */
export async function validateAudioStudioMcp(client: Client, signal: AbortSignal) {
  const { tools } = await client.listTools({}, { signal, timeout: 15000 });
  if (
    !client.getServerVersion() ||
    !audioStudioTools.every((name) =>
      tools.some((tool) => tool.name === name && tool.inputSchema.type === "object"),
    )
  )
    throw Error("Audio Studio MCP contract is incompatible");
}

/** Host startup maintenance. Never mutates active revisions, jobs, or explicit external commands. */
export async function refreshAudioStudio(
  options: {
    root?: string;
    installIfMissing?: boolean;
    legacyRoot?: string;
    platform?: NodeJS.Platform;
    arch?: string;
    externalCommand?: string;
    signal?: AbortSignal;
    run?: RunCommand;
    probe?: Probe;
    report?: (message: string) => void;
  } = {},
) {
  const root = options.root ?? audioStudioInstallationRoot;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const report = options.report ?? console.warn;
  if (options.externalCommand ?? process.env.AUDIO_STUDIO_MCP_COMMAND) {
    report("Audio Studio uses an explicit external command; automatic updates do not modify it.");
    return { status: "external" as const };
  }
  if (!(platform === "darwin" && arch === "arm64") && !(platform === "win32" && arch === "x64")) {
    report(
      "Audio Studio automatic setup is unsupported on this platform; configure an external command if available.",
    );
    return { status: "unsupported" as const };
  }
  if (
    options.installIfMissing === false &&
    !existsSync(path.join(root, "current.json")) &&
    !existsSync(
      audioStudioExecutable(
        options.legacyRoot ?? path.join(dataRoot, "audio-studio-mcp"),
        platform,
      ),
    )
  ) {
    report(
      "Audio Studio is not installed; startup will not install an optional runtime. Use install.sh or npm run audio-studio:update.",
    );
    return { status: "not_installed" as const };
  }
  const signal = options.signal ?? AbortSignal.timeout(15 * 60_000);
  const run = options.run ?? runCommand;
  const probe = options.probe ?? probeAudioStudio;
  await mkdir(root, { recursive: true });
  if (!(await lstat(root)).isDirectory())
    throw Error("Audio Studio update root must not be linked");
  const lease = await acquireFileLease(path.join(root, "update"), signal);
  try {
    const signal = lease.signal;
    const workspace = path.join(root, "probe");
    await mkdir(workspace, { recursive: true });
    try {
      const response = await run(
        "git",
        ["ls-remote", "--exit-code", audioStudioRepository, "HEAD"],
        root,
        signal,
      );
      const revision = z
        .string()
        .regex(/^[a-f0-9]{40}$/)
        .parse(/^([a-f0-9]{40})\s+HEAD\s*$/.exec(response.trim())?.[1]);
      let active: ReturnType<typeof installedAudioStudio>;
      try {
        active = installedAudioStudio(root, platform, arch);
      } catch {
        /* Rebuild damaged managed installations without trusting them as fallback. */
      }
      if (active?.manifest.revision === revision) {
        await probe(active.executable, workspace, signal);
        report(`Audio Studio is current: ${active.manifest.version} (${revision}).`);
        return { status: "current" as const, installation: active };
      }
      // Never rename a built Python environment: entry-point scripts contain absolute paths.
      const directoryName = `${revision}-${randomUUID()}`;
      const directory = path.join(root, directoryName);
      await run(
        "git",
        ["clone", "--filter=blob:none", "--no-checkout", audioStudioRepository, directory],
        root,
        signal,
      );
      await run("git", ["fetch", "--depth", "1", "origin", revision], directory, signal);
      await run("git", ["checkout", "--detach", revision], directory, signal);
      const actual = (await run("git", ["rev-parse", "HEAD"], directory, signal)).trim();
      if (actual !== revision) throw Error("Audio Studio downloaded revision mismatch");
      const tracked = (await run("git", ["ls-files", "-z"], directory, signal))
        .split("\0")
        .filter(Boolean);
      if (!tracked.length || tracked.length > 4096)
        throw Error("Audio Studio source inventory is invalid");
      const files: Record<string, string> = {};
      for (const file of tracked) {
        if (
          file.includes("\\") ||
          file.includes(":") ||
          file.startsWith("/") ||
          file.split("/").some((part) => !part || part === "." || part === "..")
        )
          throw Error("Invalid Audio Studio source path");
        let target = directory;
        for (const part of file.split("/")) {
          target = path.join(target, part);
          if ((await lstat(target)).isSymbolicLink())
            throw Error("Audio Studio source must not be linked");
        }
        files[file] = audioStudioFileHash(target);
      }
      const project = z
        .object({
          project: z.object({ name: z.literal("audio-studio-mcp"), version: z.string().min(1) }),
        })
        .parse(parse(await readFile(path.join(directory, "pyproject.toml"), "utf8"))).project;
      // Require an existing package manager; do not bootstrap host tools with downloaded shell scripts.
      await run("uv", ["--version"], directory, signal);
      if (platform === "darwin")
        await run("bash", ["install.sh", "--skip-weights", "--yes"], directory, signal);
      else
        await run(
          "powershell",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            "install.ps1",
            "-SkipWeights",
            "-Yes",
            "-NonInteractive",
          ],
          directory,
          signal,
        );
      const manifest: AudioStudioInstallation = {
        repository: audioStudioRepository,
        revision,
        directory: directoryName,
        platform,
        arch,
        version: project.version,
        installedAt: new Date().toISOString(),
        executableHash: audioStudioFileHash(audioStudioExecutable(directory, platform)),
        files,
      };
      const result = verifyAudioStudioInstallation(root, manifest);
      await probe(audioStudioExecutable(directory, platform), workspace, signal);
      signal.throwIfAborted();
      const pending = path.join(root, `current-${randomUUID()}.json`);
      await writeFile(pending, JSON.stringify(manifest, null, 2), { flag: "wx" });
      await rename(pending, path.join(root, "current.json"));
      report(`Audio Studio updated: ${project.version} (${revision}).`);
      return { status: "updated" as const, installation: result };
    } catch (error) {
      signal.throwIfAborted();
      report(`Audio Studio update failed: ${safeMessage(error)}`);
      let active: ReturnType<typeof installedAudioStudio>;
      try {
        active = installedAudioStudio(root, platform, arch);
      } catch {
        /* No verified managed fallback. */
      }
      if (active) {
        try {
          await probe(active.executable, workspace, signal);
          report(
            `Audio Studio update unavailable; retaining verified ${active.manifest.version} (${active.manifest.revision}).`,
          );
          return { status: "fallback" as const, installation: active };
        } catch {
          signal.throwIfAborted();
          report(
            "Audio Studio managed runtime could not be verified; audio capability is unavailable until repaired.",
          );
          return { status: "unavailable" as const };
        }
      }
      const legacy = audioStudioExecutable(
        options.legacyRoot ?? path.join(dataRoot, "audio-studio-mcp"),
        platform,
      );
      try {
        await probe(legacy, workspace, signal);
        report(
          "Audio Studio update unavailable; retaining the existing legacy installation after MCP verification.",
        );
        return { status: "fallback" as const };
      } catch {
        signal.throwIfAborted();
        report(
          "Audio Studio is unavailable. Check network, git, uv and upstream platform prerequisites, then relaunch. No audio generation was attempted.",
        );
        return { status: "unavailable" as const };
      }
    }
  } finally {
    await lease.release();
  }
}
