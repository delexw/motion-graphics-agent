import { afterEach, expect, it, vi } from "vitest";
import { RequestSchema } from "../src/shared/contracts";
import { CodedError } from "../src/shared/errors";
import {
  requestSettingsContext,
  reviewRequestSettings,
  requestSettingsHash,
} from "../src/server/jev/strategies/settings-conflict";
import { credentialEnvironmentVariables } from "../src/server/runtime/credential-environment";
import { parseJevRequest } from "./jev-request";

const styles = [{ id: "style-001", name_en: "Watercolor" }];
const input = (overrides = {}) =>
  RequestSchema.parse({ instructions: "Explain a simple process", ...overrides });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
type JevPayload = {
  state: {
    settings: Record<string, unknown>;
    sources: { field: string; text: string }[];
    reviewPolicy: string;
  };
  questions: Record<string, { criteria: Record<string, string> }>;
};
function transport(decide: (payload: JevPayload) => Record<string, unknown>) {
  vi.stubEnv(credentialEnvironmentVariables.typesafeApiKey, "fixture-placeholder");
  const fetch = vi.fn(async (_url, init: RequestInit) => {
    const payload = await parseJevRequest(init);
    return Response.json({
      model: "jev-1.14.0",
      answers: decide(payload),
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function answers(payload: JevPayload, choices: Record<string, string> = {}) {
  return Object.fromEntries(
    Object.entries(payload.questions).map(([key, question]) => {
      const selected = choices[key] ?? "compatible";
      return [
        key,
        {
          type: "choice",
          choice: selected,
          confidence: 0.95,
          probabilities: Object.fromEntries(
            Object.keys(question.criteria).map((id) => [id, id === selected ? 1 : 0]),
          ),
        },
      ];
    }),
  );
}
it("uses real delivery defaults, approximate duration and an unrestricted auto duration", () => {
  expect(requestSettingsContext(input(), styles).settings).toMatchObject({
    frameRate: 30,
    resolution: "1080p",
    renderer: "hyperframes",
    duration: { mode: "auto", fixed: false },
  });
  expect(requestSettingsContext(input({ duration: 60 }), styles).settings.duration).toEqual({
    targetSeconds: 60,
    allowedRange: { min: 55, max: 65 },
  });
  const page = requestSettingsContext(
    input({ outputType: "page", viewport: "mobile" }),
    styles,
  ).settings;
  expect(page.viewport).toBe("mobile");
  expect(page).not.toHaveProperty("frameRate");
  expect(page).not.toHaveProperty("duration");
});
it("separates production instruction fields from provided dialogue and leaves the request unchanged", () => {
  const request = input({
    speech: {
      mode: "narration",
      source: "provided",
      text: "Say 24 fps in this quotation.",
      instructions: "Keep narration gentle",
    },
    requirements: {
      main: { instructions: "Main source note", assetIds: [] },
      music: { instructions: "Use electronic sound", assetIds: [] },
      images: { instructions: "Use original shapes", assetIds: [] },
      videos: { instructions: "Inspect supplied motion", assetIds: [] },
      urls: { instructions: "Use public facts" },
    },
  });
  const before = structuredClone(request);
  const context = requestSettingsContext(request, styles);
  expect(context.sources.map((source) => source.field)).toEqual([
    "instructions",
    "requirements.main.instructions",
    "requirements.music.instructions",
    "requirements.images.instructions",
    "requirements.videos.instructions",
    "requirements.urls.instructions",
    "speech.instructions",
  ]);
  expect(JSON.stringify(context)).not.toContain("Say 24 fps");
  expect(request).toEqual(before);
});
it("applies shared language settings before checking timed-item narration", () => {
  const request = input({
    subtitles: { mode: "provided", text: "Original copy" },
    languageTracks: { narration: [], subtitles: [], showSubtitles: false, defaultSubtitle: "off" },
    scriptItems: [
      {
        id: "intro",
        startSeconds: 0,
        endSeconds: 3,
        text: "A quoted claim about French",
        source: "provided",
        showSubtitles: true,
        speech: { mode: "narration" },
      },
    ],
  });
  const context = requestSettingsContext(request, styles);
  expect(context.settings.scriptItems).toMatchObject([
    { id: "intro", showSubtitles: false, speech: { mode: "off" } },
  ]);
  expect(context.sources).toHaveLength(1);
});
it("checks all settings in one native JEV request and returns all conflicting fields and sources", async () => {
  const request = input({
    instructions: "Use 24 fps",
    aspectRatio: "16:9",
    frameRate: 60,
    requirements: {
      main: { instructions: "", assetIds: [] },
      music: { instructions: "", assetIds: [] },
      images: { instructions: "Make a vertical 9:16 video", assetIds: [] },
      videos: { instructions: "", assetIds: [] },
      urls: { instructions: "" },
    },
  });
  const fetch = transport((payload) => {
    expect(payload.state.sources.map((s) => s.text)).toEqual([
      "Use 24 fps",
      "Make a vertical 9:16 video",
    ]);
    expect(payload.state.reviewPolicy).toContain(
      "additional @ Motion Graphic or motion references confined to a scene are allowed",
    );
    expect(payload.state.reviewPolicy).toContain("quoted dialogue");
    expect(payload.state.reviewPolicy).toContain("No narration does not prohibit music");
    expect(payload.state.reviewPolicy).toContain(
      "Source footage and intermediate processing may have different frame rates or resolutions",
    );
    expect(Object.keys(payload.questions)).toEqual(Object.keys(payload.state.settings));
    return answers(payload, { frameRate: "source_0", aspectRatio: "source_1" });
  });
  const review = await reviewRequestSettings(request, styles, new AbortController().signal);
  expect(fetch).toHaveBeenCalledOnce();
  expect(review.requestHash).toBe(requestSettingsHash(request));
  expect(review.conflicts).toEqual([
    {
      setting: "aspectRatio",
      value: "16:9",
      source: { field: "requirements.images.instructions", label: "Image notes" },
    },
    { setting: "frameRate", value: 60, source: { field: "instructions", label: "Main idea" } },
  ]);
  expect(JSON.stringify(review)).not.toContain("confidence");
  expect(JSON.stringify(review)).not.toContain("excerpt");
});
it("retains selected style names without restricting additional scene-scoped motions", async () => {
  transport((payload) => {
    expect(payload.state.settings.selectedStyleIds).toEqual([
      { id: "style-001", name: "Watercolor" },
    ]);
    expect(payload.state.sources[0].text).toContain("motion-051");
    return answers(payload);
  });
  const request = input({
    candidateCount: 0,
    selectedStyleIds: ["style-001"],
    instructions:
      'Keep Watercolor, add <motion id="motion-051">Metaball</motion> only in the intro.',
  });
  expect(
    (await reviewRequestSettings(request, styles, new AbortController().signal)).conflicts,
  ).toEqual([]);
});
it.each(["missing", "unknown-choice", "wrong-type"])(
  "blocks malformed %s reviews instead of implying compatibility",
  async (kind) => {
    transport((payload) => {
      const result = answers(payload);
      if (kind === "missing") delete result.outputType;
      else
        result.outputType = {
          type: kind === "wrong-type" ? "noul" : "choice",
          choice: "source_999",
          confidence: 1,
          probabilities: {},
        };
      return result;
    });
    await expect(
      reviewRequestSettings(input(), styles, new AbortController().signal),
    ).rejects.toMatchObject({ code: "SETTINGS_CHECK_UNAVAILABLE", statusCode: 503 });
  },
);
it("fails closed without a configured JEV client and does not make any network request", async () => {
  vi.stubEnv(credentialEnvironmentVariables.typesafeApiKey, "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    reviewRequestSettings(input(), styles, new AbortController().signal),
  ).rejects.toBeInstanceOf(CodedError);
  expect(fetch).not.toHaveBeenCalled();
});
it("does not check or start anything after cancellation", async () => {
  const fetch = transport((payload) => answers(payload));
  const controller = new AbortController();
  controller.abort();
  await expect(reviewRequestSettings(input(), styles, controller.signal)).rejects.toMatchObject({
    code: "SETTINGS_CHECK_UNAVAILABLE",
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("emits independent strategy invocation and usage for Governance without raw credentials", async () => {
  transport((payload) => answers(payload, { frameRate: "source_0" }));
  const onEvent = vi.fn();
  await reviewRequestSettings(
    input({ instructions: "Deliver at 24 fps", frameRate: 60 }),
    styles,
    new AbortController().signal,
    onEvent,
  );
  expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(["invocation", "usage"]);
  expect(onEvent.mock.calls[0][0].data).toMatchObject({
    purpose: "Request/settings compatibility check",
    provider: "jev",
    model: "jev-1.14.0",
    prompt: { user: expect.stringContaining("reviewPolicy") },
  });
  expect(onEvent.mock.calls[1][0].data).toMatchObject({
    usage: { input_tokens: 10, output_tokens: 5 },
    answers: { frameRate: { choice: "source_0" } },
  });
  expect(JSON.stringify(onEvent.mock.calls)).not.toContain("fixture-placeholder");
});
