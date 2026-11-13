import { z } from "zod";
import { CodedError } from "./errors";

export const requestSettingLabels = {
  outputType: "Output type",
  provider: "Model provider",
  mainModel: "Model",
  candidateCount: "Preview directions",
  selectedStyleIds: "Selected Motion Graphics",
  pinnedStyleId: "Primary Motion Graphic",
  duration: "Length",
  aspectRatio: "Aspect ratio",
  resolution: "Resolution",
  frameRate: "Frame rate",
  renderer: "Renderer",
  viewport: "Viewport",
  outputLanguage: "Output language",
  speech: "Narration",
  subtitles: "Subtitles",
  languageTracks: "Languages",
  scriptItems: "Timed script settings",
} as const;
export const RequestSettingSchema = z.enum(
  Object.keys(requestSettingLabels) as [
    keyof typeof requestSettingLabels,
    ...(keyof typeof requestSettingLabels)[],
  ],
);
export const SettingsConflictSchema = z.object({
  setting: RequestSettingSchema,
  value: z.json(),
  source: z.object({ field: z.string().min(1), label: z.string().min(1) }),
});
export const RequestSettingsReviewSchema = z.object({
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1),
  conflicts: z.array(SettingsConflictSchema),
});
export type RequestSettingsReview = z.infer<typeof RequestSettingsReviewSchema>;
export type SettingsConflict = z.infer<typeof SettingsConflictSchema>;
export class SettingsConflictError extends CodedError {
  constructor(public readonly details: RequestSettingsReview) {
    super(
      "SETTINGS_CONFLICT",
      "Your brief disagrees with your project settings. Nothing has started.",
      409,
    );
    this.name = "SettingsConflictError";
  }
}

/** Pre-start checks exist independently of projects, including rejected starts. */
export const SettingsCheckRecordSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().optional(),
  runId: z.string().optional(),
  requestHash: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(["checking", "compatible", "conflict", "failed"]),
  model: z.string(),
  review: RequestSettingsReviewSchema.optional(),
  events: z.array(z.object({ type: z.string(), message: z.string(), data: z.json().optional() })),
});
export type SettingsCheckRecord = z.infer<typeof SettingsCheckRecordSchema>;
