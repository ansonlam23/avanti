import { describe, expect, it } from "vitest";
import { aiOrderLimitCents, checkAiRules, isAiOrderable, withAiOrderable } from "./ai-rules";

const cake = { id: "cake-1", name: "Chocolate cake" };

describe("aiOrderLimitCents", () => {
  it("reads a valid cap and ignores missing or nonsense values", () => {
    expect(aiOrderLimitCents({ ai_max_order_cents: 4000 })).toBe(4000);
    expect(aiOrderLimitCents({ ai_max_order_cents: null })).toBeNull();
    expect(aiOrderLimitCents({})).toBeNull();
    expect(aiOrderLimitCents(null)).toBeNull();
    expect(aiOrderLimitCents({ ai_max_order_cents: 50 })).toBeNull(); // under $1
    expect(aiOrderLimitCents({ ai_max_order_cents: 12.5 })).toBeNull();
  });
});

describe("isAiOrderable", () => {
  it("is true unless the owner blocked the item", () => {
    expect(isAiOrderable({}, cake.id)).toBe(true);
    expect(isAiOrderable({ ai_blocked_items: ["other"] }, cake.id)).toBe(true);
    expect(isAiOrderable({ ai_blocked_items: [cake.id] }, cake.id)).toBe(false);
  });
});

describe("checkAiRules", () => {
  it("allows an order inside the rules", () => {
    expect(checkAiRules({ ai_max_order_cents: 4000 }, "Mai's Bakery", cake, 1800)).toBeNull();
    expect(checkAiRules({ ai_max_order_cents: 4000 }, "Mai's Bakery", cake, 4000)).toBeNull(); // exactly at the cap
    expect(checkAiRules(undefined, "Mai's Bakery", cake, 999_99)).toBeNull();
  });

  it("refuses an item the owner keeps off-limits to AI", () => {
    const r = checkAiRules({ ai_blocked_items: [cake.id] }, "Mai's Bakery", cake, 1800);
    expect(r?.code).toBe("not_for_ai");
    expect(r?.message).toContain("Chocolate cake");
  });

  it("refuses an order over the AI spending cap, with both amounts", () => {
    const r = checkAiRules({ ai_max_order_cents: 4000 }, "Mai's Bakery", cake, 5400);
    expect(r).toMatchObject({ code: "over_ai_limit", limit_cents: 4000 });
    expect(r?.message).toContain("$40.00");
    expect(r?.message).toContain("$54.00");
  });

  it("checks the item rule before the cap", () => {
    expect(checkAiRules({ ai_blocked_items: [cake.id], ai_max_order_cents: 100 }, "S", cake, 5400)?.code).toBe("not_for_ai");
  });
});

describe("withAiOrderable", () => {
  it("adds and removes an item without duplicates", () => {
    expect(withAiOrderable([], "a", false)).toEqual(["a"]);
    expect(withAiOrderable(["a"], "a", false)).toEqual(["a"]);
    expect(withAiOrderable(["a", "b"], "a", true)).toEqual(["b"]);
    expect(withAiOrderable(undefined, "a", true)).toEqual([]);
  });
});
