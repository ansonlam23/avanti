// Hand-drawn geometry for chalk lines, circles and strikes (pure, deterministic).
// Same seed → same path, so a menu never "re-draws" itself differently on re-render.

export type Rand = () => number;

/** Small, fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Uniform float in [-amp, amp]. */
export function jitter(r: Rand, amp: number): number {
  return (r() * 2 - 1) * amp;
}

const f = (n: number) => Math.round(n * 10) / 10;

/** A slightly bowed hand-drawn line (one cubic). */
export function roughLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: Rand,
  { bow = 1.6, wobble = 0.8 }: { bow?: number; wobble?: number } = {},
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // unit normal
  const nx = -dy / len;
  const ny = dx / len;
  const b1 = jitter(r, bow);
  const b2 = jitter(r, bow);
  const c1x = x1 + dx * 0.33 + nx * b1 + jitter(r, wobble);
  const c1y = y1 + dy * 0.33 + ny * b1 + jitter(r, wobble);
  const c2x = x1 + dx * 0.68 + nx * b2 + jitter(r, wobble);
  const c2y = y1 + dy * 0.68 + ny * b2 + jitter(r, wobble);
  return `M${f(x1)} ${f(y1)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x2)} ${f(y2)}`;
}

/**
 * A loose chalk loop around a box: starts at a random angle, goes round a bit
 * more than once (overshoot) and slowly spirals inward so the two passes don't
 * sit exactly on top of each other, like a real hand-drawn circle.
 */
export function roughEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: Rand,
  { overshoot = 0.16, wobble = 0.045, points = 26 }: { overshoot?: number; wobble?: number; points?: number } = {},
): string {
  const start = -Math.PI * (0.55 + r() * 0.2); // begin top-left, like most people do
  const sweep = Math.PI * 2 * (1 + overshoot);
  const pts: [number, number][] = [];
  let drift = 0;
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const a = start + sweep * t;
    drift += jitter(r, wobble * 0.35);
    const k = 1 + drift + jitter(r, wobble * 0.4) - t * 0.05;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return catmullRom(pts);
}

/** Catmull-Rom spline through points, as cubic Béziers. */
export function catmullRom(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** A quick strike-through: starts a little before the text, ends a little past it, rising slightly. */
export function roughStrike(width: number, y: number, r: Rand): string {
  const x1 = -4 + jitter(r, 2);
  const x2 = width + 4 + jitter(r, 3);
  const rise = 1.5 + r() * 2.5;
  return roughLine(x1, y + rise / 2, x2, y - rise / 2, r, { bow: 1.2, wobble: 0.6 });
}
