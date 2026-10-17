import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "@/lib/ai/shopper-types";
import { parseToolArgs, TOOL_DECLARATIONS } from "./declarations";

describe("tool declarations", () => {
  it("declares exactly the five read-only tools (no way to place an order)", () => {
    expect(TOOL_DECLARATIONS.map((d) => d.name)).toEqual([...TOOL_NAMES]);
    expect(TOOL_DECLARATIONS.map((d) => d.name)).not.toContain("place_order");
    for (const d of TOOL_DECLARATIONS) expect(d.parametersJsonSchema).toMatchObject({ type: "object" });
  });
});

describe("parseToolArgs (sanitizing what the model sends)", () => {
  it("normalizes slugs and rejects bad ones", () => {
    expect(parseToolArgs("get_menu", { shop_slug: " Mais-Bakery " })).toEqual({ ok: true, args: { shop_slug: "mais-bakery" } });
    expect(parseToolArgs("get_menu", { shop_slug: "../../etc" }).ok).toBe(false);
    expect(parseToolArgs("get_menu", {}).ok).toBe(false);
  });

  it("coerces qty, defaults it to 1, and bounds it", () => {
    const base = { shop_slug: "mais-bakery", item_id: "x", pickup_time: "17:30" };
    expect(parseToolArgs("propose_order", { ...base, qty: "2" })).toMatchObject({ ok: true, args: { qty: 2 } });
    expect(parseToolArgs("propose_order", base)).toMatchObject({ ok: true, args: { qty: 1 } });
    expect(parseToolArgs("propose_order", { ...base, qty: 500 }).ok).toBe(false);
  });

  it("treats empty optional fields as null and trims text", () => {
    expect(parseToolArgs("search_shops", { query: "  cake ", needed_by: "" })).toEqual({
      ok: true,
      args: { query: "cake", needed_by: null },
    });
    expect(parseToolArgs("search_shops", { query: "" }).ok).toBe(false);
    expect(parseToolArgs("ask_shop", { shop_slug: "a", question: "x".repeat(301) }).ok).toBe(false);
  });
});
