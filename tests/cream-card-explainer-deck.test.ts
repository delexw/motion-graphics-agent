import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import chroma from "chroma-js";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/server/catalog/catalog";
import { resolveTemplate } from "../src/server/domains/video/prompts";
import {
  motionGraphicTechnologyPool,
  projectRenderTechnologyPool,
} from "../src/shared/technology-pool";
import { validateExampleSvg } from "../src/server/catalog/style-examples";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const reviewFile = "assets/catalog/reviews/cream-card-explainer-deck.json";

describe("Cream Card Explainer Deck", () => {
  it("adds one authored style with reviewed visual and motion tools and no project pipelines", async () => {
    const catalog = await loadCatalog();
    const style = catalog.styles.find((entry) => entry.id === "style-143")!;
    const source = (await readJson("assets/catalog/video-style-catalog.json")).styles.find(
      (entry: { id: string }) => entry.id === "style-143",
    );
    expect(style).toMatchObject({
      name_en: "Cream Card Explainer Deck",
      category: "Motion Design and Cinematography",
      provenance: "authored",
    });
    expect(style.motion_references.candidates.map((entry) => entry.motion_id)).toEqual([
      "motion-026",
      "motion-012",
      "motion-030",
    ]);
    for (const rule of ["CHOREOGRAPHY AND MOTION DENSITY", "Panel dock", "Presenter character"])
      expect(style.executable_prompt_template).toContain(rule);
    const keys: string[] = source.tech.recommended_stack_keys;
    expect(keys).toEqual(["svg", "html_css", "gsap", "chroma_js"]);
    expect(keys.every((key) => Object.hasOwn(motionGraphicTechnologyPool, key))).toBe(true);
    expect(keys.some((key) => Object.hasOwn(projectRenderTechnologyPool, key))).toBe(false);
    expect(source.tech.technology_review).toMatchObject({
      model: "claude-opus-5-5",
      poolEntriesAssessed: Object.keys(motionGraphicTechnologyPool).length,
    });
    for (const text of [style.executable_prompt_template, style.tech.implementation])
      expect(text).not.toMatch(/HyperFrames|Multiplane|Remotion/);
    expect(style.executable_prompt_template).toContain("{{render_pipeline}}");
  });

  it("keeps the observed palette roles readable and project-independent", async () => {
    const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-143")!;
    const { tokens } = style.palette;
    expect(tokens.background).toBe("#f9efde");
    expect(chroma.contrast(tokens.foreground, tokens.background)).toBeGreaterThanOrEqual(7);
    for (const ground of [tokens.background, tokens.card_white])
      expect(chroma.contrast(tokens.accent_green, ground)).toBeGreaterThanOrEqual(3);
    const reusable = JSON.stringify([
      style.visual_cues,
      style.executable_prompt_template,
      style.palette,
      style.audio_direction,
    ]);
    expect(reusable).not.toMatch(/compass|envato|tuts\+|hackathon|bedrock|haiku/i);
  });

  it("records the exact template, bindings and Opus authorship used for the preview", async () => {
    const style = (await loadCatalog()).styles.find((entry) => entry.id === "style-143")!;
    const review = await readJson(reviewFile);
    expect(review.previewInputs).toHaveLength(1);
    const [input] = review.previewInputs;
    expect(input).toMatchObject({
      entryId: "style-143",
      model: "claude-opus-5-5",
      additionalVisualBrief: false,
    });
    expect(sha256(style.executable_prompt_template)).toBe(input.templateSha256);
    const resolved = resolveTemplate(style.executable_prompt_template, input.variables);
    expect(resolved).not.toMatch(/\{\{\w+\}\}/);
    expect(sha256(resolved)).toBe(input.resolvedPromptSha256);
    expect(review.technology_review.review.assessments).toHaveLength(
      Object.keys(motionGraphicTechnologyPool).length,
    );
  });

  it("publishes a deterministic preview source, its poster and video record", async () => {
    const review = await readJson(reviewFile);
    const fidelity = review.visualFidelity["style-143"];
    const source = await readFile("assets/style-previews/sources/style-143/index.html", "utf8");
    const poster = await readFile("assets/style-previews/sources/style-143/poster.svg", "utf8");
    const video = (await readJson("assets/style-previews/videos.json")).find(
      (entry: { styleId: string }) => entry.styleId === "style-143",
    );
    const art = (await readJson("assets/style-art/manifest.json")).find(
      (entry: { styleId: string }) => entry.styleId === "style-143",
    );
    expect(sha256(source)).toBe(fidelity.sourceSha256);
    expect(video).toMatchObject({
      sourceHash: fidelity.sourceSha256,
      video: "style-143.webm",
      duration: 3,
      reviewed: true,
      model: "claude-opus-5-5",
    });
    expect(art).toMatchObject({ status: "ready", provider: "claude", model: "claude-opus-5-5" });
    expect(await readFile("assets/style-art/style-143.svg", "utf8")).toBe(poster);
    expect(() => validateExampleSvg(poster)).not.toThrow();
    const authored = source.split('<script id="arrow-drawing-runtime">')[0];
    expect(authored).toContain('data-composition-id="cream-card-explainer-deck"');
    expect(authored).toContain("window.exportPoster");
    expect(authored).not.toMatch(
      /Math\.random|setTimeout|setInterval|requestAnimationFrame|Date\.now|performance\.now|https?:\/\/(?!www\.w3\.org\/2000\/svg)/,
    );
    for (const copy of [
      ">An idea</text>",
      ">becomes</text>",
      "connected system</tspan>",
      "link · system",
    ])
      expect(authored.split(copy)).toHaveLength(2);
  });

  it("uses the catalog's shared preview subject and copy", async () => {
    const review = await readJson(reviewFile);
    const [input] = review.previewInputs;
    expect(input.variables.subject).toContain("an idea becomes a connected system");
    for (const copy of [
      "'An idea'",
      "'becomes'",
      "'a connected system'",
      "'Idea', 'Links', 'System'",
    ])
      expect(input.variables.assets_and_exact_copy).toContain(copy);
    expect(review.content_convention.other_previews_modified).toBe(false);
    expect(review.supersededVisualFidelity.at(-1)).toMatchObject({
      revision: "r1",
      approved: false,
    });
  });

  it("changes visibly through the hook, the dock and the diagram in the published video", () => {
    const frame = (time: number) =>
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-ss",
        String(time),
        "-i",
        "assets/style-previews/style-143.webm",
        "-frames:v",
        "1",
        "-vf",
        "scale=160:90",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-",
      ]);
    const changed = (a: Buffer, b: Buffer) =>
      a.reduce((count, value, index) => count + (Math.abs(value - b[index]) > 12 ? 1 : 0), 0) /
      a.length;
    const times = [0.1, 0.5, 0.9, 1.25, 1.6, 2.0, 2.35, 2.9];
    const frames = times.map(frame);
    for (let index = 1; index < frames.length; index++)
      expect(
        changed(frames[index - 1], frames[index]),
        `${times[index - 1]}→${times[index]}`,
      ).toBeGreaterThan(0.003);
    expect(changed(frame(2.85), frame(2.97))).toBeLessThan(0.002);
  });
});
