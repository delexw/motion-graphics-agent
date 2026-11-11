import { accent, warm, clamp, ease, seeded, TAU } from "./drawing";

type Point = [number, number];

const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number) =>
  Array.from({ length: 13 }, (_, i): Point => {
    const angle = ((from + ((to - from) * i) / 12) * Math.PI) / 180;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });

export const LETTER_STROKES: Record<string, Point[][]> = {
  I: [
    [
      [0.2, 0],
      [0.8, 0],
    ],
    [
      [0.5, 0],
      [0.5, 1],
    ],
    [
      [0.2, 1],
      [0.8, 1],
    ],
  ],
  D: [
    [
      [0.12, 0],
      [0.12, 1],
    ],
    [[0.12, 0], ...arc(0.46, 0.5, 0.44, 0.5, -90, 90), [0.12, 1]],
  ],
  E: [
    [
      [0.88, 0],
      [0.14, 0],
      [0.14, 1],
      [0.88, 1],
    ],
    [
      [0.14, 0.5],
      [0.72, 0.5],
    ],
  ],
  A: [
    [
      [0.04, 1],
      [0.5, 0],
      [0.96, 1],
    ],
    [
      [0.24, 0.62],
      [0.76, 0.62],
    ],
  ],
  S: [[...arc(0.5, 0.26, 0.4, 0.26, -15, -270), ...arc(0.5, 0.74, 0.4, 0.26, -90, 165)]],
  Y: [
    [
      [0.04, 0],
      [0.5, 0.5],
      [0.96, 0],
    ],
    [
      [0.5, 0.5],
      [0.5, 1],
    ],
  ],
  T: [
    [
      [0.04, 0],
      [0.96, 0],
    ],
    [
      [0.5, 0],
      [0.5, 1],
    ],
  ],
  M: [
    [
      [0.06, 1],
      [0.06, 0],
      [0.5, 0.62],
      [0.94, 0],
      [0.94, 1],
    ],
  ],
};

export interface WordBox {
  word: string;
  centreY: number;
  letterWidth: number;
  letterHeight: number;
  gap: number;
}
export const WORDS: readonly WordBox[] = [
  { word: "IDEA", centreY: 172, letterWidth: 86, letterHeight: 124, gap: 30 },
  { word: "SYSTEM", centreY: 172, letterWidth: 70, letterHeight: 104, gap: 20 },
];
export const PARTICLE_COUNT = 620;
export const STROKE_JITTER = 5;
export const ASSEMBLY = {
  gatherStart: 0.6,
  gatherSpread: 0.55,
  gatherDuration: 0.95,
  reformStart: 2.75,
  reformSpread: 0.45,
  reformDuration: 1.0,
} as const;
export const GATHERED_BY = ASSEMBLY.gatherStart + ASSEMBLY.gatherSpread + ASSEMBLY.gatherDuration;
export const REFORMED_BY = ASSEMBLY.reformStart + ASSEMBLY.reformSpread + ASSEMBLY.reformDuration;

export function wordPolylines(box: WordBox): Point[][] {
  const letters = [...box.word];
  const total = letters.length * box.letterWidth + (letters.length - 1) * box.gap;
  const left = 320 - total / 2,
    top = box.centreY - box.letterHeight / 2;
  return letters.flatMap((letter, index) =>
    LETTER_STROKES[letter].map((stroke) =>
      stroke.map(([x, y]): Point => [
        left + index * (box.letterWidth + box.gap) + x * box.letterWidth,
        top + y * box.letterHeight,
      ]),
    ),
  );
}

export function sampleTargets(box: WordBox, count: number, seed: number): Point[] {
  const segments = wordPolylines(box).flatMap((stroke) =>
    stroke.slice(1).map((end, i) => [stroke[i], end] as [Point, Point]),
  );
  const lengths = segments.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const random = seeded(seed);
  const points: Point[] = [];
  let segment = 0,
    before = 0;
  for (let i = 0; i < count; i++) {
    const distance = ((i + 0.5) / count) * total;
    while (before + lengths[segment] < distance && segment < segments.length - 1)
      before += lengths[segment++];
    const [a, b] = segments[segment];
    const k = lengths[segment] ? (distance - before) / lengths[segment] : 0;
    const nx = -(b[1] - a[1]) / (lengths[segment] || 1),
      ny = (b[0] - a[0]) / (lengths[segment] || 1);
    const offset = (random() * 2 - 1) * STROKE_JITTER;
    points.push([a[0] + (b[0] - a[0]) * k + nx * offset, a[1] + (b[1] - a[1]) * k + ny * offset]);
  }
  return points;
}

export interface Particle {
  start: Point;
  phase: [number, number];
  gatherDelay: number;
  reformDelay: number;
  bulge: number;
  first: Point;
  second: Point;
}

const byX = (a: Point, b: Point) => a[0] - b[0] || a[1] - b[1];

export const PARTICLES: readonly Particle[] = (() => {
  const random = seeded(54);
  const starts = Array.from({ length: PARTICLE_COUNT }, (): Point => [
    20 + random() * 600,
    20 + random() * 320,
  ]).sort(byX);
  const first = sampleTargets(WORDS[0], PARTICLE_COUNT, 541).sort(byX);
  const second = sampleTargets(WORDS[1], PARTICLE_COUNT, 542).sort(byX);
  return starts.map((start, i) => ({
    start,
    phase: [random() * TAU, random() * TAU],
    gatherDelay: random() * ASSEMBLY.gatherSpread,
    reformDelay: random() * ASSEMBLY.reformSpread,
    bulge: (random() * 2 - 1) * 46,
    first: first[i],
    second: second[i],
  }));
})();

export function gatherProgress(particle: Particle, time: number) {
  return ease((time - ASSEMBLY.gatherStart - particle.gatherDelay) / ASSEMBLY.gatherDuration);
}

export function reformProgress(particle: Particle, time: number) {
  return ease((time - ASSEMBLY.reformStart - particle.reformDelay) / ASSEMBLY.reformDuration);
}

export function particlePosition(particle: Particle, time: number): Point {
  const drift: Point = [
    particle.start[0] + 9 * Math.sin(0.8 * time + particle.phase[0]),
    particle.start[1] + 7 * Math.cos(0.7 * time + particle.phase[1]),
  ];
  const shimmer = 0.5 * Math.sin(3 * time + particle.phase[0]);
  const gathered = gatherProgress(particle, time);
  const reform = reformProgress(particle, time);
  if (reform <= 0)
    return [
      drift[0] + (particle.first[0] + shimmer - drift[0]) * gathered,
      drift[1] + (particle.first[1] + shimmer - drift[1]) * gathered,
    ];
  const [ax, ay] = particle.first,
    [bx, by] = particle.second;
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const control: Point = [
    (ax + bx) / 2 - ((by - ay) / length) * particle.bulge,
    (ay + by) / 2 + ((bx - ax) / length) * particle.bulge,
  ];
  const u = reform,
    v = 1 - u;
  return [
    v * v * ax + 2 * v * u * control[0] + u * u * bx + shimmer,
    v * v * ay + 2 * v * u * control[1] + u * u * by + shimmer,
  ];
}

const mix = (from: string, to: string, k: number) => {
  const channel = (hex: string, shift: number) => (parseInt(hex.slice(1), 16) >> shift) & 255;
  const value = (shift: number) =>
    Math.round(channel(from, shift) + (channel(to, shift) - channel(from, shift)) * k);
  return `rgb(${value(16)}, ${value(8)}, ${value(0)})`;
};

export default function draw(c: CanvasRenderingContext2D, t: number) {
  for (const particle of PARTICLES) {
    const [x, y] = particlePosition(particle, t);
    const gathered = gatherProgress(particle, t);
    const reform = reformProgress(particle, t);
    c.globalAlpha = 0.45 + 0.55 * clamp(gathered + reform);
    c.fillStyle = reform > 0 ? mix(accent, warm, reform) : accent;
    const size = 2.2 + gathered;
    c.fillRect(x - size / 2, y - size / 2, size, size);
  }
  c.globalAlpha = 1;
}
