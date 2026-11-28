import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { RequestSchema, type Run } from "../../src/shared/contracts";
import { ProjectSettings } from "../../src/client/components/project-settings";

function summary(settings: Record<string, unknown>) {
  const run: Run = {
    id: "project",
    createdAt: "2026-01-01T00:00:00Z",
    phase: "ready",
    jobs: [],
    candidates: [],
    request: RequestSchema.parse({ instructions: "Explain a useful idea", ...settings }),
  };
  return renderToStaticMarkup(
    <MemoryRouter>
      <ProjectSettings run={run} />
    </MemoryRouter>,
  );
}
const voice = { mode: "narration", engine: "kokoro", voice: "bf_isabella" };
const scriptItems = [0, 1].map((index) => ({
  id: `part-${index}`,
  startSeconds: index * 5,
  endSeconds: (index + 1) * 5,
  text: "Explain this topic",
  showSubtitles: true,
  speech: voice,
}));

it("shows saved timed-script provider and voice once even when global speech is off", () => {
  const html = summary({ speech: { mode: "off" }, scriptItems });
  expect(html.match(/Narration: Kokoro · Isabella/g)).toHaveLength(1);
});

it("shows each language's provider and voice from authoritative language settings", () => {
  const html = summary({
    scriptItems,
    languageTracks: {
      narration: [
        { language: "en", speech: voice },
        {
          language: "zh",
          speech: {
            mode: "narration",
            engine: "qwen3-tts-base",
            voice: "qwen_base_original_female",
            language: "zh",
          },
        },
      ],
      subtitles: ["en", "zh"],
    },
  });
  expect(html).toContain("Narration: English · Kokoro · Isabella");
  expect(html).toContain("Narration: 简体中文 · Ming-3.0-TTS · 0.5B · Neutral · Original narrator");
});

it("uses legacy global narration only when timed script and track settings are absent", () => {
  expect(summary({ speech: voice })).toContain("Narration: Kokoro · Isabella");
  expect(summary({ speech: voice, scriptItems: [] })).not.toContain("Narration:");
  expect(summary({ scriptItems, languageTracks: { narration: [], subtitles: [] } })).not.toContain(
    "Narration:",
  );
  expect(summary({ speech: { mode: "off" } })).not.toContain("Narration:");
  expect(summary({ outputType: "page" })).not.toContain("Narration:");
});

it("links a reused project's settings to its source and shows the recorded version", () => {
  const html = summary({
    projectReuse: {
      projectId: "example-source",
      jobId: "example-full",
      version: 2,
      operationId: "example-reuse",
      choices: {},
      styles: [],
    },
  });
  expect(html).toContain("Created from:");
  expect(html).toContain('aria-label="Source project"');
  expect(html).toContain("Source project · Version 2");
});

it("omits source provenance for an original project and avoids inventing an unknown version", () => {
  expect(summary({})).not.toContain("Created from:");
  const html = summary({
    projectReuse: {
      projectId: "example/source",
      jobId: "example-full",
      operationId: "example-reuse",
      choices: {},
      styles: [],
    },
  });
  expect(html).toContain('aria-label="Source project"');
  expect(html).toContain("Source project");
  expect(html).not.toContain("Version ");
});

it("shows adjustive effort as a plain setting chip", () => {
  expect(summary({ dynamicModelEffort: true })).toContain("<span>Adjustive effort: Yes</span>");
  expect(summary({})).toContain("<span>Adjustive effort: No</span>");
  expect(summary({ dynamicModelEffort: true })).not.toContain("combobox");
});

it("shows the music chip only from the selected music style setting", () => {
  const music = (value: Record<string, unknown>) =>
    summary({ requirements: { main: {}, images: {}, urls: {}, music: value } });
  expect(music({ style: "Bossa Nova" })).toContain("Music: Bossa Nova");
  expect(music({ instructions: "Bossa nova, about 3 minutes" })).not.toContain("Music:");
  expect(summary({})).not.toContain("Music:");
});

it("accepts only music styles from the picker list", () => {
  const parse = (style: string) =>
    RequestSchema.safeParse({
      instructions: "Explain a useful idea",
      requirements: { main: {}, images: {}, urls: {}, music: { style } },
    }).success;
  expect(parse("Bossa Nova")).toBe(true);
  expect(parse("bossa nova")).toBe(false);
  expect(parse("Smooth lounge")).toBe(false);
});
