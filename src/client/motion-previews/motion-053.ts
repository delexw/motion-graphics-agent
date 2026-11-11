import { Vector3 } from "three";
import { makeCamera, projector, type ScreenPoint } from "../motion-orbit-preview";
import { ink, accent, warm, dark, ease, motionProgress } from "./drawing";

export const GRID = { columns: 8, rows: 4, width: 80, height: 90 } as const;
export const FLIP = { start: 0.8, step: 0.07, duration: 0.75 } as const;
export const CAPTION = { text: "idea · links · system", y: 300, height: 28, size: 19 } as const;
export const LETTER_FLIP = { start: 2.45, step: 0.045, duration: 0.35 } as const;
export const FLIP_END = FLIP.start + (GRID.columns - 1 + GRID.rows - 1) * FLIP.step + FLIP.duration;
const PIXELS_PER_UNIT = 100;
const FIELD_OF_VIEW = 40;
export const CAMERA_DISTANCE = 1.8 / Math.tan((FIELD_OF_VIEW / 2) * (Math.PI / 180));
const project = projector(
  makeCamera(new Vector3(0, 0, CAMERA_DISTANCE), new Vector3(0, 0, 0), FIELD_OF_VIEW),
);
const SYSTEM_FIELD = "#1E3644";

export function drawIdeaScene(c: CanvasRenderingContext2D) {
  c.fillStyle = accent;
  c.fillRect(0, 0, 640, 360);
  c.fillStyle = dark;
  c.textAlign = "center";
  c.font = "700 104px sans-serif";
  c.fillText("IDEA", 320, 214);
  c.font = "600 20px sans-serif";
  c.fillText("one spark", 320, 262);
}

export function drawSystemScene(c: CanvasRenderingContext2D) {
  c.fillStyle = SYSTEM_FIELD;
  c.fillRect(0, 0, 640, 360);
  const nodes: [number, number][] = [
    [236, 92],
    [320, 66],
    [404, 92],
  ];
  c.strokeStyle = warm;
  c.lineWidth = 3;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(...nodes[0]);
  c.lineTo(...nodes[1]);
  c.lineTo(...nodes[2]);
  c.moveTo(...nodes[0]);
  c.lineTo(...nodes[2]);
  c.stroke();
  for (const [x, y] of nodes) {
    c.beginPath();
    c.fillStyle = warm;
    c.arc(x, y, 10, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = ink;
  c.textAlign = "center";
  c.font = "700 84px sans-serif";
  c.fillText("SYSTEM", 320, 210);
}

export function tileStart(column: number, row: number) {
  return FLIP.start + (column + row) * FLIP.step;
}

export function tileAngle(time: number, column: number, row: number) {
  const start = tileStart(column, row);
  return Math.PI * ease((time - start) / FLIP.duration);
}

const toWorld = (x: number, y: number) =>
  new Vector3((x - 320) / PIXELS_PER_UNIT, (180 - y) / PIXELS_PER_UNIT, 0);

export function signedArea(points: readonly ScreenPoint[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function tileQuad(time: number, column: number, row: number) {
  const angle = tileAngle(time, column, row);
  const centre = toWorld((column + 0.5) * GRID.width, (row + 0.5) * GRID.height);
  const halfWidth = GRID.width / 2 / PIXELS_PER_UNIT,
    halfHeight = GRID.height / 2 / PIXELS_PER_UNIT;
  const corner = (sx: number, sy: number) =>
    project(
      new Vector3(
        centre.x + sx * halfWidth * Math.cos(angle),
        centre.y + sy * halfHeight,
        -sx * halfWidth * Math.sin(angle),
      ),
    );
  const left = { top: corner(-1, 1), bottom: corner(-1, -1) };
  const right = { top: corner(1, 1), bottom: corner(1, -1) };
  const face: "front" | "back" =
    signedArea([left.top, right.top, right.bottom, left.bottom]) >= 0 ? "front" : "back";
  const [tl, tr, br, bl] =
    face === "front"
      ? [left.top, right.top, right.bottom, left.bottom]
      : [right.top, left.top, left.bottom, right.bottom];
  const depth = (tl.depth + tr.depth + br.depth + bl.depth) / 4;
  return { angle, face, corners: { tl, tr, br, bl }, depth };
}

function paintIntoQuad(
  c: CanvasRenderingContext2D,
  corners: { tl: ScreenPoint; tr: ScreenPoint; br: ScreenPoint; bl: ScreenPoint },
  width: number,
  height: number,
  paint: () => void,
) {
  const { tl, tr, br, bl } = corners;
  c.save();
  c.beginPath();
  c.moveTo(tl.x, tl.y);
  c.lineTo(tr.x, tr.y);
  c.lineTo(br.x, br.y);
  c.lineTo(bl.x, bl.y);
  c.closePath();
  c.clip();
  c.transform(
    (tr.x - tl.x) / width,
    (tr.y - tl.y) / width,
    (bl.x - tl.x) / height,
    (bl.y - tl.y) / height,
    tl.x,
    tl.y,
  );
  paint();
  c.restore();
}

function clipToRect(c: CanvasRenderingContext2D, x: number, y: number, paint: () => void) {
  c.save();
  c.beginPath();
  c.rect(x, y, GRID.width, GRID.height);
  c.clip();
  paint();
  c.restore();
}

export function letterAngle(time: number, index: number) {
  return (
    (Math.PI / 2) *
    (1 -
      motionProgress(
        time,
        LETTER_FLIP.start + index * LETTER_FLIP.step,
        LETTER_FLIP.start + index * LETTER_FLIP.step + LETTER_FLIP.duration,
      ))
  );
}

function drawCaption(c: CanvasRenderingContext2D, time: number) {
  c.font = `600 ${CAPTION.size}px sans-serif`;
  const glyphs = [...CAPTION.text];
  const widths = glyphs.map((glyph) => c.measureText(glyph).width + 2);
  const total = widths.reduce((sum, width) => sum + width, 0);
  let x = 320 - total / 2;
  glyphs.forEach((glyph, index) => {
    const width = widths[index];
    const angle = letterAngle(time, index);
    const left = x;
    x += width;
    if (angle >= Math.PI / 2 - 1e-6 || glyph === " ") return;
    const centreY = (180 - CAPTION.y) / PIXELS_PER_UNIT;
    const halfHeight = CAPTION.height / 2 / PIXELS_PER_UNIT;
    const corner = (px: number, sy: number) =>
      project(
        new Vector3(
          (px - 320) / PIXELS_PER_UNIT,
          centreY + sy * halfHeight * Math.cos(angle),
          sy * halfHeight * Math.sin(angle),
        ),
      );
    paintIntoQuad(
      c,
      {
        tl: corner(left, 1),
        tr: corner(left + width, 1),
        br: corner(left + width, -1),
        bl: corner(left, -1),
      },
      width,
      CAPTION.height,
      () => {
        c.fillStyle = index % 2 ? ink : "#CFE0E8";
        c.font = `600 ${CAPTION.size}px sans-serif`;
        c.textAlign = "center";
        c.fillText(glyph, width / 2, CAPTION.height / 2 + CAPTION.size * 0.35);
      },
    );
  });
}

export default function draw(c: CanvasRenderingContext2D, t: number) {
  if (t <= FLIP.start) drawIdeaScene(c);
  else if (t >= FLIP_END) drawSystemScene(c);
  else {
    drawIdeaScene(c);
    const turning: { column: number; row: number; quad: ReturnType<typeof tileQuad> }[] = [];
    for (let row = 0; row < GRID.rows; row++)
      for (let column = 0; column < GRID.columns; column++) {
        const quad = tileQuad(t, column, row);
        const x = column * GRID.width,
          y = row * GRID.height;
        if (quad.angle <= 0) continue;
        if (quad.angle >= Math.PI) {
          clipToRect(c, x, y, () => drawSystemScene(c));
          continue;
        }
        c.fillStyle = dark;
        c.fillRect(x, y, GRID.width, GRID.height);
        turning.push({ column, row, quad });
      }
    turning.sort((a, b) => b.quad.depth - a.quad.depth);
    for (const { column, row, quad } of turning) {
      const x = column * GRID.width,
        y = row * GRID.height;
      paintIntoQuad(c, quad.corners, GRID.width, GRID.height, () => {
        c.translate(-x, -y);
        if (quad.face === "front") drawIdeaScene(c);
        else drawSystemScene(c);
        c.fillStyle = `rgba(4, 10, 14, ${0.5 * (1 - Math.abs(Math.cos(quad.angle)))})`;
        c.fillRect(x, y, GRID.width, GRID.height);
      });
    }
  }
  if (t >= LETTER_FLIP.start) drawCaption(c, t);
}
