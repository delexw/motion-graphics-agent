import type { MusicAnalysisInspection } from "../../shared/music-analysis";
import type { DeskClip } from "./production-desk";

export type DeskMusicBeats = MusicAnalysisInspection | { status: "loading" };

/** Prepared audio files start at source zero; audioTracks has no source in-offset. */
export function deskMusicBeatTimes(clip: Pick<DeskClip, "start" | "end">, state?: DeskMusicBeats) {
  if (state?.status !== "ready") return [];
  return state.analysis.beatTimes
    .filter((time) => time < clip.end - clip.start)
    .map((time) => clip.start + time);
}

export function deskBeatTicksVisible(times: number[], duration: number, width: number) {
  if (!times.length || width <= 0 || duration <= 0) return false;
  return times.every(
    (time, index) => index === 0 || ((time - times[index - 1]) * width) / duration >= 6,
  );
}

export function adjacentDeskBeat(times: number[], current: number, direction: -1 | 1) {
  if (direction === 1) return times.findIndex((time) => time > current + 0.001);
  const next = times.findIndex((time) => time >= current - 0.001);
  return next < 0 ? times.length - 1 : next - 1;
}
