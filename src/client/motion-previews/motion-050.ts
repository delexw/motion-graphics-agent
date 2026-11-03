export const DURATION = 6;
export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 360;

export const LINES: readonly (readonly string[])[] = [
  ["TURN", "ONE", "IDEA"],
  ["INTO", "A", "SIGNAL"],
];

const TOKEN_ONSETS: readonly (readonly number[])[] = [
  [0.4, 1.05, 1.7],
  [3.15, 3.8, 4.45],
];

const HANDOFF_STARTS: readonly number[] = [2.4];
const HANDOFF_DURATION = 0.45;
const HISTORY_SCALE = 0.4;
const STEP_OVERLAP = 0.1;
const FINAL_HOLD_START = 5.2;

const FILL_POP_DURATION = 0.06;
const FILL_POP_FROM = 0.92;
const COMPLETE_FADE_DURATION = 0.12;
const GHOST_FADE_DURATION = 0.15;
const GHOST_START_OPACITY = 0.35;
const HISTORY_LAST_FILL_DECAY = 0.4;

export const COLORS = {
  background: "#1a2350",
  dim: "#7d7a78",
  neutral: "#f3eee2",
  activeFill: "#e2552a",
  activeText: "#f3eee2",
  halftone: "#2c376b",
} as const;

export const FONT_SIZE = 78;
export const FONT = `bold ${FONT_SIZE}px 'Arial Narrow', Arial, sans-serif`;

const BLOCK_LEFT = 40;
const BLOCK_TOP = 34;
const ROW_PITCH = 92;
const BOX_PAD_X = 12;
const BOX_PAD_Y = 10;
const CAP_HEIGHT = Math.round(FONT_SIZE * 0.716);
const BOX_HEIGHT = CAP_HEIGHT + BOX_PAD_Y * 2;
const HISTORY_RIGHT = 600;
const HISTORY_TOP = 24;

const ARIAL_BOLD_ADVANCE: Readonly<Record<string, number>> = {
  A: 722,
  D: 722,
  E: 667,
  G: 778,
  I: 278,
  L: 611,
  N: 722,
  O: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
};
const NARROW_FACTOR = 0.82;

export type TokenStateName = "upcoming" | "active" | "completed";
export type Layer = "main" | "history" | "ghost" | "hidden";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LineTransform {
  lineIndex: number;
  translate: { x: number; y: number };
  scale: number;
  opacity: number;
}

export interface TokenFrame {
  lineIndex: number;
  tokenIndex: number;
  word: string;
  state: TokenStateName;
  fillOpacity: number;
  boxScale: number;
  layer: Layer;
  localBox: Rect;
  box: Rect;
  textBaseline: { x: number; y: number };
  textWidth: number;
}

export interface Frame {
  t: number;
  handoff: { index: number; progress: number; active: boolean };
  main: LineTransform;
  history: LineTransform | null;
  retiringHistory: LineTransform | null;
  ghost: LineTransform | null;
  tokens: TokenFrame[];
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function progress(t: number, start: number, duration: number): number {
  return clamp((t - start) / duration, 0, 1);
}

export function wordWidth(word: string): number {
  let units = 0;
  for (const ch of word) units += ARIAL_BOLD_ADVANCE[ch] ?? 600;
  return (units / 1000) * NARROW_FACTOR * FONT_SIZE;
}

function localBoxFor(lineIndex: number, tokenIndex: number): Rect {
  const w = wordWidth(LINES[lineIndex][tokenIndex]) + BOX_PAD_X * 2;
  return { x: BLOCK_LEFT, y: BLOCK_TOP + tokenIndex * ROW_PITCH, w, h: BOX_HEIGHT };
}

function blockWidth(lineIndex: number): number {
  let widest = 0;
  for (let i = 0; i < LINES[lineIndex].length; i += 1) {
    widest = Math.max(widest, localBoxFor(lineIndex, i).w);
  }
  return widest;
}

function historyTranslate(lineIndex: number): { x: number; y: number } {
  const originX = HISTORY_RIGHT - blockWidth(lineIndex) * HISTORY_SCALE;
  return {
    x: originX - BLOCK_LEFT * HISTORY_SCALE,
    y: HISTORY_TOP - BLOCK_TOP * HISTORY_SCALE,
  };
}

function lineEnd(lineIndex: number): number {
  return lineIndex < HANDOFF_STARTS.length ? HANDOFF_STARTS[lineIndex] : FINAL_HOLD_START;
}

function tokenActiveEnd(lineIndex: number, tokenIndex: number): number {
  const onsets = TOKEN_ONSETS[lineIndex];
  if (tokenIndex + 1 < onsets.length) return onsets[tokenIndex + 1] + STEP_OVERLAP;
  return lineEnd(lineIndex);
}

function currentLineIndex(t: number): number {
  let index = 0;
  for (let i = 0; i < HANDOFF_STARTS.length; i += 1) {
    if (t >= HANDOFF_STARTS[i]) index = i + 1;
  }
  return index;
}

function transformAt(lineIndex: number, p: number, opacity: number): LineTransform {
  const target = historyTranslate(lineIndex);
  return {
    lineIndex,
    translate: { x: target.x * p, y: target.y * p },
    scale: 1 + (HISTORY_SCALE - 1) * p,
    opacity,
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function stateAt(rawT: number): Frame {
  const t = clamp(Number.isFinite(rawT) ? rawT : 0, 0, DURATION);
  const mainIndex = currentLineIndex(t);
  const handoffIndex = mainIndex - 1;

  let handoffProgress = 0;
  let handoffActive = false;
  let main: LineTransform = transformAt(mainIndex, 0, 1);
  let history: LineTransform | null = null;
  let retiringHistory: LineTransform | null = null;
  let ghost: LineTransform | null = null;

  if (handoffIndex >= 0) {
    const start = HANDOFF_STARTS[handoffIndex];
    const linear = progress(t, start, HANDOFF_DURATION);
    handoffActive = linear > 0 && linear < 1;
    handoffProgress = easeInOutCubic(linear);
    history = transformAt(handoffIndex, handoffProgress, 1);
    main = transformAt(
      mainIndex,
      0,
      progress(t, start + HANDOFF_DURATION / 2, HANDOFF_DURATION / 2),
    );
    const ghostP = progress(t, start, GHOST_FADE_DURATION);
    if (ghostP < 1) ghost = transformAt(handoffIndex, 0, GHOST_START_OPACITY * (1 - ghostP));
    if (handoffIndex >= 1 && linear < 1) {
      retiringHistory = transformAt(handoffIndex - 1, 1, 1 - handoffProgress);
    }
  }

  const tokens: TokenFrame[] = [];
  for (let li = 0; li < LINES.length; li += 1) {
    let layer: Layer = "hidden";
    let lt: LineTransform | null = null;
    if (li === mainIndex) {
      layer = "main";
      lt = main;
    } else if (history && li === history.lineIndex) {
      layer = "history";
      lt = history;
    } else if (retiringHistory && li === retiringHistory.lineIndex) {
      layer = "history";
      lt = retiringHistory;
    }

    for (let ti = 0; ti < LINES[li].length; ti += 1) {
      const onset = TOKEN_ONSETS[li][ti];
      const activeEnd = tokenActiveEnd(li, ti);
      const isLastOfHandedLine = ti === LINES[li].length - 1 && li < HANDOFF_STARTS.length;
      const fadeDuration = isLastOfHandedLine ? HISTORY_LAST_FILL_DECAY : COMPLETE_FADE_DURATION;

      let state: TokenStateName;
      let fillOpacity: number;
      let boxScale = 1;
      if (t < onset) {
        state = "upcoming";
        fillOpacity = 0;
      } else if (t < activeEnd) {
        state = "active";
        fillOpacity = 1;
        boxScale =
          FILL_POP_FROM + (1 - FILL_POP_FROM) * easeOutCubic(progress(t, onset, FILL_POP_DURATION));
      } else {
        state = "completed";
        fillOpacity = 1 - progress(t, activeEnd, fadeDuration);
      }

      const localBox = localBoxFor(li, ti);
      const s = lt ? lt.scale : 1;
      const tx = lt ? lt.translate.x : 0;
      const ty = lt ? lt.translate.y : 0;
      tokens.push({
        lineIndex: li,
        tokenIndex: ti,
        word: LINES[li][ti],
        state,
        fillOpacity: round(fillOpacity),
        boxScale: round(boxScale),
        layer,
        localBox,
        box: {
          x: round(tx + localBox.x * s),
          y: round(ty + localBox.y * s),
          w: round(localBox.w * s),
          h: round(localBox.h * s),
        },
        textBaseline: { x: localBox.x + BOX_PAD_X, y: localBox.y + BOX_PAD_Y + CAP_HEIGHT },
        textWidth: round(wordWidth(LINES[li][ti])),
      });
    }
  }

  const roundTransform = (lt: LineTransform | null): LineTransform | null =>
    lt && {
      lineIndex: lt.lineIndex,
      translate: { x: round(lt.translate.x), y: round(lt.translate.y) },
      scale: round(lt.scale),
      opacity: round(lt.opacity),
    };

  return {
    t,
    handoff: { index: handoffIndex, progress: round(handoffProgress), active: handoffActive },
    main: roundTransform(main) as LineTransform,
    history: roundTransform(history),
    retiringHistory: roundTransform(retiringHistory),
    ghost: roundTransform(ghost),
    tokens,
  };
}

interface HalftonePatch {
  x: number;
  y: number;
  cols: number;
  rows: number;
  pitch: number;
  maxRadius: number;
}

const HALFTONE_PATCHES: readonly HalftonePatch[] = [
  { x: 420, y: 232, cols: 14, rows: 8, pitch: 14, maxRadius: 5 },
  { x: 40, y: 318, cols: 12, rows: 2, pitch: 12, maxRadius: 3 },
];

const textWidthCache = new Map<string, number>();

function measuredTextWidth(ctx: CanvasRenderingContext2D, word: string): number {
  const cached = textWidthCache.get(word);
  if (cached !== undefined) return cached;
  ctx.font = FONT;
  const width = ctx.measureText(word).width;
  textWidthCache.set(word, width);
  return width;
}

function drawHalftone(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.halftone;
  for (const patch of HALFTONE_PATCHES) {
    for (let r = 0; r < patch.rows; r += 1) {
      for (let c = 0; c < patch.cols; c += 1) {
        const falloff = (c / (patch.cols - 1) + r / Math.max(1, patch.rows - 1)) / 2;
        const radius = patch.maxRadius * (0.25 + 0.75 * falloff);
        ctx.beginPath();
        ctx.arc(patch.x + c * patch.pitch, patch.y + r * patch.pitch, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawToken(
  ctx: CanvasRenderingContext2D,
  token: TokenFrame,
  textColor: string,
  withFill: boolean,
): void {
  const b = token.localBox;
  if (withFill && token.fillOpacity > 0) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const w = b.w * token.boxScale;
    const h = b.h * token.boxScale;
    ctx.save();
    ctx.globalAlpha *= token.fillOpacity;
    ctx.fillStyle = COLORS.activeFill;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }
  const measured = measuredTextWidth(ctx, token.word);
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = textColor;
  ctx.translate(token.textBaseline.x, token.textBaseline.y);
  ctx.scale(measured > 0 ? token.textWidth / measured : 1, 1);
  ctx.fillText(token.word, 0, 0);
  ctx.restore();
}

function textColorFor(token: TokenFrame): string {
  if (token.state === "upcoming") return COLORS.dim;
  if (token.state === "active") return COLORS.activeText;
  return COLORS.neutral;
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  lt: LineTransform | null,
  mode: "live" | "ghost",
): void {
  if (!lt || lt.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = lt.opacity;
  ctx.translate(lt.translate.x, lt.translate.y);
  ctx.scale(lt.scale, lt.scale);
  for (const token of frame.tokens) {
    if (token.lineIndex !== lt.lineIndex) continue;
    if (mode === "ghost") drawToken(ctx, token, COLORS.neutral, false);
    else drawToken(ctx, token, textColorFor(token), true);
  }
  ctx.restore();
}

export default function draw(ctx: CanvasRenderingContext2D, t: number): void {
  const frame = stateAt(t);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawHalftone(ctx);
  drawLine(ctx, frame, frame.ghost, "ghost");
  drawLine(ctx, frame, frame.retiringHistory, "live");
  drawLine(ctx, frame, frame.history, "live");
  drawLine(ctx, frame, frame.main, "live");
  ctx.restore();
}
