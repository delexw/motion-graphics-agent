import { mkdtemp, readFile, rm, stat, symlink, truncate, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { inspectMusicAnalysis } from "../src/server/audio/music-analysis-inspection";
import { registerMusicAnalysisRoutes } from "../src/server/audio/music-analysis-routes";
import { prepareProjectLayout } from "../src/server/runtime/workspace";
import { apiErrorHandler } from "../src/server/runtime/api-errors";
import { RequestSchema, type Run } from "../src/shared/contracts";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "beat-inspection-"));
  folders.push(workspace);
  await prepareProjectLayout(workspace);
  const file = "artifacts/assets/music.wav";
  const source = path.join(workspace, file);
  const output = `${source}.beats.json`;
  const contents = "synthetic audio fixture";
  await writeFile(source, contents);
  const analysis = {
    version: 1,
    analyzer: "hyperframes beats",
    sourceFile: file,
    sourceSha256: createHash("sha256").update(contents).digest("hex"),
    count: 3,
    bpm: 120,
    beatTimes: [0.25, 0.75, 1.25],
  };
  await writeFile(output, JSON.stringify(analysis));
  return { workspace, file, source, output, analysis, signal: new AbortController().signal };
}
it("reads validated maps repeatedly without modifying files or running analysis", async () => {
  const f = await fixture();
  const before = (await stat(f.output)).mtimeMs;
  for (let n = 0; n < 2; n++)
    expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toEqual({
      status: "ready",
      analysisFile: `${f.file}.beats.json`,
      analysis: f.analysis,
    });
  expect((await stat(f.output)).mtimeMs).toBe(before);
  expect(await readFile(f.source, "utf8")).toBe("synthetic audio fixture");
});
it.each(["missing", "stale", "invalid", "unavailable"] as const)(
  "reports %s without returning old beat times",
  async (status) => {
    const f = await fixture();
    if (status === "missing") await rm(f.output);
    if (status === "stale") await writeFile(f.source, "edited audio");
    if (status === "invalid") await writeFile(f.output, "bad json");
    if (status === "unavailable") await rm(f.source);
    expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toEqual({ status });
  },
);
it.each([
  { version: 2 },
  { analyzer: "unverified" },
  { count: 2 },
  { beatTimes: [0.75, 0.25, 1.25] },
  { beatTimes: [-0.25, 0.75, 1.25] },
  { bpm: -1 },
  { sourceSha256: "invalid" },
])("rejects invalid saved evidence: %j", async (change) => {
  const f = await fixture();
  await writeFile(f.output, JSON.stringify({ ...f.analysis, ...change }));
  expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toEqual({ status: "invalid" });
});
it("keeps empty maps valid and rejects a map associated with another source", async () => {
  const f = await fixture();
  await writeFile(f.output, JSON.stringify({ ...f.analysis, count: 0, bpm: null, beatTimes: [] }));
  expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toMatchObject({
    status: "ready",
    analysis: { count: 0, bpm: null, beatTimes: [] },
  });
  await writeFile(
    f.output,
    JSON.stringify({ ...f.analysis, sourceFile: "artifacts/assets/other.wav" }),
  );
  expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toEqual({ status: "stale" });
});
it("bounds sidecar size and rejects source/sidecar symlink escapes", async () => {
  const f = await fixture();
  await truncate(f.output, 2 * 1024 * 1024 + 1);
  expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toEqual({ status: "invalid" });
  const outside = await mkdtemp(path.join(os.tmpdir(), "beat-outside-"));
  folders.push(outside);
  await writeFile(path.join(outside, "source.wav"), "private");
  await rm(f.source);
  await symlink(path.join(outside, "source.wav"), f.source);
  expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toEqual({
    status: "unavailable",
  });
  await rm(f.source);
  await writeFile(f.source, "synthetic audio fixture");
  await rm(f.output);
  await symlink(path.join(outside, "source.wav"), f.output);
  expect(await inspectMusicAnalysis(f.workspace, f.file, f.signal)).toEqual({
    status: "unavailable",
  });
  expect(await inspectMusicAnalysis(f.workspace, "../outside.wav", f.signal)).toEqual({
    status: "unavailable",
  });
  const controller = new AbortController();
  controller.abort();
  await expect(inspectMusicAnalysis(f.workspace, f.file, controller.signal)).rejects.toThrow();
});
it("registers a GET-only job-scoped route with validated inputs and no cached stale response", async () => {
  const f = await fixture();
  const run: Run = {
    id: "project",
    phase: "ready",
    createdAt: "2026-01-01",
    request: RequestSchema.parse({ instructions: "Generic fixture project" }),
    candidates: [],
    jobs: [
      {
        id: "job",
        runId: "project",
        candidateId: "candidate",
        kind: "full",
        phase: "ready",
        duration: 3,
        workspace: f.workspace,
        model: "fixture",
      },
    ],
  };
  const getRun = vi.fn(() => run);
  const app = Fastify();
  app.setErrorHandler(apiErrorHandler);
  registerMusicAnalysisRoutes(app, getRun);
  const url = `/api/music-analysis/project/job?file=${encodeURIComponent(f.file)}`;
  try {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({ status: "ready", analysis: f.analysis });
    expect(getRun).toHaveBeenCalledWith("project");
    await writeFile(f.source, "modified");
    expect((await app.inject({ method: "GET", url })).json()).toEqual({ status: "stale" });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/music-analysis/project/missing?file=music.wav",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: "/api/music-analysis/project/job" })).statusCode,
    ).toBe(400);
    expect((await app.inject({ method: "POST", url })).statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
