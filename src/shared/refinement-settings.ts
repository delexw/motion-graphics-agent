import { z } from "zod";
import { VideoRequestSchema, type VideoRequest } from "./domains/video";
import { SpeechSettingsSchema, speechLanguage } from "./speech";
import { VideoLanguageSchema } from "./video-language";
import {
  applyLanguageTracks,
  individualLanguageTracks,
  languageTrackRows,
  selectLanguageTrackLanguages,
} from "./language-tracks";

const speechShape = SpeechSettingsSchema.options[1].shape;
const SpeechProfilePatchSchema = z
  .object({
    engine: speechShape.engine,
    voice: speechShape.voice.removeDefault().optional(),
    speed: speechShape.speed.removeDefault().optional(),
    volume: speechShape.volume,
  })
  .strict();
const videoShape = VideoRequestSchema.out.shape;
export const RefinementSettingsPlanSchema = z
  .object({
    version: z.literal(1),
    profiles: z
      .array(
        z
          .object({
            sourceQuote: z.string().trim().min(1).max(6000),
            language: VideoLanguageSchema,
            scriptItemId: z.string().min(1).optional(),
            generateNarration: z.boolean().optional(),
            showSubtitles: z.boolean().optional(),
            speech: SpeechProfilePatchSchema.optional(),
          })
          .strict(),
      )
      .max(80),
    delivery: z
      .object({
        sourceQuote: z.string().trim().min(1).max(6000),
        settings: z
          .object({
            aspectRatio: videoShape.aspectRatio.removeDefault().optional(),
            resolution: videoShape.resolution,
            frameRate: videoShape.frameRate,
            duration: videoShape.duration.removeDefault().optional(),
            outputLanguage: videoShape.outputLanguage,
          })
          .strict(),
      })
      .strict()
      .nullable(),
    unsupported: z
      .array(z.object({ sourceQuote: z.string().min(1), reason: z.string().min(1) }).strict())
      .max(10),
  })
  .strict();
export type RefinementSettingsPlan = z.infer<typeof RefinementSettingsPlanSchema>;

/** Apply explicit, version-local changes through the same settings and language validators as creation. */
export function applyRefinementSettings(
  request: VideoRequest,
  plan: RefinementSettingsPlan,
  prompt: string,
): VideoRequest {
  plan = RefinementSettingsPlanSchema.parse(plan);
  const quote = (value: string) => {
    if (!prompt.includes(value))
      throw Error("Refinement setting changes must quote the user's actual request");
  };
  for (const change of [
    ...plan.profiles,
    ...(plan.delivery ? [plan.delivery] : []),
    ...plan.unsupported,
  ])
    quote(change.sourceQuote);
  if (plan.unsupported.length)
    throw Error(plan.unsupported.map((change) => change.reason).join("; "));
  let next = structuredClone(request);
  if (plan.delivery) next = { ...next, ...plan.delivery.settings };
  if (!plan.profiles.length) return VideoRequestSchema.parse(next);
  const rows = structuredClone(languageTrackRows(next));
  const seen = new Set<string>();
  for (const change of plan.profiles) {
    const key = change.scriptItemId
      ? `script:${change.scriptItemId}`
      : `language:${change.language}`;
    if (seen.has(key)) throw Error("Combine changes for the same narration profile");
    seen.add(key);
    if (change.scriptItemId) {
      if (next.languageTracks)
        throw Error("Global language profiles govern script items; change that language instead");
      const item = next.scriptItems?.find((item) => item.id === change.scriptItemId);
      if (!item) throw Error("Narration script item not found");
      if (change.showSubtitles !== undefined) item.showSubtitles = change.showSubtitles;
      if (change.generateNarration === false) item.speech = { mode: "off" };
      else if (change.speech || change.generateNarration === true) {
        if (item.speech.mode !== "narration")
          throw Error("Choose an existing narration profile before changing a silent script item");
        const speech = SpeechSettingsSchema.parse({
          ...item.speech,
          ...change.speech,
          language: change.language,
        });
        if (
          speech.mode !== "narration" ||
          speechLanguage(speech.voice, speech.engine, change.language)?.split("-")[0] !==
            change.language
        )
          throw Error("Choose a voice supporting the narration language");
        item.speech = speech;
      }
      continue;
    }
    if (
      !next.languageTracks &&
      next.speech?.mode === "uploaded" &&
      !change.speech &&
      change.generateNarration === undefined
    ) {
      if (change.showSubtitles === false) next.subtitles = { mode: "off" };
      else if (change.showSubtitles === true && (!next.subtitles || next.subtitles.mode === "off"))
        next.subtitles = { mode: "write" };
      continue;
    }
    if (next.scriptItems !== undefined && !next.languageTracks)
      throw Error("Identify the timed script item to change; do not replace other items");
    if (!next.languageTracks && !rows.length) {
      const language = VideoLanguageSchema.parse(next.outputLanguage ?? change.language);
      rows.push({
        language,
        generateNarration: next.speech?.mode === "narration",
        showSubtitles: Boolean(next.subtitles && next.subtitles.mode !== "off"),
        speech: selectLanguageTrackLanguages(next, [language], { narrationEnabled: true })
          .narration[0].speech,
      });
    }
    let row = rows.find((row) => row.language === change.language);
    if (!row) {
      row = {
        language: change.language,
        generateNarration: false,
        showSubtitles: false,
        speech: selectLanguageTrackLanguages(next, [change.language], { narrationEnabled: true })
          .narration[0].speech,
      };
      rows.push(row);
    }
    if (change.speech) {
      const speech = SpeechSettingsSchema.parse({
        ...row.speech,
        ...change.speech,
        language: change.language,
        followVideoLanguage: false,
      });
      if (
        speech.mode !== "narration" ||
        speechLanguage(speech.voice, speech.engine, change.language)?.split("-")[0] !==
          change.language
      )
        throw Error("Choose a voice supporting the narration language");
      row.speech = speech;
    }
    if (change.generateNarration !== undefined) row.generateNarration = change.generateNarration;
    if (change.showSubtitles !== undefined) row.showSubtitles = change.showSubtitles;
  }
  if (rows.length) {
    next.languageTracks = individualLanguageTracks(next, rows);
    if (!next.languageTracks.subtitles.length) next.subtitles = { mode: "off" };
    else if (!next.subtitles || next.subtitles.mode === "off") next.subtitles = { mode: "write" };
    next = applyLanguageTracks(next);
  }
  return VideoRequestSchema.parse(next);
}
