import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { agentTurn } from "../../src/server/agents/providers";
import { generateVideo } from "../../src/server/domains/video/workflow";
import { projectGovernance } from "../../src/server/governance/report";
import { loadCatalog } from "../../src/server/catalog/catalog";
import {
  BriefSchema,
  VideoRequestSchema,
  type VideoGenerationJob,
} from "../../src/shared/domains/video";
import { sceneBackgroundPurpose } from "../../src/shared/agents/scene-background";
import type { AgentProgressEvent, Run, StyleCandidate } from "../../src/shared/contracts";
import { validPlannedStoryboard } from "../fixtures/storyboard";

const { systemOne } = vi.hoisted(() => ({ systemOne: vi.fn() }));
vi.mock("../../src/server/jev/client", () => ({
  jevModel: "jev-1.14.0",
  jevClient: () => ({ systemOne }),
}));
vi.mock("../../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
afterEach(() => {
  systemOne.mockReset();
  vi.mocked(agentTurn).mockReset();
});

const backgroundInstructions = {
  required: "Design detailed, layered backgrounds",
  not_required: "Keep backgrounds simple",
  both: "Assign layered environments and clean backgrounds",
};

it.each([
  ["full", "required"],
  ["full", "not_required"],
  ["full", "both"],
  ["preview", "both"],
  ["full", "invalid"],
  ["full", "unavailable"],
  ["full", "cancelled"],
  ["full", "retry"],
] as const)(
  "passes only the %s job's selected treatment (%s) to Plan and production",
  async (kind, choice) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "video-background-"));
    try {
      const request = VideoRequestSchema.parse({
        instructions: "Show a visitor entering a garden.",
        duration: 30,
      });
      const candidate: StyleCandidate = {
        id: "direction",
        primaryStyleId: "style-001",
        supportingStyleIds: [],
        sceneRoles: ["Reveal the garden from the doorway"],
        sceneBackgroundTreatment: kind === "preview" ? "both" : undefined,
        rationale: "Show the change in setting",
        feasible: true,
        missingAssets: [],
        score: 1,
        confidence: 1,
        dimensions: {},
      };
      const brief = BriefSchema.parse({
        subject: "A garden",
        audience: "Visitors",
        objective: "Show the entrance",
        facts: [],
        exactCopy: [],
        previewBeat: "The garden appears",
        assetDescriptions: [],
        constraints: [],
        suggestedDuration: 30,
        durationReason: "One opening",
      });
      const job: VideoGenerationJob = {
        id: "job",
        runId: "project",
        candidateId: candidate.id,
        kind,
        phase: "generating",
        workspace,
        duration: kind === "full" ? 30 : 3,
        model: "test-model",
      };
      const run: Run = {
        id: job.runId,
        request,
        phase: "generating",
        createdAt: "2026-11-27T00:00:00Z",
        jobs: [job],
        candidates: [candidate],
      };
      const events: AgentProgressEvent[] = [];
      let selected =
        choice === "required" || choice === "not_required" || choice === "both"
          ? choice
          : undefined;
      const controller = new AbortController();
      const cancelReason = Error("Fixture project cancelled");
      const checkGuidance = (prompt: string) => {
        for (const [option, instruction] of Object.entries(backgroundInstructions))
          expect(prompt.includes(instruction)).toBe(option === selected);
        expect(prompt).not.toContain("JEV");
      };
      systemOne.mockImplementation(async (payload) => {
        expect(payload.state).toMatchObject({
          originalIdea: request.instructions,
          scope: kind,
          styles: [{ name: "International Typographic Style (Swiss Style)" }],
        });
        expect(payload.state.previewBeat).toBe(kind === "preview" ? brief.previewBeat : undefined);
        expect(Object.keys(payload.questions.background.criteria)).toEqual(
          Object.keys(backgroundInstructions),
        );
        if (choice === "unavailable" || (choice === "retry" && !selected))
          throw Error("Fixture service unavailable");
        if (choice === "cancelled") {
          controller.abort(cancelReason);
          throw cancelReason;
        }
        return {
          model: "jev-1.14.0",
          answers: {
            background: {
              type: "choice",
              choice: choice === "retry" ? selected : choice,
              confidence: 1,
              probabilities: { required: 0.2, not_required: 0.2, both: 0.6 },
            },
          },
          usage: { input_tokens: 100, output_tokens: 10 },
        };
      });
      const buildSentinel = Error("Fixture reached authoring");
      vi.mocked(agentTurn).mockImplementation(async (call) => {
        expect(
          kind === "preview" ? candidate.sceneBackgroundTreatment : job.sceneBackgroundTreatment,
        ).toBe(selected);
        if (call.effortTask === "planning") {
          expect(systemOne).toHaveBeenCalledTimes(choice === "retry" && selected ? 2 : 1);
          const guide = await readFile(path.join(workspace, "VIDEO_PLANNING_GUIDANCE.md"), "utf8");
          checkGuidance(guide);
          if (selected)
            expect(guide.indexOf("### Scene backgrounds")).toBeLessThan(
              guide.indexOf("FULL-FILM SHOT BREAKDOWN"),
            );
          expect(
            await readFile(path.join(workspace, "VIDEO_REQUIREMENTS.md"), "utf8"),
          ).not.toContain("### Scene backgrounds");
          return {
            sessionId: "fixture-plan",
            value: {
              version: 2,
              width: 1920,
              height: 1080,
              fps: 30,
              durationSeconds: 30,
              storyboard: validPlannedStoryboard(30),
              capturePlan: null,
              plan: "A visitor walks into the garden.",
            },
          };
        }
        checkGuidance(await readFile(path.join(workspace, "VIDEO_REQUIREMENTS.md"), "utf8"));
        expect(call.prompt).toContain("VIDEO_REQUIREMENTS.md");
        throw buildSentinel;
      });
      const options = {
        job,
        request,
        brief,
        candidate,
        styles: (await loadCatalog()).styles,
        signal: controller.signal,
        update: vi.fn(),
        onEvent: (event: Omit<AgentProgressEvent, "id" | "runId" | "jobId" | "time">) =>
          events.push({
            ...event,
            id: events.length + 1,
            runId: run.id,
            jobId: job.id,
            time: run.createdAt,
          }),
        emit: vi.fn(),
        render: vi.fn(),
      };
      await expect(generateVideo(options)).rejects.toBe(
        choice === "cancelled" ? cancelReason : buildSentinel,
      );
      if (choice === "cancelled") expect(agentTurn).not.toHaveBeenCalled();
      if (choice === "retry") {
        expect(job.buildPlan?.value).toBeDefined();
        expect(job.buildPlan?.sceneBackgroundTreatment).toBeUndefined();
        selected = "both";
        await expect(generateVideo(options)).rejects.toBe(buildSentinel);
        expect(job.buildPlan?.sceneBackgroundTreatment).toBe("both");
        expect(
          vi.mocked(agentTurn).mock.calls.filter(([call]) => call.effortTask === "planning"),
        ).toHaveLength(2);
      }
      if (selected) await expect(generateVideo(options)).rejects.toBe(buildSentinel);
      expect(systemOne).toHaveBeenCalledTimes(kind === "preview" ? 0 : choice === "retry" ? 2 : 1);
      const row = projectGovernance(run, events).activity.find(
        ({ purpose }) => purpose === sceneBackgroundPurpose,
      );
      if (kind === "preview") {
        expect(row).toBeUndefined();
        return;
      }
      expect(row).toMatchObject({
        calls: choice === "retry" ? 2 : 1,
        inputTokens: choice === "unavailable" || choice === "cancelled" ? null : 100,
      });
      if (choice === "retry")
        expect(row?.jevCalls?.map((call) => call.status)).toEqual(["failed", "recorded"]);
      expect(row?.jevCalls?.slice(-1)).toMatchObject([
        {
          status: selected ? "recorded" : choice === "cancelled" ? "cancelled" : "failed",
          promptUrl: expect.any(String),
        },
      ]);
      expect(row?.jevCalls?.at(-1)?.backgroundTreatment).toBe(selected);
      expect(row?.jevCalls?.at(-1)?.backgroundTarget).toMatchObject({ kind: "full", version: 1 });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
);
