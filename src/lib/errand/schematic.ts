// Lay lat/lng points out in a small box for the errand's route sketch: north
// up, true to shape, then nudged apart so no two pins overlap. No map tiles. Pure.
import type { Spot } from "./route";

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  width: number;
  height: number;
  /** Space kept clear on every side (room for a pin). */
  pad: number;
}

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_AT_EQUATOR = 111_320;

/**
 * Projects `spots` into `box` (equirectangular around their middle, one scale for
 * both axes, centred), then pushes pins closer than `minGap` apart and keeps them
 * inside the padded box. A sketch, not a survey: shape first, legibility second.
 */
export function layoutSpots(spots: readonly Spot[], box: Box, minGap = 0): Point[] {
  if (!spots.length) return [];
  const lat0 = spots.reduce((s, p) => s + p.lat, 0) / spots.length;
  const lng0 = spots.reduce((s, p) => s + p.lng, 0) / spots.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG_LNG_AT_EQUATOR;
  const meters = spots.map((p) => ({ x: (p.lng - lng0) * kx, y: (lat0 - p.lat) * M_PER_DEG_LAT }));

  const xs = meters.map((m) => m.x);
  const ys = meters.map((m) => m.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const innerW = Math.max(0, box.width - 2 * box.pad);
  const innerH = Math.max(0, box.height - 2 * box.pad);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(spanX > 1e-6 ? innerW / spanX : Infinity, spanY > 1e-6 ? innerH / spanY : Infinity);
  const k = Number.isFinite(scale) ? scale : 0; // every spot in one place → the centre
  const cx = box.width / 2;
  const cy = box.height / 2;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const pts = meters.map((m) => ({ x: cx + (m.x - midX) * k, y: cy + (m.y - midY) * k }));

  if (minGap > 0 && pts.length > 1) separate(pts, box, minGap);
  return pts;
}

function clampInto(p: Point, box: Box) {
  p.x = Math.min(box.width - box.pad, Math.max(box.pad, p.x));
  p.y = Math.min(box.height - box.pad, Math.max(box.pad, p.y));
}

/** Pairwise push-apart, a few rounds; deterministic (coincident pins split along a fixed angle per pair). */
function separate(pts: Point[], box: Box, gap: number) {
  for (let round = 0; round < 60; round++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= gap - 1e-6) continue;
        if (d < 1e-6) {
          const angle = ((i * 7 + j * 3) % 12) * (Math.PI / 6);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push = (gap - Math.hypot(b.x - a.x, b.y - a.y)) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        clampInto(a, box);
        clampInto(b, box);
        moved = true;
      }
    }
    if (!moved) break;
  }
}
