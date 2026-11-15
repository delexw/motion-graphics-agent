import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomProject } from "../src/client/room/room-project";
import { expect, it } from "vitest";
import { RequestSchema, type Run } from "../src/shared/contracts";
import { projectReuseSource } from "../src/shared/project-reuse";

function reuseProjectFixture(): Run {
  return {
    id: "example-project",
    createdAt: "2026-01-01",
    phase: "ready",
    request: RequestSchema.parse({
      instructions: "Explain a small community bookshop",
      resolution: "1080p",
      frameRate: 30,
    }),
    candidates: [
      {
        id: "direction",
        primaryStyleId: "style-001",
        supportingStyleIds: [],
        sceneRoles: [],
        rationale: "Readable visual explanation",
        feasible: true,
        missingAssets: [],
        score: 90,
        confidence: 1,
        dimensions: {},
      },
    ],
    jobs: [
      {
        id: "full",
        runId: "example-project",
        candidateId: "direction",
        kind: "full",
        phase: "ready",
        model: "example-model",
        workspace: "/unused",
        duration: 20,
        video: "final.mp4",
        version: 3,
      },
    ],
  };
}
it("binds to the exact completed version and its local settings without changing the source", () => {
  const run = reuseProjectFixture();
  const job = run.jobs[0];
  if (job.outputType === "page") throw Error("Expected video");
  job.effectiveRequest = RequestSchema.parse({
    ...run.request,
    resolution: "1440p",
    frameRate: 60,
  }) as typeof run.request & { outputType: "video" };
  const before = JSON.stringify(run);
  const source = projectReuseSource(run, "full");
  expect(source?.version).toBe(3);
  expect(source?.request.resolution).toBe("1440p");
  expect(source?.hasVersionSettings).toBe(true);
  expect(JSON.stringify(run)).toBe(before);
});
it.each(["failed", "generating", "cancelled"] as const)(
  "does not expose unfinished %s results",
  (phase) => {
    const run = reuseProjectFixture();
    run.jobs[0].phase = phase;
    expect(projectReuseSource(run, "full")).toBeUndefined();
  },
);
it("does not inherit another project's job, previews, or missing videos", () => {
  const run = reuseProjectFixture();
  expect(projectReuseSource(run, "missing")).toBeUndefined();
  run.jobs[0].runId = "another-project";
  expect(projectReuseSource(run, "full")).toBeUndefined();
  run.jobs[0].runId = run.id;
  run.jobs[0].kind = "preview";
  expect(projectReuseSource(run, "full")).toBeUndefined();
  run.jobs[0].kind = "full";
  run.jobs[0].video = undefined;
  expect(projectReuseSource(run, "full")).toBeUndefined();
});
it("reports legacy fallback honestly and excludes HTML projects", () => {
  const run = reuseProjectFixture();
  expect(projectReuseSource(run, "full")?.hasVersionSettings).toBe(false);
  run.request = RequestSchema.parse({
    instructions: "Explain the idea as a page",
    outputType: "page",
  });
  expect(projectReuseSource(run, "full")).toBeUndefined();
});

it("direct builds show the full-film view without a Directions tab or preview selection prompt", () => {
  const run = reuseProjectFixture();
  run.request = RequestSchema.parse({
    ...run.request,
    selectedStyleIds: ["style-001"],
    candidateCount: 0,
  });
  run.jobs = [];
  const html = renderToStaticMarkup(
    createElement(RoomProject, {
      run,
      events: [],
      renderPreview: () => null,
      renderFull: () => null,
      controls: null,
      onQuestion: () => {},
      onUpdated: () => {},
      onEdit: () => {},
      onCancel: () => {},
      onRetry: () => {},
      view: { tab: "previews", refine: "" },
      onView: () => {},
    }),
  );
  expect(html).toContain("Full versions");
  expect(html).not.toContain(">Directions<");
  expect(html).not.toContain("Choose a direction to make the full version");
});
