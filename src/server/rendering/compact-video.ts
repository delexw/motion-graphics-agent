import path from "node:path";
import { stat } from "node:fs/promises";
import {
  compactVideoLimitBytes,
  type CompactVideoPreset,
} from "../../shared/compact-video-download";
import { command } from "../runtime/process";
import { probeVideo, type VideoProbe } from "./video-probe";
import { countedProbe, frameRateOf, similarityOf } from "./webm-video";

const minimumSimilarity = 0.985;
const minimumSaving = 0.1;
const muxHeadroom = 0.04;
const defaultAudioBitrate = 256_000;

function targetVideoBitrate(
  streams: VideoProbe["streams"],
  video: VideoProbe["streams"][number],
  maximumBytes: number,
  seconds: number,
) {
  const copiedBitrate = streams
    .filter((stream) => stream !== video)
    .reduce((sum, stream) => {
      const rate = Number(stream.bit_rate);
      if (rate > 0 && Number.isFinite(rate)) return sum + rate;
      return sum + (stream.codec_type === "audio" ? defaultAudioBitrate : 0);
    }, 0);
  return Math.floor((maximumBytes * (1 - muxHeadroom) * 8) / seconds - copiedBitrate);
}

export async function compressVideo(
  source: string,
  target: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
  onChecking: () => void,
  preset: CompactVideoPreset = "quality",
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

  const originalFile = await stat(source);
  const savingLimit = originalFile.size * (1 - minimumSaving);
  const sizeLimited = preset === "10mb";
  const maximumBytes = sizeLimited ? Math.min(compactVideoLimitBytes, savingLimit) : savingLimit;
  let videoBitrate = sizeLimited
    ? targetVideoBitrate(input.streams, video, maximumBytes, seconds)
    : undefined;
  if (videoBitrate !== undefined && videoBitrate < 16_000) return false;

  const timeout = Math.max(600_000, Math.ceil(seconds) * 6000);
  const passes = sizeLimited ? [1, 2] : [undefined];
  const progressBoundaries = sizeLimited ? [0, 90, 100] : [0, 100];
  let reported = 0;
  for (let attempt = 0; ; attempt++) {
    for (const [index, pass] of passes.entries()) {
      let pending = "";
      await command(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-nostats",
          "-progress",
          "pipe:1",
          "-i",
          source,
          ...(pass === 1 ? ["-map", "0:v:0", "-an"] : ["-map", "0", "-c", "copy"]),
          "-c:v:0",
          "libx264",
          "-preset",
          "slow",
          ...(pass === undefined
            ? ["-crf", "19"]
            : [
                "-b:v:0",
                String(videoBitrate),
                "-fps_mode:v:0",
                "passthrough",
                "-passlogfile",
                `${target}.pass`,
                "-pass:v:0",
                String(pass),
              ]),
          ...(pass === 1 ? ["-f", "null", "-"] : ["-movflags", "+faststart", "-f", "mp4", target]),
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
            const fraction = Math.min(1, Number(match[1]) / (seconds * 1e6));
            const completed = (index + fraction) / passes.length;
            const start = progressBoundaries[attempt];
            const end = progressBoundaries[attempt + 1];
            const percent = Math.min(99, Math.floor(start + completed * (end - start)));
            if (percent <= reported) continue;
            reported = percent;
            onProgress(percent);
          }
        },
      );
    }

    const encodedBytes = (await stat(target)).size;
    if (encodedBytes <= maximumBytes) break;
    if (videoBitrate === undefined || attempt === 1) return false;
    // Short two-pass encodes can overshoot their average bitrate. Use the
    // measured file size to lower the bitrate before trying both passes again.
    videoBitrate = Math.floor(videoBitrate * (maximumBytes / encodedBytes) * (1 - muxHeadroom));
    if (videoBitrate < 16_000) return false;
  }

  onChecking();
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
  return sizeLimited || (await similarityOf(target, source, signal, timeout)) >= minimumSimilarity;
}
