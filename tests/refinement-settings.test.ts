import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../src/server/agents/providers", () => ({ agentTurn: vi.fn() }));
import { agentTurn } from "../src/server/agents/providers";
import { resolveRefinementSettings } from "../src/server/jobs/subworkflows/refinement-settings/workflow";
import { VideoRequestSchema } from "../src/shared/domains/video";
import { SpeechSettingsSchema } from "../src/shared/speech";
import { individualLanguageTracks } from "../src/shared/language-tracks";
import {
  RefinementSettingsPlanSchema,
  applyRefinementSettings,
  type RefinementSettingsPlan,
} from "../src/shared/refinement-settings";
import { workspacePaths } from "../src/server/runtime/workspace";
import { VideoVersionSettings } from "../src/client/components/video-version-settings";

const folders: string[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});
const userPrompt = "use Ming TTS Chinese female";
const plan: RefinementSettingsPlan = {
  version: 1,
  profiles: [
    {
      language: "zh",
      sourceQuote: userPrompt,
      speech: { engine: "ming-tts", voice: "ming_xiaorou" },
    },
  ],
  delivery: null,
  unsupported: [],
};
function request() {
  const chinese = SpeechSettingsSchema.options[1].parse({
    mode: "narration",
    engine: "kokoro",
    voice: "zf_xiaobei",
    language: "zh",
    followVideoLanguage: false,
    speed: 1.1,
    volume: 0.8,
    source: "provided",
    text: "保留原文",
  });
  const english = SpeechSettingsSchema.options[1].parse({
    mode: "narration",
    engine: "kokoro",
    voice: "af_heart",
    language: "en",
  });
  const tracks = individualLanguageTracks({}, [
    { language: "zh", generateNarration: true, showSubtitles: true, speech: chinese },
    { language: "en", generateNarration: false, showSubtitles: false, speech: english },
  ]);
  return VideoRequestSchema.parse({
    instructions: "An example illustrated story",
    provider: "claude",
    outputLanguage: "zh",
    aspectRatio: "16:9",
    resolution: "1440p",
    frameRate: 60,
    duration: 20,
    renderer: "multiplane",
    speech: chinese,
    languageTracks: tracks,
    subtitles: { mode: "provided", text: "保留原文" },
  });
}
it("changes engines in one version while retaining text, speed, volume, other languages and the original request", () => {
  const original = request();
  const before = structuredClone(original);
  const changed = applyRefinementSettings(original, plan, userPrompt);
  expect(original).toEqual(before);
  expect(changed.speech).toMatchObject({
    engine: "ming-tts",
    voice: "ming_xiaorou",
    speed: 1.1,
    volume: 0.8,
    text: "保留原文",
  });
  expect(changed.languageTracks?.narration[0].speech).toEqual(
    changed.languageTracks?.languages?.[0].speech,
  );
  expect(changed.languageTracks?.languages?.[1]).toEqual(original.languageTracks?.languages?.[1]);
  expect(changed.subtitles).toEqual(original.subtitles);
  expect(changed.renderer).toBe("multiplane");
  expect(changed.frameRate).toBe(60);
});
it("does not introduce unrelated defaults into a patch", () => {
  const parsed = RefinementSettingsPlanSchema.parse(plan);
  expect(parsed.profiles[0].speech).toEqual({ engine: "ming-tts", voice: "ming_xiaorou" });
  expect(
    applyRefinementSettings(
      request(),
      { version: 1, profiles: [], delivery: null, unsupported: [] },
      "Larger heading",
    ),
  ).toEqual(request());
});
it("supports explicit output changes without mutating voice or the source version", () => {
  const original = request();
  const result = applyRefinementSettings(
    original,
    {
      version: 1,
      profiles: [],
      delivery: {
        sourceQuote: "portrait 30 fps",
        settings: { aspectRatio: "9:16", frameRate: 30 },
      },
      unsupported: [],
    },
    "portrait 30 fps",
  );
  expect(result.aspectRatio).toBe("9:16");
  expect(result.frameRate).toBe(30);
  expect(result.speech).toEqual(original.speech);
  expect(result.duration).toBe(20);
  expect(original.aspectRatio).toBe("16:9");
});
it("keeps narration and subtitles independent per language", () => {
  const changed = applyRefinementSettings(
    request(),
    {
      ...plan,
      profiles: [{ language: "zh", sourceQuote: "hide Chinese captions", showSubtitles: false }],
    },
    "hide Chinese captions",
  );
  expect(changed.speech?.mode).toBe("narration");
  expect(changed.subtitles).toEqual({ mode: "off" });
  expect(changed.languageTracks?.languages?.[1].generateNarration).toBe(false);
  const silent = applyRefinementSettings(
    request(),
    { ...plan, profiles: [{ language: "zh", sourceQuote: "no voice", generateNarration: false }] },
    "no voice",
  );
  expect(silent.speech).toEqual({ mode: "off" });
  expect(silent.languageTracks?.subtitles).toEqual(["zh"]);
  expect(silent.languageTracks?.languages?.[0].speech.voice).toBe("zf_xiaobei");
});
it("rejects fabricated source quotes, unknown voices and incompatible engine/voice pairs", () => {
  expect(() => applyRefinementSettings(request(), plan, "Make the cat larger")).toThrow(
    "actual request",
  );
  expect(() =>
    applyRefinementSettings(
      request(),
      {
        ...plan,
        profiles: [{ ...plan.profiles[0], speech: { engine: "ming-tts", voice: "zf_xiaobei" } }],
      },
      userPrompt,
    ),
  ).toThrow();
  expect(() =>
    applyRefinementSettings(
      request(),
      { ...plan, profiles: [{ ...plan.profiles[0], speech: { voice: "nonexistent" } }] },
      userPrompt,
    ),
  ).toThrow();
  expect(() =>
    RefinementSettingsPlanSchema.parse({
      ...plan,
      delivery: { sourceQuote: "anything", settings: { renderer: "other" } },
    }),
  ).toThrow();
});
it("persists disabled language profiles without enabling them on voice-only edits", () => {
  const original = request();
  const changed = applyRefinementSettings(
    original,
    {
      ...plan,
      profiles: [
        {
          language: "en",
          sourceQuote: "English Ming",
          speech: { engine: "ming-tts", voice: "ming_xiaorou" },
        },
      ],
    },
    "English Ming",
  );
  expect(changed.languageTracks?.languages?.[1]).toMatchObject({
    generateNarration: false,
    showSubtitles: false,
    speech: { engine: "ming-tts" },
  });
  expect(changed.speech).toEqual(original.speech);
});
it.each(["claude", "codex"] as const)(
  "uses a governed, tool-free %s main-model settings call and saves its validated handoff",
  async (provider) => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "refinement-settings-"));
    folders.push(workspace);
    const onEvent = vi.fn();
    vi.mocked(agentTurn).mockImplementation(async (options) => {
      options.onEvent({
        type: "invocation",
        message: "Fixture settings call",
        data: { invocationId: "fixture-call" },
      });
      options.onEvent({
        type: "usage",
        message: "",
        data: { input_tokens: 10, output_tokens: 4, cost_usd: 0.001 },
      });
      return { value: plan };
    });
    const original = { ...request(), provider };
    const resolved = await resolveRefinementSettings({
      request: original,
      prompt: userPrompt,
      model: "selected-model",
      workspace,
      signal: new AbortController().signal,
      onEvent,
    });
    expect(agentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider,
        model: "selected-model",
        readOnly: true,
        textOnly: true,
      }),
    );
    expect(
      JSON.parse(vi.mocked(agentTurn).mock.calls[0][0].prompt)
        .providers.find((engine: { id: string }) => engine.id === "ming-tts")
        .voices.some((voice: { id: string }) => voice.id === "ming_xiaorou"),
    ).toBe(true);
    expect(resolved.effectiveRequest.speech).toMatchObject({ engine: "ming-tts" });
    expect(original.speech?.mode === "narration" && original.speech.engine).toBe("kokoro");
    expect(
      JSON.parse(
        await readFile(
          path.join(workspace, workspacePaths(workspace).diagnostics, "REFINEMENT_SETTINGS.json"),
          "utf8",
        ),
      ).plan,
    ).toEqual(plan);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "usage" }));
  },
);
it("rejects malformed model output and cancellation without accepting a settings patch", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "refinement-invalid-"));
  folders.push(workspace);
  vi.mocked(agentTurn).mockResolvedValue({
    value: { ...plan, profiles: [{ ...plan.profiles[0], sourceQuote: "invented quote" }] },
  });
  const input = {
    request: request(),
    prompt: userPrompt,
    model: "selected-model",
    workspace,
    signal: new AbortController().signal,
    onEvent: vi.fn(),
  };
  await expect(resolveRefinementSettings(input)).rejects.toThrow();
  vi.clearAllMocks();
  const controller = new AbortController();
  controller.abort(Error("cancelled"));
  await expect(resolveRefinementSettings({ ...input, signal: controller.signal })).rejects.toThrow(
    "cancelled",
  );
  expect(agentTurn).not.toHaveBeenCalled();
});
it("shows the selected version's actual voice instead of the project's original voice", () => {
  const original = request();
  const effective = applyRefinementSettings(original, plan, userPrompt);
  const html = renderToStaticMarkup(
    createElement(VideoVersionSettings, {
      request: original,
      job: {
        id: "version",
        runId: "example",
        candidateId: "example",
        kind: "full",
        phase: "ready",
        workspace: "/example",
        model: "selected-model",
        duration: 20,
        effectiveRequest: effective,
      },
    }),
  );
  expect(html).toContain("Ming-3.0-TTS");
  expect(html).toContain("灵小柔");
  expect(html).not.toContain("Xiaobei");
  expect(html).toContain("60 fps");
});

it("retains uploaded narration when only subtitle visibility changes", () => {
  const original = VideoRequestSchema.parse({
    instructions: "An example story",
    outputLanguage: "zh",
    speech: { mode: "uploaded", assetId: "example-audio" },
    subtitles: { mode: "provided", text: "原字幕" },
  });
  const changed = applyRefinementSettings(
    original,
    { ...plan, profiles: [{ language: "zh", sourceQuote: "hide captions", showSubtitles: false }] },
    "hide captions",
  );
  expect(changed.speech).toEqual(original.speech);
  expect(changed.subtitles).toEqual({ mode: "off" });
});

it("keeps previously refined voice settings when a later version changes only output", () => {
  const first = applyRefinementSettings(request(), plan, userPrompt);
  const second = applyRefinementSettings(
    first,
    { ...plan, profiles: [], delivery: { sourceQuote: "30 fps", settings: { frameRate: 30 } } },
    "30 fps",
  );
  expect(second.speech).toEqual(first.speech);
  expect(second.speech).toMatchObject({ engine: "ming-tts", voice: "ming_xiaorou" });
  expect(second.frameRate).toBe(30);
  expect(first.frameRate).toBe(60);
});

it("changes one named timed narration profile without changing other items or their copy", () => {
  const original = VideoRequestSchema.parse({
    instructions: "An example bilingual story",
    duration: 20,
    scriptItems: [
      {
        id: "intro",
        startSeconds: 0,
        endSeconds: 5,
        source: "provided",
        text: "原中文旁白",
        showSubtitles: true,
        speech: { mode: "narration", engine: "kokoro", voice: "zf_xiaobei", language: "zh" },
      },
      {
        id: "ending",
        startSeconds: 5,
        endSeconds: 10,
        source: "provided",
        text: "Original English narration",
        showSubtitles: true,
        speech: { mode: "narration", engine: "kokoro", voice: "af_heart", language: "en" },
      },
    ],
  });
  const changed = applyRefinementSettings(
    original,
    { ...plan, profiles: [{ ...plan.profiles[0], scriptItemId: "intro" }] },
    userPrompt,
  );
  expect(changed.scriptItems?.[0].speech).toMatchObject({
    engine: "ming-tts",
    voice: "ming_xiaorou",
  });
  expect(changed.scriptItems?.[0].text).toBe(original.scriptItems?.[0].text);
  expect(changed.scriptItems?.[1]).toEqual(original.scriptItems?.[1]);
  expect(original.scriptItems?.[0].speech).toMatchObject({ engine: "kokoro" });
});
