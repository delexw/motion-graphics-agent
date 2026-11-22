import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  compactVideoLimitBytes,
  type CompactVideoDownload,
  type CompactVideoPreset,
} from "../../shared/compact-video-download";
import { WorkQueue } from "../jobs/queue";
import { compressVideo } from "./compact-video";

type Source = { source: string; cache: string; originalBytes: number; preset: CompactVideoPreset };
type RunWork = (work: (signal: AbortSignal) => Promise<void>) => Promise<void>;

export class CompactDownloads {
  private readonly queue = new WorkQueue(1);
  private readonly running = new Map<string, CompactVideoDownload>();
  private readonly failed = new Set<string>();

  constructor(private readonly compress = compressVideo) {}

  private async sourceInfo(source: string, preset: CompactVideoPreset): Promise<Source> {
    const file = await stat(source);
    const version = preset === "10mb" ? "10mb-v1" : "v1";
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          version,
          source,
          file.dev,
          file.ino,
          file.size,
          file.mtimeMs,
          file.ctimeMs,
        ]),
      )
      .digest("hex")
      .slice(0, 24);
    return {
      source,
      cache: path.join(path.dirname(source), `compact-${key}.mp4`),
      originalBytes: file.size,
      preset,
    };
  }

  private saved(info: Source): CompactVideoDownload | undefined {
    const output = lstatSync(info.cache, { throwIfNoEntry: false });
    if (
      output?.isFile() &&
      output.size > 0 &&
      output.size < info.originalBytes &&
      (info.preset === "quality" || output.size <= compactVideoLimitBytes)
    )
      return { status: "ready", bytes: output.size, originalBytes: info.originalBytes };
    const unchanged = lstatSync(`${info.cache}.original`, { throwIfNoEntry: false });
    if (unchanged?.isFile()) return { status: "original" };
  }

  async status(
    source: string,
    preset: CompactVideoPreset = "quality",
  ): Promise<CompactVideoDownload> {
    const info = await this.sourceInfo(source, preset);
    const saved = this.saved(info);
    return (
      this.running.get(info.cache) ??
      saved ??
      (this.failed.has(info.cache) ? { status: "failed" } : { status: "idle" })
    );
  }

  async start(
    source: string,
    runWork: RunWork,
    preset: CompactVideoPreset = "quality",
  ): Promise<CompactVideoDownload> {
    const info = await this.sourceInfo(source, preset);
    const saved = this.saved(info);
    const existing = this.running.get(info.cache) ?? saved;
    if (existing) return existing;

    this.failed.delete(info.cache);
    const queued = { status: "queued" } as const;
    // Reserve synchronously before scheduling. Parallel requests share this reservation.
    this.running.set(info.cache, queued);
    void Promise.resolve()
      .then(() => runWork((signal) => this.queue.run(() => this.encode(info, signal), signal)))
      .catch(() => {
        this.failed.add(info.cache);
        if (this.failed.size > 128) this.failed.delete(this.failed.values().next().value!);
      })
      .finally(() => this.running.delete(info.cache));
    return queued;
  }

  private async encode(info: Source, signal: AbortSignal) {
    const update = (status: CompactVideoDownload) => this.running.set(info.cache, status);
    update({ status: "compressing", percent: 0 });
    const temporary = await mkdtemp(path.join(path.dirname(info.cache), ".compress-"));
    try {
      const target = path.join(temporary, "video.mp4");
      const accepted = await this.compress(
        info.source,
        target,
        signal,
        (percent) => update({ status: "compressing", percent }),
        () => update({ status: "checking" }),
        info.preset,
      );
      signal.throwIfAborted();
      if ((await this.sourceInfo(info.source, info.preset)).cache !== info.cache)
        throw Error("The source video changed during compression");
      if (accepted) await rename(target, info.cache);
      else await writeFile(`${info.cache}.original`, "", { flag: "wx" });
    } finally {
      await rm(temporary, { force: true, recursive: true });
    }
  }

  async file(source: string, preset: CompactVideoPreset = "quality") {
    const info = await this.sourceInfo(source, preset);
    return this.saved(info)?.status === "ready" ? info.cache : undefined;
  }
}
