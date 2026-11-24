import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { acquireFileLease } from "../../../runtime/file-lease";
import { safeMessage } from "../../../runtime/config";
import { command } from "../../../runtime/process";
import {
  installedPixelAssetSource,
  managedPixelAssetDirectory,
  pixelAssetRoot,
  pixelAssetSourceAvailable,
  pixelAssetSources,
  type PixelAssetSource,
} from "./sources";

type Git = (args: string[], cwd: string, signal: AbortSignal) => Promise<string>;
const git: Git = (args, cwd, signal) =>
  command("git", args, cwd, signal, undefined, 300_000, false, undefined, {
    GIT_TERMINAL_PROMPT: "0",
  });

async function verifyFiles(source: PixelAssetSource, directory: string) {
  const canonical = await realpath(directory);
  for (const file of source.required) {
    const target = path.join(canonical, file);
    if ((await realpath(target)) !== target || !(await lstat(target)).isFile())
      throw Error(`Invalid source file: ${file}`);
  }
}

type InstallationOptions = {
  root?: string;
  installIfMissing: boolean;
  signal: AbortSignal;
  runGit?: Git;
  environment?: NodeJS.ProcessEnv;
};

async function installSource(source: PixelAssetSource, options: InstallationOptions) {
  const { name } = source;
  options.signal.throwIfAborted();
  const environment = options.environment ?? process.env;
  const external = environment[source.variable];
  if (external)
    return {
      name,
      status: pixelAssetSourceAvailable(source, path.resolve(external))
        ? "external"
        : "unavailable",
      detail: source.variable,
    } as const;

  const root = options.root ?? pixelAssetRoot;
  const managed = managedPixelAssetDirectory(source, root);
  const pointer = path.join(managed, "current");
  const active = installedPixelAssetSource(source, root);
  if (!active && !existsSync(pointer) && !options.installIfMissing)
    return { name, status: "skipped" } as const;
  const run = options.runGit ?? git;
  await mkdir(managed, { recursive: true, mode: 0o700 });
  if (!(await lstat(managed)).isDirectory())
    throw Error("Managed pixel asset directory is linked.");
  const lease = await acquireFileLease(path.join(managed, "update"), options.signal);
  try {
    const signal = lease.signal;
    const current = installedPixelAssetSource(source, root);
    let verified = false;
    if (current) {
      try {
        await verifyFiles(source, current);
        const revision = (await run(["-C", current, "rev-parse", "HEAD"], managed, signal)).trim();
        const changes = await run(["-C", current, "status", "--porcelain"], managed, signal);
        verified = !changes.trim() && /^[a-f0-9]{40}$/.test(revision);
        if (verified && revision === source.revision)
          return { name, status: "current", detail: revision } as const;
      } catch {
        signal.throwIfAborted();
      }
    }
    const staged = await mkdtemp(path.join(managed, ".install-"));
    const directoryName = `${source.revision}-${randomUUID()}`;
    const pending = path.join(managed, `.${directoryName}.current`);
    let published = false;
    try {
      const checkout = ["-C", staged];
      await run([...checkout, "init", "--quiet"], managed, signal);
      await run(
        [...checkout, "fetch", "--quiet", "--depth", "1", source.url, source.revision],
        managed,
        signal,
      );
      await run(
        [
          ...checkout,
          "-c",
          `core.hooksPath=${path.join(staged, ".git", "no-hooks")}`,
          "checkout",
          "--quiet",
          "--detach",
          "FETCH_HEAD",
        ],
        managed,
        signal,
      );
      const revision = (await run([...checkout, "rev-parse", "HEAD"], managed, signal)).trim();
      if (revision !== source.revision) throw Error("Checkout did not match the pinned revision.");
      await verifyFiles(source, staged);
      await writeFile(pending, directoryName + "\n", { flag: "wx" });
      signal.throwIfAborted();
      await rename(staged, path.join(managed, directoryName));
      await rename(pending, pointer);
      published = true;
      return { name, status: "installed", detail: revision } as const;
    } catch (error) {
      signal.throwIfAborted();
      return {
        name,
        status: verified ? "fallback" : "unavailable",
        detail: safeMessage(error),
      } as const;
    } finally {
      if (!published) {
        await rm(staged, { recursive: true, force: true });
        await rm(pending, { force: true });
        await rm(path.join(managed, directoryName), { recursive: true, force: true });
      }
    }
  } finally {
    await lease.release();
  }
}

export async function installPixelAssetSources(options: InstallationOptions) {
  const sources = Object.values(pixelAssetSources);
  const results = await Promise.allSettled(sources.map((source) => installSource(source, options)));
  options.signal.throwIfAborted();
  return results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          name: sources[index].name,
          status: "unavailable" as const,
          detail: safeMessage(result.reason),
        },
  );
}
