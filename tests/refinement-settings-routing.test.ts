import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../src/server/domains/video/workflow", () => ({ generateVideo: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { generateVideo } from "../src/server/domains/video/workflow";
import { Workflow } from "../src/server/jobs/workflow";
import { Store } from "../src/server/jobs/store";
import { loadCatalog } from "../src/server/catalog/catalog";
import { VideoRequestSchema, type VideoGenerationJob } from "../src/shared/domains/video";
import type { Run } from "../src/shared/contracts";

it("routes version settings into actual workspace setup and video generation, with attributed Governance usage", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "refinement-routing-"));
  const store = new Store(":memory:");
  try {
    const id = randomUUID();
    const job: VideoGenerationJob = {
      id: "refined",
      runId: id,
      candidateId: "chosen",
      kind: "full",
      phase: "queued",
      workspace,
      model: "selected-main-model",
      duration: 20,
      refinementPrompt: "use Ming TTS Chinese female",
      authoringResources: {
        source: "jev",
        model: "fixture",
        selectedIds: ["local_code"],
        decisions: [],
      },
      audioAuthoring: { source: "skipped", decisions: [] },
    };
    const run: Run = {
      id,
      createdAt: new Date().toISOString(),
      phase: "generating",
      request: VideoRequestSchema.parse({
        instructions: "An example story",
        provider: "claude",
        renderer: "multiplane",
        duration: 20,
        outputLanguage: "zh",
        speech: { mode: "narration", engine: "kokoro", voice: "zf_xiaobei", language: "zh" },
      }),
      brief: {
        subject: "Example",
        audience: "Everyone",
        objective: "Explain",
        facts: [],
        exactCopy: [],
        previewBeat: "A scene",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 20,
        durationReason: "Example",
      },
      candidates: [
        {
          id: "chosen",
          primaryStyleId: "style-018",
          supportingStyleIds: [],
          sceneRoles: ["Identity"],
          rationale: "Example",
          feasible: true,
          missingAssets: [],
          score: 0,
          confidence: 0,
          dimensions: {},
        },
      ],
      jobs: [job],
    };
    const original = structuredClone(run.request);
    vi.mocked(agentTurn).mockImplementation(async (input) => {
      input.onEvent({
        type: "invocation",
        message: "Fixture",
        data: { invocationId: "settings-fixture", model: "selected-main-model" },
      });
      input.onEvent({
        type: "usage",
        message: "",
        data: {
          invocationId: "settings-fixture",
          model: "selected-main-model",
          usage: { input_tokens: 10, output_tokens: 5 },
          cost_usd: 0.001,
        },
      });
      return {
        value: {
          version: 1,
          profiles: [
            {
              language: "zh",
              sourceQuote: job.refinementPrompt!,
              speech: { engine: "ming-tts", voice: "ming_xiaorou" },
            },
          ],
          delivery: null,
          unsupported: [],
        },
      };
    });
    vi.mocked(generateVideo).mockImplementation(async (input) => {
      expect(input.request.speech).toMatchObject({ engine: "ming-tts", voice: "ming_xiaorou" });
      input.job.phase = "ready";
    });
    const workflow = new Workflow(store, await loadCatalog());
    vi.spyOn(workflow, "queuePlaybackCopies").mockReturnValue(false);
    await workflow.generate(run, job);
    expect(job.phase).toBe("ready");
    expect(generateVideo).toHaveBeenCalledOnce();
    expect(run.request).toEqual(original);
    expect(
      JSON.parse(await readFile(path.join(workspace, "PROJECT_REQUEST.json"), "utf8")).request
        .speech,
    ).toMatchObject({ engine: "ming-tts", voice: "ming_xiaorou" });
    expect(
      JSON.parse(await readFile(path.join(workspace, "style-context.json"), "utf8")).request.speech,
    ).toMatchObject({ engine: "ming-tts" });
    expect(job.refinementSettings?.profiles[0].speech?.engine).toBe("ming-tts");
    expect(store.events(id, 0).filter((event) => event.type === "usage")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: job.id,
          data: expect.objectContaining({
            purpose: "Refinement settings",
            invocationId: "settings-fixture",
          }),
        }),
      ]),
    );
    await workflow.generate(run, job);
    expect(agentTurn).toHaveBeenCalledOnce();
  } finally {
    store.close();
    await rm(workspace, { recursive: true, force: true });
    vi.restoreAllMocks();
  }
});
