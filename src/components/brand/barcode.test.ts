import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128Bars, code128Values, toCode128B } from "./barcode";

describe("Code 128 table", () => {
  it("has 107 symbols (0–102 data, 103–105 starts, 106 stop)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
  });

  it("every data/start symbol is 3 bars + 3 spaces, 11 modules, widths 1–4", () => {
    for (const p of CODE128_PATTERNS.slice(0, 106)) {
      expect(p).toMatch(/^[1-4]{6}$/);
      expect([...p].reduce((s, d) => s + Number(d), 0)).toBe(11);
    }
  });

  it("bars always cover an even number of modules (Code 128 parity rule)", () => {
    for (const p of CODE128_PATTERNS.slice(0, 106)) {
      const bars = Number(p[0]) + Number(p[2]) + Number(p[4]);
      expect(bars % 2).toBe(0);
    }
  });

  it("every symbol is unique (decodable)", () => {
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it("the stop symbol is 13 modules", () => {
    expect([...CODE128_PATTERNS[106]].reduce((s, d) => s + Number(d), 0)).toBe(13);
  });
});

describe("encoding", () => {
  it("adds start B, the mod-103 checksum and stop", () => {
    // "Wikipedia": 104 + Σ value·position = 3281 → 3281 mod 103 = 88
    const v = code128Values("Wikipedia");
    expect(v[0]).toBe(104);
    expect(v.at(-2)).toBe(88);
    expect(v.at(-1)).toBe(106);
    expect(v).toHaveLength(9 + 3);
  });

  it("keeps printable ASCII and replaces the rest", () => {
    expect(toCode128B("4821-7F3C")).toBe("4821-7F3C");
    expect(toCode128B("code · 4821")).toBe("code ? 4821");
  });

  it("is 11 modules per symbol + 13 for stop, starting with a bar", () => {
    const { bars, width } = code128Bars("4821");
    expect(width).toBe(11 * (1 + 4 + 1) + 13);
    expect(bars[0]).toEqual([0, 2]); // start B begins with a 2-module bar
    const last = bars.at(-1)!;
    expect(last[0] + last[1]).toBe(width); // ends on the stop's final bar
  });
});
