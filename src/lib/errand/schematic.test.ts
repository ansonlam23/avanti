import { describe, expect, it } from "vitest";
import { layoutSpots } from "./schematic";

const CAMPUS = { lat: 47.6553, lng: -122.3035 };
const RABBIT = { lat: 47.6573, lng: -122.3128 };
const PETAL = { lat: 47.6583, lng: -122.3129 };
const MAI = { lat: 47.6595, lng: -122.313 };
const BOX = { width: 340, height: 170, pad: 20 };

describe("layoutSpots", () => {
  it("keeps north up and east right", () => {
    const [campus, rabbit, , mai] = layoutSpots([CAMPUS, RABBIT, PETAL, MAI], BOX);
    expect(campus.x).toBeGreaterThan(rabbit.x); // campus is east of the Ave
    expect(mai.y).toBeLessThan(rabbit.y); // Mai's is north of Rabbit & Rook
  });

  it("fits every pin inside the padded box", () => {
    for (const p of layoutSpots([CAMPUS, RABBIT, PETAL, MAI], BOX, 30)) {
      expect(p.x).toBeGreaterThanOrEqual(BOX.pad - 1e-6);
      expect(p.x).toBeLessThanOrEqual(BOX.width - BOX.pad + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(BOX.pad - 1e-6);
      expect(p.y).toBeLessThanOrEqual(BOX.height - BOX.pad + 1e-6);
    }
  });

  it("uses the box: the far pair spans its height", () => {
    const pts = layoutSpots([CAMPUS, MAI], BOX);
    expect(Math.abs(pts[0].y - pts[1].y)).toBeCloseTo(BOX.height - 2 * BOX.pad, 3);
  });

  it("nudges pins apart so none overlap", () => {
    const pts = layoutSpots([CAMPUS, RABBIT, PETAL, MAI], BOX, 30);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(29.5);
      }
    }
  });

  it("splits shops at the very same spot, and centres a lone pin", () => {
    const pair = layoutSpots([PETAL, PETAL], BOX, 30);
    expect(Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y)).toBeGreaterThanOrEqual(29.5);
    expect(layoutSpots([PETAL], BOX)).toEqual([{ x: 170, y: 85 }]);
    expect(layoutSpots([], BOX)).toEqual([]);
  });
});
