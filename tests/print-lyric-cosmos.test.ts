import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { resolveTemplate } from "../src/server/domains/video/prompts";
import { motionGraphicTechnologyPool } from "../src/shared/technology-pool";
import { drawMotionPreview, supportedMotionIds } from "../src/client/motion-drawing";
import { DURATION, LINES, stateAt } from "../src/client/motion-previews/motion-050";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

describe("Printed Spark Collage", () => {
  it("adds one print style and a distinct token relay without selecting project pipelines", async () => {
    const catalog = await loadCatalog();
    const style = catalog.styles.find((entry) => entry.id === "style-142")!;
    const source = JSON.parse(
      await readFile("assets/catalog/video-style-catalog.json", "utf8"),
    ).styles.find((entry: { id: string }) => entry.id === "style-142")!;
    const tech = source.tech as {
      recommended_stack_keys: string[];
      technology_review: { model: string; poolEntriesAssessed: number };
    };
    expect(style.name_en).toBe("Printed Spark Collage");
    expect(style.motion_references.candidates.map((entry) => entry.motion_id)).toEqual([
      "motion-050",
    ]);
    expect(
      tech.recommended_stack_keys.every((key) => Object.hasOwn(motionGraphicTechnologyPool, key)),
    ).toBe(true);
    expect(tech.technology_review).toMatchObject({
      model: "claude-opus-5-5",
      poolEntriesAssessed: Object.keys(motionGraphicTechnologyPool).length,
    });
    expect(catalog.motions.filter((entry) => entry.id === "motion-050")).toHaveLength(1);
    expect(supportedMotionIds).toContain("motion-050");
  });

  it("uses the exact catalog templates and explicit bindings for both Opus authoring inputs", async () => {
    const catalog = await loadCatalog();
    const review = JSON.parse(
      await readFile("assets/catalog/reviews/offset-halftone-lyric-cosmos.json", "utf8"),
    );
    expect(review.previewInputs).toHaveLength(2);
    for (const input of review.previewInputs) {
      const template =
        input.entryId === "style-142"
          ? catalog.styles.find((entry) => entry.id === input.entryId)!.executable_prompt_template
          : catalog.motions.find((entry) => entry.id === input.entryId)!.executable_prompt_template;
      expect(sha256(template)).toBe(input.templateSha256);
      const resolved = resolveTemplate(template, input.variables);
      expect(resolved).not.toMatch(/\{\{\w+\}\}/);
      expect(sha256(resolved)).toBe(input.resolvedPromptSha256);
      expect(input.model).toBe("claude-opus-5-5");
      expect(input.additionalVisualBrief).toBe(false);
    }
  });

  it("publishes the r2 Opus preview from the reviewed exact-input source", async () => {
    const review = JSON.parse(
      await readFile("assets/catalog/reviews/offset-halftone-lyric-cosmos.json", "utf8"),
    );
    const fidelity = review.visualFidelity["style-142"];
    const videos = JSON.parse(await readFile("assets/style-previews/videos.json", "utf8"));
    const video = videos.find((entry: { styleId: string }) => entry.styleId === "style-142");
    const source = await readFile("assets/style-previews/sources/style-142/index.html", "utf8");
    expect(fidelity).toMatchObject({ revision: "r2", sourceEquivalence: false });
    expect(sha256(source)).toBe(fidelity.sourceSha256);
    expect(video).toMatchObject({ sourceHash: fidelity.sourceSha256, model: "claude-opus-5-5" });
  });
});

describe("Boxed-Word Active Relay", () => {
  it("keeps the supplied words fixed within each line and bounds all time queries", () => {
    expect(stateAt(-1)).toEqual(stateAt(0));
    expect(stateAt(DURATION + 1)).toEqual(stateAt(DURATION));
    expect(stateAt(Number.NaN)).toEqual(stateAt(0));
    const first = stateAt(0);
    expect(first.tokens.map((token) => token.word)).toEqual(LINES.flat());
    expect(first.tokens.every((token) => token.state === "upcoming")).toBe(true);
    for (const time of [0.43, 1.08, 1.8, 2.6, 3.5, 4.5, 6])
      expect(stateAt(time).tokens.map((token) => token.localBox)).toEqual(
        first.tokens.map((token) => token.localBox),
      );
  });

  it("allows a short adjacent-word overlap, then hands off to one smaller history line", () => {
    expect(
      stateAt(1.08)
        .tokens.filter((token) => token.state === "active")
        .map((token) => token.word),
    ).toEqual(["TURN", "ONE"]);
    expect(stateAt(1.4).tokens.find((token) => token.word === "TURN")).toMatchObject({
      state: "completed",
      fillOpacity: 0,
    });
    expect(stateAt(2.6).history!.scale).toBeGreaterThan(0.4);
    expect(stateAt(2.6).history!.scale).toBeLessThan(1);
    const end = stateAt(DURATION);
    expect(end.main).toMatchObject({ lineIndex: 1, scale: 1, opacity: 1 });
    expect(end.history).toMatchObject({ lineIndex: 0, scale: 0.4, opacity: 1 });
    expect(
      end.tokens.every((token) => token.state === "completed" && token.fillOpacity === 0),
    ).toBe(true);
  });

  it("reproduces actual Canvas pixels after out-of-order seeks", () => {
    const canvas = createCanvas(640, 360);
    const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    const frame = (time: number) => {
      drawMotionPreview(context, "motion-050", time);
      return canvas.toBuffer("image/png");
    };
    const middle = frame(3.5);
    expect(frame(0).equals(middle)).toBe(false);
    expect(frame(6).equals(middle)).toBe(false);
    expect(frame(3.5).equals(middle)).toBe(true);
    frame(1.08);
    expect(frame(3.5).equals(middle)).toBe(true);
  });
});
