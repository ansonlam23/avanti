import { describe, expect, it } from "vitest";
import { laDay, laDayStart, summarizeInsights, TOP_ASKS } from "./summary";
import type { AiQueryRow } from "./types";

const MAI = "mais-bakery";
/** Saturday Oct 17 2026, 1:00 PM in Seattle (PDT, UTC-7). */
const NOW = new Date("2026-10-17T20:00:00Z");

let minute = 0;
/** A search today (Oct 17, PDT), a minute after the last one unless `at` is given. */
function row(query: string, shown: string[], matched: string[] = [], at?: string): AiQueryRow {
  minute += 1;
  return { query, shop_slugs: shown, matched_slugs: matched, created_at: at ?? new Date(Date.parse("2026-10-17T15:00:00Z") + minute * 60_000).toISOString() };
}

describe("today in Los Angeles", () => {
  it("starts at midnight Pacific, daylight time", () => {
    expect(laDayStart(NOW).toISOString()).toBe("2026-10-17T07:00:00.000Z");
    expect(laDay(NOW)).toBe("2026-10-17");
  });

  it("starts at midnight Pacific, standard time", () => {
    expect(laDayStart(new Date("2026-12-01T20:00:00Z")).toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });

  it("is still yesterday late in the evening, UTC's tomorrow", () => {
    const lateFriday = new Date("2026-10-17T06:59:59Z"); // Fri Oct 16, 11:59 PM PDT
    expect(laDay(lateFriday)).toBe("2026-10-16");
    expect(laDayStart(lateFriday).toISOString()).toBe("2026-10-16T07:00:00.000Z");
    expect(laDayStart(new Date("2026-10-17T07:00:00Z")).toISOString()).toBe("2026-10-17T07:00:00.000Z");
  });

  it("handles the days the clocks change", () => {
    // Sun Mar 8 2026: clocks spring forward at 2 AM, so the day began in PST.
    expect(laDayStart(new Date("2026-03-08T19:00:00Z")).toISOString()).toBe("2026-03-08T08:00:00.000Z");
    // Sun Nov 1 2026: clocks fall back at 2 AM, so the day began in PDT.
    expect(laDayStart(new Date("2026-11-01T20:00:00Z")).toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });
});

describe("summarizeInsights", () => {
  it("counts today's searches that showed the shop, matched it, and what it didn't have", () => {
    const rows = [
      row("birthday cake no nuts", [MAI, "ave-bakery"], [MAI, "ave-bakery"]),
      row("vegan cookies", [MAI], [MAI]),
      row("oat milk latte", ["petal-cart", MAI]),
      row("Oat milk lattes", ["petal-cart", MAI]),
      row("phone charger", ["goc-pho-market"], ["goc-pho-market"]), // another shop's search
      row("gluten-free bread", [MAI, "tall-stack-books"], ["tall-stack-books"]), // someone else had it
      row("bagels", [MAI], [], "2026-10-17T06:59:00Z"), // yesterday evening in Seattle
    ];
    expect(summarizeInsights(rows, MAI, { now: NOW, ordered: 2 })).toEqual({
      day: "2026-10-17",
      timezone: "America/Los_Angeles",
      since: "2026-10-17T07:00:00.000Z",
      shown: 5,
      matched: 2,
      ordered: 2,
      unmet: [
        { ask: "oat milk latte", count: 2, nobody_nearby: true },
        { ask: "gluten-free bread", count: 1, nobody_nearby: false },
      ],
    });
  });

  it("folds plurals and filler words, and shows the wording people used most", () => {
    const rows = [
      row("a sourdough loaf", [MAI]),
      row("Sourdough loaf", [MAI]),
      row("sourdough loaves please", [MAI]), // irregular plural: its own ask
      row("vegan cookie", [MAI]),
      row("Vegan cookies!", [MAI]),
      row("vegan cookies", [MAI]),
    ];
    const { unmet } = summarizeInsights(rows, MAI, { now: NOW, ordered: 0 });
    expect(unmet).toEqual([
      { ask: "vegan cookies", count: 3, nobody_nearby: true },
      { ask: "sourdough loaf", count: 2, nobody_nearby: true },
      { ask: "sourdough loaves please", count: 1, nobody_nearby: true },
    ]);
  });

  it("on a tie, prefers the shorter wording", () => {
    const rows = [row("oat milk latte", [MAI]), row("oat milk lattes", [MAI])];
    expect(summarizeInsights(rows, MAI, { now: NOW, ordered: 0 }).unmet[0].ask).toBe("oat milk latte");
  });

  it("keeps the top five, most asked first, then the most recent", () => {
    const rows = [
      row("egg tarts", [MAI]),
      row("bagels", [MAI]),
      row("matcha latte", [MAI]),
      row("mochi", [MAI]),
      row("baguette", [MAI]),
      row("challah", [MAI]),
      row("bagel", [MAI]),
    ];
    const { unmet, shown } = summarizeInsights(rows, MAI, { now: NOW, ordered: 0 });
    expect(shown).toBe(7);
    expect(unmet).toHaveLength(TOP_ASKS);
    expect(unmet.map((u) => u.ask)).toEqual(["bagel", "challah", "baguette", "mochi", "matcha latte"]);
    expect(unmet[0].count).toBe(2);
  });

  it("says no shop had it only when no search for it matched anywhere", () => {
    const rows = [row("oat milk latte", [MAI]), row("oat milk latte", [MAI, "cafe"], ["cafe"])];
    expect(summarizeInsights(rows, MAI, { now: NOW, ordered: 0 }).unmet).toEqual([
      { ask: "oat milk latte", count: 2, nobody_nearby: false },
    ]);
  });

  it("is all zeros on a quiet day", () => {
    expect(summarizeInsights([], MAI, { now: NOW, ordered: 0 })).toMatchObject({ shown: 0, matched: 0, ordered: 0, unmet: [] });
  });

  it("ignores rows it can't date or count", () => {
    const rows = [row("bagels", [MAI], [], "not a date"), row("...", [MAI])];
    expect(summarizeInsights(rows, MAI, { now: NOW, ordered: 0 })).toMatchObject({ shown: 1, matched: 0, unmet: [] });
  });
});
