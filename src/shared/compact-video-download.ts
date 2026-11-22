export type CompactVideoPreset = "quality" | "10mb";
export const compactVideoLimitBytes = 10_000_000;

export type CompactVideoDownload =
  | { status: "idle" | "queued" | "checking" | "original" | "failed" }
  | { status: "compressing"; percent: number }
  | { status: "ready"; bytes: number; originalBytes: number };
