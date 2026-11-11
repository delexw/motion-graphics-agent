import { ink, accent, clamp, ease, motionProgress, motionDrawing, TAU } from "./drawing";

export interface Body {
  x: number;
  y: number;
  r: number;
}

export const CENTRE = { x: 320, y: 160 } as const;
export const FIELD_THRESHOLD = 1;
export const GRID_SPACING = 4;
export const FIELD_BOUNDS = { left: 140, top: 20, right: 500, bottom: 300 } as const;
export const METABALL_TIMES = {
  splitStart: 0.7,
  splitEnd: 1.9,
  mergeStart: 3.6,
  mergeEnd: 4.6,
} as const;
const LINK_ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
const LINK_RADIUS = 24;
const ORBIT_RADIUS = 104;
const SETTLED_RADIUS = 52;
const ORBIT_TURN = Math.PI / 3;
const DIP_DEPTH = 46;

export const STAGE_LABELS = [
  { label: "IDEA", from: -1, to: 1.0 },
  { label: "LINKS", from: 1.3, to: 3.7 },
  { label: "SYSTEM", from: 4.0, to: 99 },
] as const;

function orbitDip(time: number, index: number) {
  const centre = 2.2 + index * 0.45;
  const distance = Math.abs(time - centre) / 0.4;
  return distance >= 1 ? 0 : DIP_DEPTH * (0.5 + 0.5 * Math.cos(distance * Math.PI));
}

export function bodiesAt(time: number): Body[] {
  const { splitStart, splitEnd, mergeStart, mergeEnd } = METABALL_TIMES;
  const split = motionProgress(time, splitStart, splitEnd);
  const merge = motionProgress(time, mergeStart, mergeEnd);
  const turn = ORBIT_TURN * ease((time - splitStart) / (mergeEnd - splitStart));
  const parent = { x: CENTRE.x, y: CENTRE.y, r: 46 - 12 * split + 8 * merge };
  const links = LINK_ANGLES.map((angle, index) => {
    const orbit = ORBIT_RADIUS * split - orbitDip(time, index);
    const radius = orbit + (SETTLED_RADIUS - orbit) * merge;
    const phase = angle + turn;
    return {
      x: CENTRE.x + Math.cos(phase) * radius,
      y: CENTRE.y + Math.sin(phase) * radius,
      r: LINK_RADIUS * (0.55 + 0.45 * split) - 2 * merge,
    };
  });
  return [parent, ...links];
}

export function fieldAt(bodies: readonly Body[], x: number, y: number) {
  let total = 0;
  for (const body of bodies) {
    const dx = x - body.x,
      dy = y - body.y;
    total += (body.r * body.r) / Math.max(1e-6, dx * dx + dy * dy);
  }
  return total;
}

export function sampleField(bodies: readonly Body[]) {
  const columns = Math.round((FIELD_BOUNDS.right - FIELD_BOUNDS.left) / GRID_SPACING) + 1;
  const rows = Math.round((FIELD_BOUNDS.bottom - FIELD_BOUNDS.top) / GRID_SPACING) + 1;
  const values = new Float64Array(columns * rows);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++)
      values[row * columns + column] =
        fieldAt(
          bodies,
          FIELD_BOUNDS.left + column * GRID_SPACING,
          FIELD_BOUNDS.top + row * GRID_SPACING,
        ) - FIELD_THRESHOLD;
  return { columns, rows, values };
}

export function insideComponents(bodies: readonly Body[]) {
  const { columns, rows, values } = sampleField(bodies);
  const seen = new Uint8Array(columns * rows);
  let components = 0;
  for (let start = 0; start < values.length; start++) {
    if (values[start] < 0 || seen[start]) continue;
    components++;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      const row = Math.floor(index / columns),
        column = index % columns;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const r = row + dr,
          c = column + dc;
        if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
        const next = r * columns + c;
        if (values[next] >= 0 && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
  }
  return components;
}

type Point = [number, number];

export function contourGeometry(bodies: readonly Body[]) {
  const { columns, rows, values } = sampleField(bodies);
  const polygons: Point[][] = [];
  const segments: [Point, Point][] = [];
  const at = (row: number, column: number): Point => [
    FIELD_BOUNDS.left + column * GRID_SPACING,
    FIELD_BOUNDS.top + row * GRID_SPACING,
  ];
  for (let row = 0; row < rows - 1; row++)
    for (let column = 0; column < columns - 1; column++) {
      const corners: { point: Point; value: number }[] = [
        { point: at(row, column), value: values[row * columns + column] },
        { point: at(row, column + 1), value: values[row * columns + column + 1] },
        { point: at(row + 1, column + 1), value: values[(row + 1) * columns + column + 1] },
        { point: at(row + 1, column), value: values[(row + 1) * columns + column] },
      ];
      const insideCount = corners.filter((corner) => corner.value >= 0).length;
      if (insideCount === 0) continue;
      if (insideCount === 4) {
        polygons.push(corners.map((corner) => corner.point));
        continue;
      }
      const polygon: Point[] = [];
      const crossings: { point: Point; leaving: boolean }[] = [];
      for (let i = 0; i < 4; i++) {
        const a = corners[i],
          b = corners[(i + 1) % 4];
        const aInside = a.value >= 0,
          bInside = b.value >= 0;
        if (aInside) polygon.push(a.point);
        if (aInside !== bInside) {
          const k = a.value / (a.value - b.value);
          const point: Point = [
            a.point[0] + (b.point[0] - a.point[0]) * k,
            a.point[1] + (b.point[1] - a.point[1]) * k,
          ];
          polygon.push(point);
          crossings.push({ point, leaving: aInside });
        }
      }
      crossings.forEach((crossing, index) => {
        if (crossing.leaving)
          segments.push([crossing.point, crossings[(index + 1) % crossings.length].point]);
      });
      polygons.push(polygon);
    }
  return { polygons, segments };
}

export function stageLabelOpacity(time: number, index: number) {
  const stage = STAGE_LABELS[index];
  return clamp(Math.min((time - stage.from) / 0.3, (stage.to - time) / 0.3));
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  const { text } = motionDrawing(c);
  const bodies = bodiesAt(t);
  c.fillStyle = "rgba(4, 10, 14, 0.35)";
  c.beginPath();
  c.ellipse(CENTRE.x, 292, 120, 8, 0, 0, TAU);
  c.fill();

  const { polygons, segments } = contourGeometry(bodies);
  c.beginPath();
  for (const polygon of polygons) {
    c.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) c.lineTo(polygon[i][0], polygon[i][1]);
    c.closePath();
  }
  c.fillStyle = accent;
  c.fill();

  c.beginPath();
  for (const [from, to] of segments) {
    c.moveTo(from[0], from[1]);
    c.lineTo(to[0], to[1]);
  }
  c.strokeStyle = "rgba(234, 241, 245, 0.55)";
  c.lineWidth = 1.6;
  c.stroke();

  const separated = (body: Body) =>
    Math.hypot(body.x - CENTRE.x, body.y - CENTRE.y) > bodies[0].r + body.r;
  for (const body of bodies) {
    if (body !== bodies[0] && !separated(body)) continue;
    c.fillStyle = "rgba(234, 241, 245, 0.42)";
    c.beginPath();
    c.ellipse(
      body.x - body.r * 0.36,
      body.y - body.r * 0.4,
      body.r * 0.2,
      body.r * 0.12,
      -0.6,
      0,
      TAU,
    );
    c.fill();
  }

  STAGE_LABELS.forEach((stage, index) => {
    const opacity = stageLabelOpacity(t, index);
    if (opacity <= 0) return;
    c.globalAlpha = opacity;
    text(stage.label, CENTRE.x, 334, 22, index === 2 ? ink : "#9FB0BC");
    c.globalAlpha = 1;
  });
}
