import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { refreshAudioStudio } from "../src/server/agents/capabilities/audio-studio/installation";
import {
  audioStudioExecutable,
  installedAudioStudio,
} from "../src/server/agents/capabilities/audio-studio/installation-state";

const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture(platform: "darwin" | "win32" = "darwin") {
  const folder = await mkdtemp(path.join(os.tmpdir(), "audio-update-"));
  folders.push(folder);
  const root = path.join(folder, "managed");
  const legacyRoot = path.join(folder, "legacy");
  let revision = "a".repeat(40);
  let offline = false;
  let installFails = false;
  const run = vi.fn(async (executable: string, args: string[], cwd: string) => {
    if (executable === "git" && args[0] === "ls-remote") {
      if (offline) throw Error("Fixture offline");
      return `${revision}\tHEAD\n`;
    }
    if (executable === "git" && args[0] === "clone") {
      const target = args.at(-1)!;
      await mkdir(path.join(target, "src"), { recursive: true });
      await writeFile(path.join(target, "LICENSE"), "Fixture license");
      await writeFile(
        path.join(target, "pyproject.toml"),
        '[project]\nname="audio-studio-mcp"\nversion="1.2.3"\n',
      );
      await writeFile(path.join(target, "uv.lock"), "Fixture lock");
      await writeFile(path.join(target, "src/server.py"), "# Fixture source");
      await writeFile(path.join(target, "install.sh"), "# Fixture installer");
      await writeFile(path.join(target, "install.ps1"), "# Fixture installer");
    }
    if (executable === "git" && args[0] === "rev-parse") return revision;
    if (executable === "git" && args[0] === "ls-files")
      return "LICENSE\0pyproject.toml\0uv.lock\0src/server.py\0install.sh\0install.ps1\0";
    if (executable === "bash" || executable === "powershell") {
      if (installFails) throw Error("Fixture installer failure");
      const bin = audioStudioExecutable(cwd, platform);
      await mkdir(path.dirname(bin), { recursive: true });
      await writeFile(bin, "Fixture executable");
    }
    return "";
  });
  const probe = vi.fn(async (executable: string) => {
    await readFile(executable);
  });
  const report = vi.fn();
  const options = {
    root,
    legacyRoot,
    platform,
    arch: platform === "darwin" ? "arm64" : "x64",
    externalCommand: "",
    run,
    probe,
    report,
  };
  return {
    ...options,
    folder,
    refresh: () => refreshAudioStudio(options),
    next: () => {
      revision = "b".repeat(40);
    },
    offline: () => {
      offline = true;
    },
    failInstall: () => {
      installFails = true;
    },
  };
}
it.each(["darwin", "win32"] as const)(
  "installs and probes a separate immutable revision with no weights or inference (%s)",
  async (platform) => {
    const f = await fixture(platform);
    expect((await f.refresh()).status).toBe("updated");
    const installed = installedAudioStudio(f.root, platform, f.arch)!;
    expect(installed.manifest).toMatchObject({
      revision: "a".repeat(40),
      version: "1.2.3",
      platform,
    });
    expect(f.probe).toHaveBeenCalledOnce();
    expect(
      f.run.mock.calls.find(
        ([command]) => command === (platform === "darwin" ? "bash" : "powershell"),
      )?.[1],
    ).toContain(platform === "darwin" ? "--skip-weights" : "-SkipWeights");
    const pointer = await readFile(path.join(f.root, "current.json"), "utf8");
    f.run.mockClear();
    expect((await f.refresh()).status).toBe("current");
    expect(f.run.mock.calls).toHaveLength(1);
    expect(await readFile(path.join(f.root, "current.json"), "utf8")).toBe(pointer);
    f.next();
    expect((await f.refresh()).status).toBe("updated");
    expect(installedAudioStudio(f.root, platform, f.arch)!.manifest.revision).toBe("b".repeat(40));
    expect(await readFile(installed.executable, "utf8")).toBe("Fixture executable");
  },
);
it.each(["offline", "installer", "contract"] as const)(
  "retains a verified old revision when update fails: %s",
  async (failure) => {
    const f = await fixture();
    await f.refresh();
    const previous = installedAudioStudio(f.root, f.platform, f.arch)!;
    const pointer = await readFile(path.join(f.root, "current.json"), "utf8");
    f.next();
    if (failure === "offline") f.offline();
    if (failure === "installer") f.failInstall();
    if (failure === "contract")
      f.probe.mockImplementation(async (executable) => {
        if (executable !== previous.executable) throw Error("Fixture incompatible tools");
      });
    expect((await f.refresh()).status).toBe("fallback");
    expect(await readFile(path.join(f.root, "current.json"), "utf8")).toBe(pointer);
  },
);
it("probes a legacy fallback without modifying it and reports first-install failure", async () => {
  const f = await fixture();
  f.offline();
  expect((await f.refresh()).status).toBe("unavailable");
  const bin = audioStudioExecutable(f.legacyRoot, f.platform);
  await mkdir(path.dirname(bin), { recursive: true });
  await writeFile(bin, "Legacy fixture");
  expect((await f.refresh()).status).toBe("fallback");
  expect(await readFile(bin, "utf8")).toBe("Legacy fixture");
});
it("does not update explicit external commands or unsupported platforms", async () => {
  const f = await fixture();
  await refreshAudioStudio({ ...f, externalCommand: "/example/custom-mcp" });
  expect(f.run).not.toHaveBeenCalled();
  await refreshAudioStudio({ ...f, platform: "linux" });
  expect(f.run).not.toHaveBeenCalled();
});
it("rejects corrupted source, escaping pointers and linked source paths", async () => {
  const f = await fixture();
  await f.refresh();
  const active = installedAudioStudio(f.root, f.platform, f.arch)!;
  await writeFile(path.join(active.directory, "src/server.py"), "# Changed");
  expect(() => installedAudioStudio(f.root, f.platform, f.arch)).toThrow("integrity");
  await writeFile(path.join(active.directory, "src/server.py"), "# Fixture source");
  await rm(path.join(active.directory, "src/server.py"));
  await writeFile(path.join(f.folder, "outside.py"), "# Fixture source");
  await symlink(path.join(f.folder, "outside.py"), path.join(active.directory, "src/server.py"));
  expect(() => installedAudioStudio(f.root, f.platform, f.arch)).toThrow("linked");
  await writeFile(
    path.join(f.root, "current.json"),
    JSON.stringify({ ...active.manifest, directory: "../outside" }),
  );
  expect(() => installedAudioStudio(f.root, f.platform, f.arch)).toThrow();
});
it("cancels a pending update and preserves the current pointer", async () => {
  const f = await fixture();
  await f.refresh();
  const pointer = await readFile(path.join(f.root, "current.json"), "utf8");
  const controller = new AbortController();
  f.run.mockImplementationOnce(async () => {
    controller.abort();
    controller.signal.throwIfAborted();
    return "";
  });
  await expect(refreshAudioStudio({ ...f, signal: controller.signal })).rejects.toThrow();
  expect(await readFile(path.join(f.root, "current.json"), "utf8")).toBe(pointer);
});
it("serializes concurrent refreshes and installs a revision only once", async () => {
  const f = await fixture();
  const results = await Promise.all([f.refresh(), f.refresh()]);
  expect(results.map((result) => result.status).sort()).toEqual(["current", "updated"]);
  expect(
    f.run.mock.calls.filter(([command, args]) => command === "git" && args[0] === "clone"),
  ).toHaveLength(1);
});

it("verifies the real MCP discovery contract without calling an audio tool", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { ListToolsRequestSchema, CallToolRequestSchema } =
    await import("@modelcontextprotocol/sdk/types.js");
  const { validateAudioStudioMcp } =
    await import("../src/server/agents/capabilities/audio-studio/installation");
  const { audioStudioTools } =
    await import("../src/server/agents/capabilities/audio-studio/capability");
  const remote = new Server(
    { name: "audio-studio", version: "fixture" },
    { capabilities: { tools: {} } },
  );
  let names = [...audioStudioTools];
  const call = vi.fn(async () => ({ content: [] }));
  remote.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: names.map((name) => ({ name, inputSchema: { type: "object" as const } })),
  }));
  remote.setRequestHandler(CallToolRequestSchema, call);
  const client = new Client({ name: "fixture-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await remote.connect(a);
  await client.connect(b);
  try {
    await validateAudioStudioMcp(client, new AbortController().signal);
    names = ["process_audio"];
    await expect(validateAudioStudioMcp(client, new AbortController().signal)).rejects.toThrow(
      "incompatible",
    );
    expect(call).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await remote.close();
  }
});

it("resolves the active managed executable for new registrations without changing previous job commands", async () => {
  const f = await fixture();
  await f.refresh();
  vi.stubEnv("AUDIO_STUDIO_MCP_COMMAND", "");
  const state = await import("../src/server/agents/capabilities/audio-studio/installation-state");
  const original = state.installedAudioStudio;
  vi.spyOn(state, "installedAudioStudio").mockImplementation(() =>
    original(f.root, f.platform, f.arch),
  );
  const { audioStudioCapability } =
    await import("../src/server/agents/capabilities/audio-studio/capability");
  const before = audioStudioCapability("/example/job")!;
  const oldCommand = JSON.parse(before.args!.at(-1)!).command;
  expect(oldCommand).toContain("a".repeat(40));
  f.next();
  await f.refresh();
  const after = audioStudioCapability("/example/job")!;
  expect(JSON.parse(after.args!.at(-1)!).command).toContain("b".repeat(40));
  expect(JSON.parse(before.args!.at(-1)!).command).toBe(oldCommand);
});

it("does not install an absent optional runtime during startup", async () => {
  const f = await fixture();
  expect((await refreshAudioStudio({ ...f, installIfMissing: false })).status).toBe(
    "not_installed",
  );
  expect(f.run).not.toHaveBeenCalled();
  expect(f.probe).not.toHaveBeenCalled();
});
