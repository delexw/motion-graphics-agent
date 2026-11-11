import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadCatalog } from "../src/server/catalog/catalog";
import { catalogRoot } from "../src/server/runtime/config";
import { technologyPool } from "../src/shared/technology-pool";
import { createCreativePoolTools } from "../src/server/agents/capabilities/creative-pool/tools";
import { drawMotionPreview } from "../src/client/motion-drawing";
import { accent, dark } from "../src/client/motion-previews/drawing";
import {
  bodiesAt,
  fieldAt,
  insideComponents,
  METABALL_TIMES,
} from "../src/client/motion-previews/motion-051";
import {
  arcTable,
  dotDistance,
  glyphLayout,
  pathPoints,
  PHRASE,
  pointAtDistance,
  STOPS,
  stopReachedAt,
  travelProgress,
  TRAVEL,
} from "../src/client/motion-previews/motion-052";
import {
  drawSystemScene,
  FLIP,
  FLIP_END,
  GRID,
  letterAngle,
  tileAngle,
  tileQuad,
  tileStart,
  CAMERA_DISTANCE,
  CAPTION,
} from "../src/client/motion-previews/motion-053";
import {
  GATHERED_BY,
  PARTICLE_COUNT,
  PARTICLES,
  particlePosition,
  REFORMED_BY,
  WORDS,
  wordPolylines,
} from "../src/client/motion-previews/motion-054";
import {
  shutterPositions,
  streakLength,
  WHIPS,
  wordX,
} from "../src/client/motion-previews/motion-055";

const NEW_MOTIONS = ["motion-051", "motion-052", "motion-053", "motion-054", "motion-055"];
type Context = CanvasRenderingContext2D;

function render(id: string, time: number, canvas: Canvas = createCanvas(640, 360)) {
  drawMotionPreview(canvas.getContext("2d") as unknown as Context, id, time);
  return canvas;
}
const png = (id: string, time: number, canvas?: Canvas) =>
  render(id, time, canvas).toBuffer("image/png");
const pixels = (id: string, time: number) =>
  render(id, time).getContext("2d").getImageData(0, 0, 640, 360).data;

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colourRegions(data: Uint8ClampedArray, colour: number[], tolerance = 24) {
  const matches = new Uint8Array(640 * 360);
  for (let i = 0; i < matches.length; i++)
    matches[i] = Number(
      Math.abs(data[i * 4] - colour[0]) +
        Math.abs(data[i * 4 + 1] - colour[1]) +
        Math.abs(data[i * 4 + 2] - colour[2]) <=
        tolerance,
    );
  const sizes: number[] = [];
  for (let start = 0; start < matches.length; start++) {
    if (matches[start] !== 1) continue;
    let size = 0;
    const stack = [start];
    matches[start] = 2;
    while (stack.length) {
      const index = stack.pop()!;
      size++;
      const x = index % 640,
        y = Math.floor(index / 640);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= 640 || ny >= 360) continue;
        const next = ny * 640 + nx;
        if (matches[next] === 1) {
          matches[next] = 2;
          stack.push(next);
        }
      }
    }
    sizes.push(size);
  }
  return sizes.filter((size) => size > 40);
}

function inkBounds(data: Uint8ClampedArray, background = [20, 33, 43]) {
  let left = 640,
    right = -1,
    top = 360,
    bottom = -1;
  for (let y = 0; y < 360; y++)
    for (let x = 0; x < 640; x++) {
      const i = (y * 640 + x) * 4;
      const difference =
        Math.abs(data[i] - background[0]) +
        Math.abs(data[i + 1] - background[1]) +
        Math.abs(data[i + 2] - background[2]);
      if (difference < 30) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  return { left, right, top, bottom };
}

describe("composable technique catalog entries", () => {
  it("adds five complete motions without changing earlier IDs", async () => {
    const catalog = await loadCatalog();
    const raw = JSON.parse(
      await readFile(path.join(catalogRoot, "motion-pattern-catalog.json"), "utf8"),
    );
    expect(raw.metadata.pattern_count).toBe(raw.patterns.length);
    expect(catalog.motions.map((motion) => motion.id).slice(-5)).toEqual(NEW_MOTIONS);
    const styleNames = new Set(catalog.styles.map((style) => style.name_en));
    const poolNames = new Set(Object.values(technologyPool).map((entry) => entry.name));
    for (const id of NEW_MOTIONS) {
      const motion = raw.patterns.find((entry: { id: string }) => entry.id === id);
      expect(motion.motion_sequence.length, id).toBeGreaterThanOrEqual(4);
      expect(motion.verification.length, id).toBeGreaterThanOrEqual(4);
      expect(motion.executable_prompt_template, id).toContain(`(${id})`);
      for (const placeholder of ["{{subject}}", "{{visual_style}}", "{{motion_parameters}}"])
        expect(motion.executable_prompt_template, id).toContain(placeholder);
      expect(motion.executable_prompt_template, id).toMatch(/forward, backward and direct seeks/);
      expect(JSON.stringify(motion), id).not.toMatch(/HyperFrames|Multiplane|Remotion/);
      for (const name of motion.compatibility.good_fit) expect(styleNames, name).toContain(name);
      for (const library of motion.tech.suggested_libraries)
        expect(poolNames, library.name).toContain(library.name);
      expect(motion.source_evidence.source_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(motion.source_evidence.time_window_seconds[1]).toBeLessThanOrEqual(32.32);
      expect(motion.source_evidence.limitations.length, id).toBeGreaterThan(0);
    }
  });

  it("lets the generation agent find and read each technique through the creative pool", async () => {
    const server = createCreativePoolTools(new AbortController().signal);
    const client = new Client({ name: "technique-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    await client.connect(a);
    const searches: [string, string][] = [
      ["metaball", "motion-051"],
      ["text on path", "motion-052"],
      ["tile flip", "motion-053"],
      ["3d flip", "motion-053"],
      ["particle glyph", "motion-054"],
      ["motion blur", "motion-055"],
    ];
    for (const [query, id] of searches) {
      const result = await client.callTool({
        name: "search_pool",
        arguments: { query, kind: "motion" },
      });
      const entries = (result.structuredContent as { entries: { id: string }[] }).entries;
      expect(
        entries.map((entry) => entry.id),
        query,
      ).toContain(id);
    }
    for (const id of NEW_MOTIONS) {
      const result = await client.callTool({
        name: "read_pool_entry",
        arguments: { kind: "motion", idOrName: id },
      });
      const entry = (
        result.structuredContent as {
          entry: { definition: { executable_prompt_template: string } };
        }
      ).entry;
      expect(entry.definition.executable_prompt_template).toContain(id);
      expect(JSON.stringify(entry.definition)).not.toContain("source_frame_review");
    }
    await client.close();
  });
});

describe("rendered technique previews", () => {
  it("reproduces identical frames after forward, backward and direct seeks", () => {
    const checkpoints = [0.3, 1.2, 2.25, 3.05, 4.2, 5.8];
    for (const id of NEW_MOTIONS) {
      const forward = createCanvas(640, 360);
      const forwardFrames = new Map<number, Buffer>();
      for (let frame = 0; frame <= 180; frame++) {
        const time = frame / 30;
        render(id, time, forward);
        for (const checkpoint of checkpoints)
          if (Math.abs(time - checkpoint) < 1e-9 || frame === Math.round(checkpoint * 30))
            forwardFrames.set(checkpoint, forward.toBuffer("image/png"));
      }
      const backward = createCanvas(640, 360);
      for (const checkpoint of [...checkpoints].reverse()) {
        render(id, 6, backward);
        const buffer = png(id, Math.round(checkpoint * 30) / 30, backward);
        expect(buffer.equals(forwardFrames.get(checkpoint)!), `${id} backward ${checkpoint}`).toBe(
          true,
        );
        const direct = png(id, Math.round(checkpoint * 30) / 30);
        expect(direct.equals(forwardFrames.get(checkpoint)!), `${id} direct ${checkpoint}`).toBe(
          true,
        );
      }
    }
  });

  it("changes over time and settles into a readable hold", () => {
    for (const id of NEW_MOTIONS) expect(png(id, 0.4).equals(png(id, 3.2)), id).toBe(false);
    for (const id of ["motion-051", "motion-052", "motion-053", "motion-055"])
      expect(png(id, 5.0).equals(png(id, 5.95)), id).toBe(true);
  });
});

describe("metaball merge and split", () => {
  it("splits one body into separate drops, bridges on a pass and merges into one outline", () => {
    expect(insideComponents(bodiesAt(0.3))).toBe(1);
    expect(insideComponents(bodiesAt(3.45))).toBe(4);
    expect(insideComponents(bodiesAt(2.2))).toBe(3);
    expect(insideComponents(bodiesAt(METABALL_TIMES.mergeEnd + 0.4))).toBe(1);
  });

  it("keeps an isolated drop close to its authored radius", () => {
    const bodies = bodiesAt(3.45);
    for (const body of bodies.slice(1)) {
      const outward = [body.x - bodies[0].x, body.y - bodies[0].y];
      const length = Math.hypot(outward[0], outward[1]);
      let edge = 0;
      for (let r = 0; r < body.r * 2; r += 0.25) {
        const x = body.x + (outward[0] / length) * r,
          y = body.y + (outward[1] / length) * r;
        if (fieldAt(bodies, x, y) < 1) break;
        edge = r;
      }
      expect(edge / body.r).toBeGreaterThan(0.95);
      expect(edge / body.r).toBeLessThan(1.15);
    }
  });

  it("draws the same number of filled liquid regions that the field predicts", () => {
    const fill = hexRgb(accent);
    expect(colourRegions(pixels("motion-051", 3.45), fill)).toHaveLength(4);
    expect(colourRegions(pixels("motion-051", 5.2), fill)).toHaveLength(1);
  });
});

describe("path follow and text on path", () => {
  it("spaces glyphs evenly along the curve and turns each to the path direction", () => {
    const advances = [...PHRASE].map((glyph) => (glyph === " " ? 4 : 9));
    const time = 3.4;
    const layout = glyphLayout(time, advances);
    const table = arcTable(pathPoints(time));
    for (let i = 1; i < layout.length; i++)
      expect(layout[i].s - layout[i - 1].s).toBeCloseTo(
        (advances[i - 1] + advances[i]) / 2 + 1.5,
        6,
      );
    for (const glyph of layout.filter((entry) => entry.s > 2 && entry.s < table.total - 2)) {
      const before = pointAtDistance(table, glyph.s - 1.5),
        after = pointAtDistance(table, glyph.s + 1.5);
      const tangent = Math.atan2(after.y - before.y, after.x - before.x);
      expect(Math.abs(glyph.angle - tangent)).toBeLessThan(0.08);
    }
  });

  it("moves the dot by arc length, so distance follows the eased progress", () => {
    for (const time of [1.6, 2.4, 3.1, 3.9]) {
      const total = arcTable(pathPoints(time)).total;
      const from = STOPS[0].fraction * total,
        to = STOPS[2].fraction * total;
      expect((dotDistance(time) - from) / (to - from)).toBeCloseTo(travelProgress(time), 9);
    }
    const reached = STOPS.map((_, index) => stopReachedAt(index));
    expect(reached).toEqual([...reached].sort((a, b) => a - b));
    expect(reached[0]).toBe(TRAVEL.start);
    expect(reached[2]).toBeLessThanOrEqual(TRAVEL.end);
  });
});

describe("3D tile flip", () => {
  it("shows outgoing fronts before the flip and incoming backs after it", () => {
    for (let row = 0; row < GRID.rows; row++)
      for (let column = 0; column < GRID.columns; column++) {
        expect(tileQuad(FLIP.start - 0.01, column, row).face).toBe("front");
        expect(tileQuad(FLIP_END + 0.01, column, row).face).toBe("back");
      }
  });

  it("switches face when the tile turns edge-on to the camera and foreshortens the far edge", () => {
    for (const [column, row] of [
      [0, 0],
      [3, 1],
      [7, 3],
    ]) {
      const centreX = ((column + 0.5) * GRID.width - 320) / 100;
      for (let step = 1; step < 240; step++) {
        const time = tileStart(column, row) + (FLIP.duration * step) / 240;
        const angle = tileAngle(time, column, row);
        const facing = -Math.sin(angle) * centreX + Math.cos(angle) * CAMERA_DISTANCE;
        if (Math.abs(facing) < 1e-3) continue;
        expect(tileQuad(time, column, row).face, `${column},${row} at ${angle}`).toBe(
          facing > 0 ? "front" : "back",
        );
      }
    }
    let time = FLIP.start;
    while (tileAngle(time, 3, 1) < Math.PI / 3) time += 0.001;
    const { tl, tr, br, bl } = tileQuad(time, 3, 1).corners;
    const nearEdge = Math.hypot(tl.x - bl.x, tl.y - bl.y);
    const farEdge = Math.hypot(tr.x - br.x, tr.y - br.y);
    expect(nearEdge).toBeGreaterThan(farEdge * 1.03);
  });

  it("leaves finished tiles seamless and exactly matching the incoming scene", () => {
    const reference = createCanvas(640, 360);
    drawSystemScene(reference.getContext("2d") as unknown as Context);
    const mosaic = createCanvas(640, 360);
    const mosaicContext = mosaic.getContext("2d") as unknown as Context;
    for (let row = 0; row < GRID.rows; row++)
      for (let column = 0; column < GRID.columns; column++) {
        mosaicContext.save();
        mosaicContext.beginPath();
        mosaicContext.rect(column * GRID.width, row * GRID.height, GRID.width, GRID.height);
        mosaicContext.clip();
        drawSystemScene(mosaicContext);
        mosaicContext.restore();
      }
    const expected = mosaic.getContext("2d").getImageData(0, 0, 640, 360).data;
    const background = hexRgb(dark);
    const time = FLIP_END - 0.01;
    for (let row = 0; row < GRID.rows; row++)
      for (let column = 0; column < GRID.columns; column++)
        expect(tileAngle(time, column, row) >= Math.PI).toBe(
          column !== GRID.columns - 1 || row !== GRID.rows - 1,
        );
    const frame = pixels("motion-053", time);
    const lastTile = { x: (GRID.columns - 1) * GRID.width, y: (GRID.rows - 1) * GRID.height };
    let differing = 0,
      gaps = 0;
    for (let y = 0; y < 360; y++)
      for (let x = 0; x < 640; x++) {
        if (x >= lastTile.x - 12 && y >= lastTile.y - 12) continue;
        const i = (y * 640 + x) * 4;
        if (
          frame[i] !== expected[i] ||
          frame[i + 1] !== expected[i + 1] ||
          frame[i + 2] !== expected[i + 2]
        )
          differing++;
        if (
          frame[i] === background[0] &&
          frame[i + 1] === background[1] &&
          frame[i + 2] === background[2]
        )
          gaps++;
      }
    expect(differing).toBe(0);
    expect(gaps).toBe(0);
    expect(png("motion-053", FLIP_END + 0.05).equals(reference.toBuffer("image/png"))).toBe(true);
  });

  it("flips caption letters in reading order", () => {
    const glyphs = [...CAPTION.text].length;
    for (const time of [2.5, 2.8, 3.1, 3.4]) {
      const angles = Array.from({ length: glyphs }, (_, index) => letterAngle(time, index));
      for (let i = 1; i < angles.length; i++)
        expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1]);
    }
    expect(letterAngle(3.8, glyphs - 1)).toBe(0);
  });
});

const SHIMMER_LIMIT = 0.5 * Math.SQRT2 + 1e-9;

describe("particle glyph assembly", () => {
  it("lands every particle on its own target for each word and keeps the count", () => {
    expect(PARTICLES).toHaveLength(PARTICLE_COUNT);
    for (const particle of PARTICLES) {
      const first = particlePosition(particle, GATHERED_BY + 0.1);
      expect(Math.hypot(first[0] - particle.first[0], first[1] - particle.first[1])).toBeLessThan(
        SHIMMER_LIMIT,
      );
      const second = particlePosition(particle, REFORMED_BY + 0.1);
      expect(
        Math.hypot(second[0] - particle.second[0], second[1] - particle.second[1]),
      ).toBeLessThan(SHIMMER_LIMIT);
    }
    const scattered = PARTICLES.map((particle) => particlePosition(particle, 0.2));
    const xs = scattered.map(([x]) => x),
      ys = scattered.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(520);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(260);
  });

  it("concentrates the held frame inside the formed word", () => {
    for (const [word, time] of [
      [WORDS[0], GATHERED_BY + 0.3],
      [WORDS[1], REFORMED_BY + 0.5],
    ] as const) {
      const points = wordPolylines(word).flat();
      const bounds = {
        left: Math.min(...points.map(([x]) => x)) - 10,
        right: Math.max(...points.map(([x]) => x)) + 10,
        top: Math.min(...points.map(([, y]) => y)) - 10,
        bottom: Math.max(...points.map(([, y]) => y)) + 10,
      };
      const data = pixels("motion-054", time);
      let inside = 0,
        total = 0;
      for (let y = 0; y < 360; y++)
        for (let x = 0; x < 640; x++) {
          const i = (y * 640 + x) * 4;
          if (data[i] + data[i + 1] + data[i + 2] < 160) continue;
          total++;
          if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom)
            inside++;
        }
      expect(total, word.word).toBeGreaterThan(2000);
      expect(inside / total, word.word).toBe(1);
    }
  });
});

describe("velocity motion blur", () => {
  it("streaks only while fast, along the travel direction", () => {
    for (const time of [1.5, 3.0, 5.5]) {
      const index = time < 2 ? 0 : time < 4 ? 1 : 2;
      expect(streakLength(index, time)).toBeLessThan(0.75);
      expect(shutterPositions(index, time)).toHaveLength(1);
    }
    expect(streakLength(0, 0.52)).toBeGreaterThan(40);
    const entering = shutterPositions(0, 0.56);
    expect(entering.length).toBeGreaterThan(1);
    for (let i = 1; i < entering.length; i++) expect(entering[i]).toBeGreaterThan(entering[i - 1]);
    const leaving = shutterPositions(0, 2.3);
    for (let i = 1; i < leaving.length; i++) expect(leaving[i]).toBeGreaterThan(leaving[i - 1]);
    expect(wordX(0, WHIPS[0].enter[1])).toBe(320);
  });

  it("widens the rendered word only horizontally while it moves and lands sharp", () => {
    const sharp = inkBounds(pixels("motion-055", 1.5));
    const moving = inkBounds(pixels("motion-055", 0.62));
    expect(streakLength(0, 0.62)).toBeGreaterThan(20);
    expect(
      Math.abs(moving.right - moving.left - (sharp.right - sharp.left + streakLength(0, 0.62))),
    ).toBeLessThanOrEqual(3);
    expect(moving.left).toBeGreaterThanOrEqual(Math.floor(sharp.left + wordX(0, 0.62) - 320) - 2);
    expect(Math.abs(moving.bottom - moving.top - (sharp.bottom - sharp.top))).toBeLessThanOrEqual(
      2,
    );
    expect(png("motion-055", 1.3).equals(png("motion-055", 1.9))).toBe(true);
  });
});
