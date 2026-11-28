import { combinedStyleGuideFixture } from "../fixtures/combined-style-guide";
import { writePreviewPlan } from "../../src/server/jobs/preview-plan";
import { executeInitialBuild } from "../../src/server/domains/video/execution/initial-build";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("../../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
vi.mock("../../src/server/jev/strategies/scene-background", () => ({
  selectSceneBackground: vi.fn(),
}));
import { agentTurn } from "../../src/server/agents/providers";
import { selectSceneBackground } from "../../src/server/jev/strategies/scene-background";
import {
  runAutomaticPreviewWorkflow,
  validateAutomaticPreviewPlan,
} from "../../src/server/jobs/subworkflows/automatic-preview/workflow";
import { RequestSchema, type StyleCandidate } from "../../src/shared/contracts";
import { VideoRequestSchema } from "../../src/shared/domains/video";
import { BriefSchema } from "../../src/shared/agents/schemas/video";
import { automaticPreviewResult } from "../fixtures/automatic-preview-plan";

const brief = BriefSchema.parse({
  subject: "A product",
  audience: "New users",
  objective: "Explain",
  facts: [],
  exactCopy: [],
  previewBeat: "A source becomes a result",
  assetDescriptions: [],
  constraints: [],
  suggestedDuration: 30,
  durationReason: "A short explanation",
});
const candidates: StyleCandidate[] = [0, 1].map((index) => ({
  id: `direction-${index}`,
  primaryStyleId: `style-00${index + 1}`,
  supportingStyleIds: [],
  sceneRoles: [],
  rationale: "Selected combination",
  feasible: true,
  missingAssets: [],
  score: index * 10,
  confidence: 0.7,
  dimensions: { relevance: 70 },
}));

it.each(
  (["claude", "codex"] as const).flatMap((provider) =>
    (["context", "creative", "random"] as const).map((preference) => ({ provider, preference })),
  ),
)(
  "$provider $preference plans all fixed directions in one independent call",
  async ({ provider, preference }) => {
    vi.mocked(agentTurn)
      .mockReset()
      .mockImplementation(async (call) => automaticPreviewResult(call.promptContext));
    const workspace = await mkdtemp(path.join(os.tmpdir(), "shared-preview-plan-"));
    const original = structuredClone(candidates);
    try {
      const request = RequestSchema.parse({
        instructions: "Explain a product",
        provider,
        preference,
        candidateCount: 2,
      });
      const result = await runAutomaticPreviewWorkflow({
        request,
        brief,
        candidates,
        styles: [],
        workspace,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      });
      expect(agentTurn).toHaveBeenCalledOnce();
      const call = vi.mocked(agentTurn).mock.calls[0][0];
      expect(call).toMatchObject({ provider, readOnly: true, includeCreativeAlternatives: false });
      expect(call.sessionId).toBeUndefined();
      expect(result.directions.map((direction) => direction.id)).toEqual(
        candidates.map((candidate) => candidate.id),
      );
      expect(candidates).toEqual(original);
      const guidance = await readFile(path.join(workspace, "PREVIEW_PLANNING.md"), "utf8");
      expect(guidance).toContain(
        "Keep every supplied direction ID and style combination unchanged",
      );
      expect(guidance).toContain("one representative three-second previewBeat");
      expect(guidance).not.toContain("### Scene backgrounds");
      expect(call.prompt.length).toBeLessThan(1200);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);

it("rejects missing, duplicate or invented direction IDs", () => {
  const plan = automaticPreviewResult({ brief, directions: candidates }).value;
  expect(() => validateAutomaticPreviewPlan(plan, candidates)).not.toThrow();
  for (const ids of [
    ["direction-0"],
    ["direction-0", "direction-0"],
    ["direction-0", "invented"],
  ]) {
    expect(() =>
      validateAutomaticPreviewPlan(
        { ...plan, directions: ids.map((id) => ({ ...plan.directions[0], id })) },
        candidates,
      ),
    ).toThrow("exactly once");
  }
});

it("does not start planning after caller cancellation", async () => {
  vi.mocked(agentTurn).mockReset();
  await expect(
    runAutomaticPreviewWorkflow({
      request: RequestSchema.parse({ instructions: "Explain a product" }),
      brief,
      candidates,
      styles: [],
      workspace: "unused",
      signal: AbortSignal.abort(),
      onEvent: vi.fn(),
    }),
  ).rejects.toThrow();
  expect(agentTurn).not.toHaveBeenCalled();
});

it("saves the planned 11 sections with their preview direction and hands them to authoring", async () => {
  vi.mocked(selectSceneBackground).mockResolvedValue("both");
  vi.mocked(agentTurn)
    .mockReset()
    .mockImplementation(async (call) => automaticPreviewResult(call.promptContext));
  const workspace = await mkdtemp(path.join(os.tmpdir(), "combined-preview-plan-"));
  const direction = { ...candidates[0], supportingStyleIds: ["style-002"] };
  try {
    const request = VideoRequestSchema.parse({
      instructions: "Explain the original product idea",
      duration: 60,
      aspectRatio: "9:16",
      resolution: "1440p",
      frameRate: 60,
      renderer: "multiplane",
      outputLanguage: "zh",
      subtitles: { mode: "provided", text: "保留原文。" },
      requirements: {
        main: {},
        images: {},
        urls: {},
        music: { instructions: "Requested film music" },
      },
    });
    const signal = new AbortController().signal;
    const plan = await runAutomaticPreviewWorkflow({
      request,
      brief,
      candidates: [direction],
      styles: [],
      workspace,
      signal,
      onEvent: vi.fn(),
    });
    const guidance = await readFile(path.join(workspace, "PREVIEW_PLANNING.md"), "utf8");
    expect(guidance).toContain("one project-specific combinedStyleGuide with all 11 sections");
    expect(guidance).toContain(
      `### Scene backgrounds for ${direction.id}\n\nAssign layered environments and clean backgrounds`,
    );
    expect(guidance).not.toContain("JEV");
    expect(selectSceneBackground).toHaveBeenCalledWith(
      expect.objectContaining({ previewCandidateIds: [direction.id] }),
    );
    const candidate = { ...direction, ...plan.directions[0] };
    expect(candidate.combinedStyleGuide).toEqual(combinedStyleGuideFixture);
    const savedPlan = await writePreviewPlan(workspace, brief, [candidate]);
    const savedDirection = JSON.parse(await readFile(savedPlan, "utf8"))
      .directions[0] as StyleCandidate;
    expect(savedDirection.combinedStyleGuide).toEqual(combinedStyleGuideFixture);
    expect(savedDirection.sceneBackgroundTreatment).toBe("both");
    const buildTurn = vi.fn();
    await executeInitialBuild({
      candidate: savedDirection,
      styles: [],
      planning: {
        request,
        job: {
          id: "test-preview",
          candidateId: direction.id,
          runId: "test-project",
          workspace,
          kind: "preview",
          phase: "generating",
          duration: 3,
          model: "claude-opus-5-5",
        },
        provider: "claude",
        prompt: "Build the preview from the supplied idea.",
        fps: 60,
        width: 720,
        height: 1280,
        signal,
        onEvent: vi.fn(),
        update: vi.fn(),
      },
      buildTurn,
    });
    expect(agentTurn).toHaveBeenCalledOnce();
    expect(buildTurn).toHaveBeenCalledOnce();
    const authoringPrompt = buildTurn.mock.calls[0][0];
    const [guide, references] = authoringPrompt.split("# Supporting references");
    expect(guide).toMatch(/^# Video build guide/);
    expect(guide.match(/^## .+$/gm)).toEqual(
      Object.keys(combinedStyleGuideFixture).map((heading) => `## ${heading}`),
    );
    expect(guide).toContain(combinedStyleGuideFixture["Visual identity"]);
    expect(guide).toContain(
      '## Sound options\nEffective settings for this build: {"audio":"silent","narration":"off","music":"off","effects":"off"}',
    );
    expect(guide).toContain(
      '## Lettering and captions\nEffective settings for this build: {"videoLanguage":"zh","subtitlesEnabled":true,"subtitleSettings":{"mode":"provided","text":"保留原文。"}}',
    );
    expect(guide).toContain(
      '## Timing and movement\nEffective settings for this build: {"durationSeconds":3}',
    );
    expect(guide).toContain(
      '## Implementation tools\nEffective settings for this build: {"renderer":"multiplane","compositionPipeline":"Multiplane"}',
    );
    expect(guide).toContain(
      '## Project choices\nEffective settings for this build: {"aspectRatio":"9:16","resolution":"720p","width":720,"height":1280,"fps":60}',
    );
    expect(authoringPrompt).not.toContain("Requested film music");
    expect(authoringPrompt).not.toContain(request.instructions);
    expect(references).toContain("VIDEO_REQUIREMENTS.md");
    expect(references).toContain("PREVIEW_PLAN.json");
    expect(references).toContain("STORYBOARD.json");
    expect(await readFile(path.join(workspace, "EXECUTABLE_PROMPT.md"), "utf8")).toBe(
      authoringPrompt,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
