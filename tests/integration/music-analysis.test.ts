import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { analyzeMusic } from "../../src/server/audio/music-analysis";
import { isolatedCommand } from "../../src/server/runtime/process";
import { prepareProjectLayout } from "../../src/server/runtime/workspace";
import { agentCapabilities } from "../../src/server/agents/capabilities/registry";
import { createMusicAnalysisTools } from "../../src/server/agents/capabilities/music-analysis/tools";

vi.mock("../../src/server/runtime/process", () => ({ isolatedCommand: vi.fn() }));
const folders: string[] = [];
const clients: Client[] = [];
const servers: ReturnType<typeof createMusicAnalysisTools>[] = [];
const run = vi.mocked(isolatedCommand);

beforeEach(() => {
  run.mockReset();
  run.mockImplementation(async (_exe, args, _cwd, signal, _output, _timeout, stdout) => {
    signal.throwIfAborted();
    stdout?.(
      JSON.stringify({ ok: true, file: args[2], count: 3, bpm: 120, beatTimes: [0.2, 0.7, 1.2] }),
    );
    return "ignored combined display output";
  });
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
  vi.unstubAllEnvs();
});
async function fixture(legacy = false) {
  const folder = await realpath(await mkdtemp(path.join(os.tmpdir(), "music-analysis-")));
  folders.push(folder);
  const workspace = path.join(folder, "job");
  await mkdir(workspace);
  if (!legacy) await prepareProjectLayout(workspace);
  const file = legacy ? "music.wav" : "artifacts/assets/music.wav";
  const source = path.join(workspace, file);
  await writeFile(source, "synthetic audio; CLI boundary mocked");
  return { folder, workspace, file, source, sidecar: `${source}.beats.json` };
}
async function connect(workspace: string, readOnly = false) {
  const server = createMusicAnalysisTools(workspace, readOnly);
  const client = new Client({ name: "test-client", version: "1" });
  servers.push(server);
  clients.push(client);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return client;
}

it.each([false, true])(
  "saves validated source-relative analysis and replaces the same sidecar (legacy=%s)",
  async (legacy) => {
    const f = await fixture(legacy);
    const first = await analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal);
    expect(first.analysis).toMatchObject({
      analyzer: "hyperframes beats",
      sourceFile: f.file,
      bpm: 120,
      beatTimes: [0.2, 0.7, 1.2],
    });
    expect(first.analysis.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(f.sidecar, "utf8"))).toEqual(first.analysis);
    expect(run.mock.calls[0][1]).toEqual([
      expect.stringContaining("hyperframes"),
      "beats",
      f.source,
      "--json",
    ]);
    expect(run.mock.calls[0][5]).toBe(180000);
    const second = await analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal);
    expect(second).toEqual(first);
    await writeFile(f.source, "new prepared track");
    const third = await analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal);
    expect(third.analysis.sourceSha256).not.toBe(first.analysis.sourceSha256);
  },
);

it.each(["traversal", "absolute", "symlink", "non-artifact", "output-link", "format", "missing"])(
  "rejects %s before invoking the CLI",
  async (kind) => {
    const f = await fixture();
    const outside = path.join(f.folder, "outside.wav");
    await writeFile(outside, "outside");
    let file = f.file;
    if (kind === "traversal") file = "../outside.wav";
    if (kind === "absolute") file = f.source;
    if (kind === "symlink") {
      file = "artifacts/linked.wav";
      await symlink(outside, path.join(f.workspace, file));
    }
    if (kind === "non-artifact") {
      file = "private.wav";
      await writeFile(path.join(f.workspace, file), "private");
    }
    if (kind === "output-link") await symlink(outside, f.sidecar);
    if (kind === "format") {
      file = "artifacts/input.html";
      await writeFile(path.join(f.workspace, file), "html");
    }
    if (kind === "missing") file = "artifacts/missing.wav";
    await expect(
      analyzeMusic(f.workspace, { file }, new AbortController().signal),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(outside, "utf8")).toBe("outside");
  },
);

it.each([
  "not-json",
  { ok: false },
  { count: 2, beatTimes: [0.2] },
  { count: 2, beatTimes: [1, 0.5] },
  { count: 2, beatTimes: [0.5, 0.5] },
  { count: 1, beatTimes: [-1] },
  { bpm: 0 },
  { file: "/different/source.wav" },
])("rejects malformed analysis without overwriting prior evidence: %j", async (invalid) => {
  const f = await fixture();
  await writeFile(f.sidecar, "prior evidence");
  run.mockImplementationOnce(async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
    stdout?.(
      typeof invalid === "string"
        ? invalid
        : JSON.stringify({
            ok: true,
            file: f.source,
            count: 3,
            bpm: 120,
            beatTimes: [0.2, 0.7, 1.2],
            ...invalid,
          }),
    );
    return "";
  });
  await expect(
    analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal),
  ).rejects.toThrow();
  expect(await readFile(f.sidecar, "utf8")).toBe("prior evidence");
});

it("retains an empty detected map without fabricating rhythm", async () => {
  const f = await fixture();
  run.mockImplementationOnce(async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
    stdout?.(JSON.stringify({ ok: true, file: f.source, count: 0, bpm: null, beatTimes: [] }));
    return "";
  });
  expect(
    (await analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal)).analysis,
  ).toMatchObject({ count: 0, bpm: null, beatTimes: [] });
});

it("rejects a track changed during analysis without replacing its sidecar", async () => {
  const f = await fixture();
  await writeFile(f.sidecar, "prior evidence");
  run.mockImplementationOnce(async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
    await writeFile(f.source, "edited track");
    stdout?.(JSON.stringify({ ok: true, file: f.source, count: 0, bpm: null, beatTimes: [] }));
    return "";
  });
  await expect(
    analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal),
  ).rejects.toThrow("changed during analysis");
  expect(await readFile(f.sidecar, "utf8")).toBe("prior evidence");
});

it("forwards cancellation and leaves prior evidence intact", async () => {
  const f = await fixture();
  const controller = new AbortController();
  await writeFile(f.sidecar, "prior evidence");
  run.mockImplementationOnce(async (_exe, _args, _cwd, signal) => {
    controller.abort();
    signal.throwIfAborted();
    return "";
  });
  await expect(analyzeMusic(f.workspace, { file: f.file }, controller.signal)).rejects.toThrow();
  expect(run.mock.calls[0][3]).toBe(controller.signal);
  expect(await readFile(f.sidecar, "utf8")).toBe("prior evidence");
  run.mockClear();
  await expect(analyzeMusic(f.workspace, { file: f.file }, controller.signal)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});

it("registers the tool and guidance for builds independently of Audio Studio, excluding read-only/text-only turns", async () => {
  vi.stubEnv("AUDIO_STUDIO_MCP_COMMAND", "/nonexistent/audio-studio-mcp");
  const f = await fixture();
  const { servers: registered, guidance } = agentCapabilities(f.workspace);
  expect(registered.music_analysis.enabledTools).toEqual(["analyze_music"]);
  expect(registered.audio_studio).toBeUndefined();
  expect(guidance).toContain("Call analyze_music");
  expect(guidance).toContain("Reanalyze after");
  expect(guidance).toContain("source-relative seconds");
  expect(agentCapabilities(f.workspace, true).servers.music_analysis).toBeUndefined();
  expect(agentCapabilities(f.workspace, true).guidance).not.toContain("### Music analysis");
  expect(agentCapabilities(f.workspace, true).guidance).not.toContain("### Audio Studio");
  expect(agentCapabilities(f.workspace, false, true).servers.music_analysis).toBeUndefined();
  const client = await connect(f.workspace);
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["analyze_music"]);
  const result = await client.callTool({ name: "analyze_music", arguments: { file: f.file } });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({
    kind: "music_analysis",
    analysisFile: `${f.file}.beats.json`,
  });
  const readOnly = await connect(f.workspace, true);
  expect((await readOnly.listTools()).tools).toEqual([]);
  const rejected = await readOnly.callTool({ name: "analyze_music", arguments: { file: f.file } });
  expect(rejected.isError).toBe(true);
  expect(run).toHaveBeenCalledTimes(1);
});

it("returns structured errors when the runtime fails without changing the soundtrack", async () => {
  const f = await fixture();
  run.mockRejectedValueOnce(Error("Process exceeded time limit"));
  const client = await connect(f.workspace);
  const result = await client.callTool({ name: "analyze_music", arguments: { file: f.file } });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toEqual({
    kind: "error",
    message: "Process exceeded time limit",
  });
  expect(await readFile(f.source, "utf8")).toBe("synthetic audio; CLI boundary mocked");
});

it("rejects oversized source files before reading or launching analysis", async () => {
  const f = await fixture();
  await truncate(f.source, 256 * 1024 * 1024 + 1);
  await expect(
    analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal),
  ).rejects.toThrow("up to 256 MiB");
  expect(run).not.toHaveBeenCalled();
});

it("limits CLI output and preserves prior evidence on overflow", async () => {
  const f = await fixture();
  await writeFile(f.sidecar, "prior evidence");
  run.mockImplementationOnce(async (_exe, _args, _cwd, _signal, _output, _timeout, stdout) => {
    stdout?.("x".repeat(2 * 1024 * 1024 + 1));
    return "";
  });
  await expect(
    analyzeMusic(f.workspace, { file: f.file }, new AbortController().signal),
  ).rejects.toThrow("exceeds 2 MiB");
  expect(await readFile(f.sidecar, "utf8")).toBe("prior evidence");
});
