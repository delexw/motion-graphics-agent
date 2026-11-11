import { ink, accent, warm, clamp, motionProgress, motionDrawing, TAU } from "./drawing";

export const PATH = { left: 60, right: 580, baseline: 176, amplitude: 64, samples: 160 } as const;
export const PATH_TIMES = { drawEnd: 0.5, bendStart: 0.45, bendEnd: 1.0 } as const;
export const TRAVEL = { start: 1.3, end: 4.4 } as const;
export const STOPS = [
  { label: "Idea", fraction: 0.08 },
  { label: "Links", fraction: 0.5 },
  { label: "System", fraction: 0.92 },
] as const;
export const PHRASE = "idea → links → system";
export const TEXT_GAP = 18;
export const TEXT_LIFT = 17;
export const LETTER_SPACING = 1.5;
const FONT = "600 15px sans-serif";

export interface ArcTable {
  points: [number, number][];
  lengths: number[];
  total: number;
}

export function pathPoints(time: number): [number, number][] {
  const amplitude = PATH.amplitude * motionProgress(time, PATH_TIMES.bendStart, PATH_TIMES.bendEnd);
  return Array.from({ length: PATH.samples + 1 }, (_, i) => {
    const u = i / PATH.samples;
    return [
      PATH.left + (PATH.right - PATH.left) * u,
      PATH.baseline + amplitude * Math.sin(u * TAU),
    ];
  });
}

export function arcTable(points: [number, number][]): ArcTable {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  return { points, lengths, total: lengths[lengths.length - 1] };
}

export function pointAtDistance(table: ArcTable, distance: number) {
  const s = Math.max(0, Math.min(table.total, distance));
  let low = 0,
    high = table.lengths.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (table.lengths[middle] <= s) low = middle;
    else high = middle;
  }
  const [ax, ay] = table.points[low],
    [bx, by] = table.points[high];
  const span = table.lengths[high] - table.lengths[low];
  const k = span > 0 ? (s - table.lengths[low]) / span : 0;
  return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, angle: Math.atan2(by - ay, bx - ax) };
}

export function travelProgress(time: number) {
  return motionProgress(time, TRAVEL.start, TRAVEL.end);
}

export function dotDistance(time: number) {
  const table = arcTable(pathPoints(time));
  const from = STOPS[0].fraction * table.total,
    to = STOPS[STOPS.length - 1].fraction * table.total;
  return from + (to - from) * travelProgress(time);
}

export function stopReachedAt(index: number) {
  if (index === 0) return TRAVEL.start;
  const target =
    (STOPS[index].fraction - STOPS[0].fraction) /
    (STOPS[STOPS.length - 1].fraction - STOPS[0].fraction);
  let low: number = TRAVEL.start,
    high: number = TRAVEL.end;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (travelProgress(middle) < target) low = middle;
    else high = middle;
  }
  return high;
}

export function glyphLayout(time: number, advances: readonly number[]) {
  const table = arcTable(pathPoints(time));
  const head = dotDistance(time) - TEXT_GAP;
  const glyphs = [...PHRASE];
  let tail = head;
  const placed = glyphs.map(() => ({ s: 0, advance: 0 }));
  for (let i = glyphs.length - 1; i >= 0; i--) {
    const advance = advances[i] + LETTER_SPACING;
    placed[i] = { s: tail - advance / 2, advance };
    tail -= advance;
  }
  return glyphs.map((glyph, i) => {
    const { s } = placed[i];
    const point = pointAtDistance(table, s);
    const lifted = {
      x: point.x + Math.sin(point.angle) * TEXT_LIFT,
      y: point.y - Math.cos(point.angle) * TEXT_LIFT,
    };
    return {
      glyph,
      s,
      angle: point.angle,
      ...lifted,
      opacity: clamp(Math.min(s / 24, (table.total - s) / 12)),
    };
  });
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  const table = arcTable(pathPoints(t));
  const drawn = table.total * motionProgress(t, 0, PATH_TIMES.drawEnd);

  c.beginPath();
  const start = table.points[0];
  c.moveTo(start[0], start[1]);
  for (let i = 1; i < table.points.length; i++) {
    if (table.lengths[i] <= drawn) {
      c.lineTo(table.points[i][0], table.points[i][1]);
      continue;
    }
    const end = pointAtDistance(table, drawn);
    c.lineTo(end.x, end.y);
    break;
  }
  c.strokeStyle = accent;
  c.lineWidth = 3;
  c.stroke();

  const ride = dotDistance(t);
  STOPS.forEach((stop, index) => {
    const appear = motionProgress(t, 0.85 + index * 0.12, 1.15 + index * 0.12);
    if (appear <= 0) return;
    const point = pointAtDistance(table, stop.fraction * table.total);
    const reached = t >= TRAVEL.start && ride >= stop.fraction * table.total - 0.5;
    const since = t - stopReachedAt(index);
    const pop = reached ? 1 + 0.4 * Math.sin(clamp(since / 0.3) * Math.PI) : 1;
    c.globalAlpha = appear;
    c.beginPath();
    c.fillStyle = reached ? warm : "#14212B";
    c.arc(point.x, point.y, 8 * pop, 0, TAU);
    c.fill();
    c.strokeStyle = reached ? warm : ink;
    c.lineWidth = 2;
    c.stroke();
    const labelX = point.x - Math.sin(point.angle) * 32,
      labelY = point.y + Math.cos(point.angle) * 32 + 6;
    text(stop.label, labelX, labelY, 17, reached ? ink : "#9FB0BC");
    c.globalAlpha = 1;
  });

  c.font = FONT;
  const advances = [...PHRASE].map((glyph) => c.measureText(glyph).width);
  for (const glyph of glyphLayout(t, advances)) {
    if (glyph.opacity <= 0 || t < TRAVEL.start) continue;
    c.save();
    c.globalAlpha = glyph.opacity;
    c.translate(glyph.x, glyph.y);
    c.rotate(glyph.angle);
    c.fillStyle = ink;
    c.font = FONT;
    c.textAlign = "center";
    c.fillText(glyph.glyph, 0, 5);
    c.restore();
  }

  if (t >= TRAVEL.start - 0.2) {
    const dot = pointAtDistance(table, ride);
    c.save();
    c.globalAlpha = clamp((t - TRAVEL.start + 0.2) / 0.2);
    c.translate(dot.x, dot.y);
    c.rotate(dot.angle);
    c.beginPath();
    c.fillStyle = warm;
    c.arc(0, 0, 11, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(-3, -5);
    c.lineTo(-3, 5);
    c.closePath();
    c.fillStyle = "#14212B";
    c.fill();
    c.restore();
  }
}
