import { z } from "zod";

export const AnalyzeMusicInputSchema = z.object({
  file: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .describe(
      "Workspace-relative prepared music file inside render inputs; up to 256 MiB. Audio is read, never modified.",
    ),
});

const BeatTimingSchema = z
  .object({
    count: z.number().int().nonnegative().max(30000),
    bpm: z.number().finite().positive().nullable(),
    beatTimes: z.array(z.number().finite().nonnegative()).max(30000),
  })
  .superRefine((value, context) => {
    if (value.count !== value.beatTimes.length)
      context.addIssue({ code: "custom", message: "Beat count must match timestamps" });
    if (value.beatTimes.some((time, index) => index > 0 && time <= value.beatTimes[index - 1]))
      context.addIssue({ code: "custom", message: "Beat timestamps must be strictly increasing" });
    if (!value.count && value.bpm !== null)
      context.addIssue({ code: "custom", message: "An empty beat map cannot establish tempo" });
  });

export const MusicBeatAnalysisSchema = BeatTimingSchema.safeExtend({
  ok: z.literal(true),
  file: z.string().min(1),
});

export const MusicAnalysisSchema = BeatTimingSchema.safeExtend({
  version: z.literal(1),
  analyzer: z.literal("hyperframes beats"),
  sourceFile: z.string().min(1).max(1024),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type MusicAnalysis = z.infer<typeof MusicAnalysisSchema>;

export const MusicAnalysisInspectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), analysisFile: z.string(), analysis: MusicAnalysisSchema }),
  z.object({ status: z.enum(["missing", "stale", "invalid", "unavailable"]) }),
]);
export type MusicAnalysisInspection = z.infer<typeof MusicAnalysisInspectionSchema>;

export type MusicAnalysisToolResult =
  | { kind: "music_analysis"; analysisFile: string; analysis: MusicAnalysis }
  | { kind: "error"; message: string };
