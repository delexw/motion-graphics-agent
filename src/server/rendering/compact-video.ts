import path from "node:path";
import { stat } from "node:fs/promises";
import { command } from "../runtime/process";
import { probeVideo } from "./video-probe";
import { countedProbe, frameRateOf, similarityOf } from "./webm-video";

const minimumSimilarity = 0.985;
const minimumSaving = 0.1;

export async function compressVideo(
  source: string,
  target: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
  onChecking: () => void,
) {
  const input = await probeVideo(source, signal);
  const video = input.streams.find((stream) => stream.codec_type === "video");
  const seconds = Number(input.format.duration);
  if (!video || !Number.isFinite(seconds) || seconds <= 0) throw Error("Unreadable source video");
  // Keep masters with HDR, alpha or higher bit depth in their original format.
  if (
    video.pix_fmt !== "yuv420p" ||
    ["smpte2084", "arib-std-b67"].includes(video.color_transfer ?? "")
  )
    return false;

  const timeout = Math.max(600_000, Math.ceil(seconds) * 6000);
  let pending = "";
  let reported = 0;
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostats",
      "-progress",
      "pipe:1",
      "-i",
      source,
      "-map",
      "0",
      "-c",
      "copy",
      "-c:v:0",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "19",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      target,
    ],
    path.dirname(source),
    signal,
    () => {},
    timeout,
    false,
    (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^out_time_us=(\d+)\s*$/.exec(line);
        if (!match) continue;
        const percent = Math.min(99, Math.floor((Number(match[1]) / (seconds * 1e6)) * 100));
        if (percent <= reported) continue;
        reported = percent;
        onProgress(percent);
      }
    },
  );

  onChecking();
  const [originalFile, compactFile] = await Promise.all([stat(source), stat(target)]);
  if (compactFile.size > originalFile.size * (1 - minimumSaving)) return false;

  const original = await countedProbe(source, signal, timeout);
  const compact = await countedProbe(target, signal, timeout);
  const from = original.streams.find((stream) => stream.codec_type === "video");
  const to = compact.streams.find((stream) => stream.codec_type === "video");
  if (
    !from ||
    !to ||
    to.codec_name !== "h264" ||
    from.width !== to.width ||
    from.height !== to.height ||
    frameRateOf(original) !== frameRateOf(compact) ||
    !from.nb_read_frames ||
    from.nb_read_frames !== to.nb_read_frames ||
    !(Math.abs(Number(compact.format.duration) - seconds) <= 1 / frameRateOf(original)) ||
    JSON.stringify(original.streams.map(({ codec_type }) => codec_type)) !==
      JSON.stringify(compact.streams.map(({ codec_type }) => codec_type))
  )
    return false;

  // FFmpeg compares the entire video. Audio and other streams are copied from the original.
  return (await similarityOf(target, source, signal, timeout)) >= minimumSimilarity;
}
