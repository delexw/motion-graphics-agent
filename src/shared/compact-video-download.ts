export type CompactVideoDownload =
  | { status: "idle" | "queued" | "checking" | "original" | "failed" }
  | { status: "compressing"; percent: number }
  | { status: "ready"; bytes: number; originalBytes: number };
