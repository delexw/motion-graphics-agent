import { expect, it } from "vitest";
import {
  adjacentDeskBeat,
  deskBeatTicksVisible,
  deskMusicBeatTimes,
  type DeskMusicBeats,
} from "../src/client/lib/desk-music-beats";
const state: DeskMusicBeats = {
  status: "ready",
  analysisFile: "music.wav.beats.json",
  analysis: {
    version: 1,
    analyzer: "hyperframes beats",
    sourceFile: "music.wav",
    sourceSha256: "0".repeat(64),
    count: 4,
    bpm: 120,
    beatTimes: [0.25, 0.75, 1.25, 1.75],
  },
};
it("maps a shared source separately to repeated film placements and excludes end/out-of-range beats", () => {
  expect(deskMusicBeatTimes({ start: 2, end: 3.25 }, state)).toEqual([2.25, 2.75]);
  expect(deskMusicBeatTimes({ start: 10, end: 11.25 }, state)).toEqual([10.25, 10.75]);
  expect(state.analysis.beatTimes).toEqual([0.25, 0.75, 1.25, 1.75]);
  for (const status of ["loading", "missing", "stale", "invalid", "unavailable"] as const)
    expect(deskMusicBeatTimes({ start: 0, end: 3 }, { status })).toEqual([]);
});
it("hides dense ticks without inventing a slower beat grid and reveals them with zoom", () => {
  const times = [0.25, 0.75, 1.25];
  expect(deskBeatTicksVisible(times, 3, 30)).toBe(false);
  expect(deskBeatTicksVisible(times, 3, 36)).toBe(true);
  expect(deskBeatTicksVisible([], 3, 100)).toBe(false);
  expect(deskBeatTicksVisible([1], 3, 0)).toBe(false);
});
it("navigates around the current beat without looping or selecting it again", () => {
  const times = [0.25, 0.75, 1.25];
  expect(adjacentDeskBeat(times, 0, 1)).toBe(0);
  expect(adjacentDeskBeat(times, 0.75, 1)).toBe(2);
  expect(adjacentDeskBeat(times, 0.75, -1)).toBe(0);
  expect(adjacentDeskBeat(times, 0.1, -1)).toBe(-1);
  expect(adjacentDeskBeat(times, 1.5, 1)).toBe(-1);
  expect(adjacentDeskBeat(times, 1.5, -1)).toBe(2);
  expect(adjacentDeskBeat([], 1, -1)).toBe(-1);
});
