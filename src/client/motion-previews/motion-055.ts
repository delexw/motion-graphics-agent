import { ink, accent, warm, clamp, motionDrawing } from "./drawing";

export const SHUTTER = 1 / 60;
export const SAMPLES = 24;
export const SHARP_BELOW_PX = 0.75;
export const CENTRE_X = 320;
export const ENTRY_X = 840;
export const EXIT_X = -280;
export const WHIPS = [
  { word: "IDEA", color: ink, enter: [0.5, 1.1], leave: [2.0, 2.35] },
  { word: "LINKS", color: accent, enter: [2.2, 2.8], leave: [3.7, 4.05] },
  { word: "SYSTEM", color: warm, enter: [4.0, 4.6], leave: null },
] as const;
const FONT_SIZE = 86;
const BASELINE = 214;

const expoOut = (p: number) => (1 - Math.pow(2, -10 * clamp(p))) / (1 - Math.pow(2, -10));
const cubicIn = (p: number) => Math.pow(clamp(p), 3);

export function wordX(index: number, time: number) {
  const whip = WHIPS[index];
  const [inStart, inEnd] = whip.enter;
  const arriving = ENTRY_X + (CENTRE_X - ENTRY_X) * expoOut((time - inStart) / (inEnd - inStart));
  if (!whip.leave || time < whip.leave[0]) return arriving;
  const [outStart, outEnd] = whip.leave;
  return CENTRE_X + (EXIT_X - CENTRE_X) * cubicIn((time - outStart) / (outEnd - outStart));
}

export function streakLength(index: number, time: number) {
  return Math.abs(wordX(index, time) - wordX(index, time - SHUTTER));
}

export function shutterPositions(index: number, time: number) {
  if (streakLength(index, time) < SHARP_BELOW_PX) return [wordX(index, time)];
  return Array.from({ length: SAMPLES }, (_, i) =>
    wordX(index, time - (SHUTTER * i) / (SAMPLES - 1)),
  );
}

export function wordVisible(index: number, time: number) {
  const x = wordX(index, time);
  return time >= WHIPS[index].enter[0] - SHUTTER && x > -260 && x < 820;
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  WHIPS.forEach((whip, index) => {
    if (!wordVisible(index, t)) return;
    const positions = shutterPositions(index, t);
    positions.forEach((x, sample) => {
      c.globalAlpha = 1 / (sample + 1);
      text(whip.word, x, BASELINE, FONT_SIZE, whip.color);
    });
    c.globalAlpha = 1;
  });
}
