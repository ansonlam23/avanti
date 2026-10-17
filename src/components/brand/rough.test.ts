import { describe, expect, it } from "vitest";
import { catmullRom, hashSeed, rng, roughEllipse, roughLine, roughStrike } from "./rough";

describe("rough (hand-drawn paths)", () => {
  it("rng is deterministic per seed and stays in [0, 1)", () => {
    const a = rng(42);
    const b = rng(42);
    const xs = Array.from({ length: 200 }, () => a());
    expect(xs).toEqual(Array.from({ length: 200 }, () => b()));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(rng(1)()).not.toBe(rng(2)());
  });

  it("hashSeed is stable and spreads similar strings", () => {
    expect(hashSeed("croissant")).toBe(hashSeed("croissant"));
    expect(hashSeed("item-1")).not.toBe(hashSeed("item-2"));
  });

  it("same seed → same path (a menu never re-draws itself differently)", () => {
    expect(roughLine(0, 0, 100, 0, rng(7))).toBe(roughLine(0, 0, 100, 0, rng(7)));
    expect(roughEllipse(50, 20, 60, 24, rng(3))).toBe(roughEllipse(50, 20, 60, 24, rng(3)));
  });

  it("paths are valid SVG path data with finite numbers", () => {
    const paths = [roughLine(0, 5, 120, 4, rng(1)), roughEllipse(80, 30, 90, 30, rng(2)), roughStrike(140, 12, rng(3))];
    for (const d of paths) {
      expect(d.startsWith("M")).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
  });

  it("the strike overshoots both ends of the text", () => {
    const d = roughStrike(100, 10, rng(9));
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums[0]).toBeLessThan(0); // starts before x = 0
    expect(nums[nums.length - 2]).toBeGreaterThan(100); // ends past the text
  });

  it("catmullRom passes through every point", () => {
    const d = catmullRom([
      [0, 0],
      [10, 5],
      [20, 0],
    ]);
    expect(d).toContain("10 5");
    expect(d.endsWith("20 0")).toBe(true);
  });
});
