import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { loadCatalog } from "../src/server/catalog/catalog";
import {
  examplesFolder,
  publishExample,
  readExampleRecords,
  validateExamplePalette,
  writeExampleRecords,
} from "../src/server/catalog/style-examples";
import { videoRendererOf, videoRenderers } from "../src/shared/video-renderers";

/**
 * Publishes a hand-authored Motion Graphic preview (index.html + local gsap.min.js) for one style.
 * The poster comes only from the page's own window.exportPoster(time); the clip is rendered with the
 * project's default renderer setting, never a per-style pipeline choice.
 */
export const previewDuration = 3;

export async function exportPosterSvg(indexHtml: string, time: number) {
  const browser = await chromium.launch({ executablePath: process.env.VIDEO_BROWSER_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`file://${indexHtml}`);
    const svg = await page.evaluate(
      (t) => (window as unknown as { exportPoster: (t: number) => string }).exportPoster(t),
      time,
    );
    if (errors.length) throw Error(`Preview page errors: ${errors.join("; ")}`);
    return svg;
  } finally {
    await browser.close();
  }
}

export async function publishAuthoredStylePreview(options: {
  styleId: string;
  source: string;
  authorModel: string;
  designNotes: string;
  posterTime: number;
}) {
  const catalog = await loadCatalog();
  const style = catalog.styles.find((entry) => entry.id === options.styleId);
  if (!style) throw Error(`Unknown Motion Graphic: ${options.styleId}`);
  const workspace = path.join(examplesFolder, "video-projects", style.id);
  await mkdir(workspace, { recursive: true });
  await copyFile(path.join(options.source, "index.html"), path.join(workspace, "index.html"));
  await copyFile(
    path.resolve("node_modules/gsap/dist/gsap.min.js"),
    path.join(workspace, "gsap.min.js"),
  );
  const svg = await exportPosterSvg(path.join(workspace, "index.html"), options.posterTime);
  await validateExamplePalette(svg, style);
  await writeFile(path.join(workspace, "poster.svg"), svg);
  const record = await publishExample(
    { styleId: style.id, svg, designNotes: options.designNotes },
    {
      styleId: style.id,
      catalogHash: catalog.hash,
      thumbnail: "",
      status: "ready",
      provider: "claude",
      model: options.authorModel,
    },
  );
  await writeExampleRecords([
    ...(await readExampleRecords()).filter((entry) => entry.styleId !== style.id),
    record,
  ]);

  const [{ renderJob }, { verifyVisibleMotion }, motion, assets, { illustrationMotionRevision }] =
    await Promise.all([
      import("../src/server/rendering/render"),
      import("../src/server/motion/motion-visibility"),
      import("../src/server/catalog/style-motion"),
      import("../src/server/catalog/style-preview-assets"),
      import("../src/server/motion/illustration-motion"),
    ]);
  const signal = new AbortController().signal;
  const started = Date.now();
  const output = await renderJob(
    {
      id: style.id,
      runId: "style-examples",
      candidateId: style.id,
      kind: "preview",
      phase: "rendering",
      workspace,
      model: options.authorModel,
      duration: previewDuration,
    },
    {
      pipeline: videoRenderers[videoRendererOf({})].pipeline,
      fallbackReason: null,
      styleRenderer: style.tech.style_renderer.recommended_stack_refs,
      motionEngine: style.tech.motion_engine.recommended_stack_refs,
      sourceFile: "index.html",
      duration: previewDuration,
      width: 1280,
      height: 720,
      audioDescription: "Silent",
      limitations: [
        "Hand-authored style study with neutral sample copy; production content comes from the project. Not reference footage.",
      ],
    },
    signal,
    (type, message) => console.log(`${type}: ${message}`),
  );
  const rendered = path.join(workspace, output.video);
  const visibleChangeRatio = await verifyVisibleMotion(rendered, signal);
  const video = style.id + path.extname(output.video);
  await mkdir(assets.stylePreviewVideoFolder, { recursive: true });
  await copyFile(rendered, path.join(assets.stylePreviewVideoFolder, video));
  await assets.publishStylePreviewSource(workspace, style.id);
  const publishedSource = await readFile(
    path.join(assets.stylePreviewSourceFolder, style.id, "index.html"),
    "utf8",
  );
  const sourceHash = createHash("sha256").update(publishedSource).digest("hex");
  await motion.writeStyleVideos([
    ...(await motion.readStyleVideos()).filter((entry) => entry.styleId !== style.id),
    {
      styleId: style.id,
      catalogHash: catalog.hash,
      sourceHash,
      video,
      duration: previewDuration,
      generatedAt: new Date().toISOString(),
      renderMs: Date.now() - started,
      reviewed: true,
      motionRevision: illustrationMotionRevision,
      visibleChangeRatio,
      model: options.authorModel,
    },
  ]);
  return { video, visibleChangeRatio, sourceHash, rendered };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "author-model": { type: "string" },
      notes: { type: "string" },
      "poster-time": { type: "string", default: "2.95" },
    },
  });
  const [styleId, source] = positionals;
  if (!styleId || !source || !values["author-model"] || !values.notes)
    throw Error(
      "Usage: publish-authored-style-preview.ts <style-id> <source-folder> --author-model <id> --notes <text> [--poster-time <s>]",
    );
  console.log(
    await publishAuthoredStylePreview({
      styleId,
      source: path.resolve(source),
      authorModel: values["author-model"],
      designNotes: values.notes,
      posterTime: Number(values["poster-time"]),
    }),
  );
}
