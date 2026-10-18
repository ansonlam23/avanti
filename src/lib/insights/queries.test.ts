import { describe, expect, it } from "vitest";
import type { SearchShop, SearchShopsResult } from "@/lib/ai/shopper-types";
import { askKey, askLabel, cleanQuery, cleanText, foldWord, MAX_QUERY_CHARS, scrubDetails, searchLogRow } from "./queries";

type Result = Pick<SearchShopsResult, "shops" | "other_open_shops">;

const found = (slug: string, matches = 1) => ({ slug, matches: Array.from({ length: matches }, () => ({})) }) as unknown as SearchShop;
const nearby = (slug: string) => ({ slug, name: slug, is_demo: true, walk_minutes: 10 });

describe("cleanQuery", () => {
  it("keeps one trimmed line", () => {
    expect(cleanQuery("  oat   milk\n latte\t ")).toBe("oat milk latte");
  });

  it("turns control characters into spaces (Postgres text can't hold NUL)", () => {
    expect(cleanQuery("vegan\u0000cookies\u0007")).toBe("vegan cookies");
  });

  it("cuts at 200 characters, never through an emoji", () => {
    expect(Array.from(cleanQuery("x".repeat(250)))).toHaveLength(MAX_QUERY_CHARS);
    const emoji = cleanQuery(`${"y".repeat(199)}🎂🎂`);
    expect(Array.from(emoji)).toHaveLength(MAX_QUERY_CHARS);
    expect(emoji.endsWith("🎂")).toBe(true);
  });

  it("removes emails and long numbers, keeps quantities", () => {
    expect(cleanQuery("cake for jane.doe@example.com please")).toBe("cake for please");
    expect(cleanQuery("call me (206) 555-0123 about cupcakes")).toBe("call me about cupcakes");
    expect(cleanQuery("card 4111 1111 1111 1111")).toBe("card");
    expect(cleanQuery("10 - 12 cupcakes, 2 dozen")).toBe("10 - 12 cupcakes, 2 dozen");
  });

  it("is empty for nothing worth keeping", () => {
    expect(cleanQuery("   ")).toBe("");
    expect(cleanQuery(42)).toBe("");
    expect(cleanQuery(undefined)).toBe("");
  });
});

describe("scrubDetails / cleanText", () => {
  it("scrubs only runs of 7+ digits", () => {
    expect(scrubDetails("55-0123")).toBe("55-0123");
    expect(scrubDetails("555-0123")).toBe(" ");
    expect(scrubDetails("+1 (206) 555-0123")).toBe(" ");
  });

  it("cleanText leaves numbers alone (deadlines)", () => {
    expect(cleanText("2026-10-17T17:30:00-07:00", 40)).toBe("2026-10-17T17:30:00-07:00");
    expect(cleanText("x".repeat(50), 40)).toHaveLength(40);
  });
});

describe("searchLogRow", () => {
  it("logs the shops a search returned, and which of them matched", () => {
    const result: Result = { shops: [found("mais-bakery", 2), found("ave-bakery")], other_open_shops: [] };
    expect(searchLogRow("chat", { query: "birthday cake", needed_by: "17:30" }, result)).toEqual({
      source: "chat",
      query: "birthday cake",
      needed_by: "17:30",
      shop_slugs: ["mais-bakery", "ave-bakery"],
      matched_slugs: ["mais-bakery", "ave-bakery"],
    });
  });

  it("when nothing matched, the open shops nearby were returned and none matched", () => {
    const result: Result = { shops: [], other_open_shops: [nearby("petal-cart"), nearby("mais-bakery")] };
    expect(searchLogRow("mcp", { query: "oat milk latte" }, result)).toEqual({
      source: "mcp",
      query: "oat milk latte",
      needed_by: null,
      shop_slugs: ["petal-cart", "mais-bakery"],
      matched_slugs: [],
    });
  });

  it("never lists a shop twice, and a shop without matching items isn't matched", () => {
    const result: Result = { shops: [found("mais-bakery"), found("ave-bakery", 0)], other_open_shops: [nearby("mais-bakery")] };
    const row = searchLogRow("chat", { query: "cake" }, result);
    expect(row?.shop_slugs).toEqual(["mais-bakery", "ave-bakery"]);
    expect(row?.matched_slugs).toEqual(["mais-bakery"]);
  });

  it("skips an empty query and blank deadlines", () => {
    expect(searchLogRow("chat", { query: " \n " }, { shops: [], other_open_shops: [] })).toBeNull();
    expect(searchLogRow("chat", { query: "bagels", needed_by: "  " }, { shops: [], other_open_shops: [] })?.needed_by).toBeNull();
  });
});

describe("foldWord", () => {
  it.each([
    ["cookies", "cookie"],
    ["berries", "berry"],
    ["pastries", "pastry"],
    ["brownies", "brownie"],
    ["cakes", "cake"],
    ["lattes", "latte"],
    ["sunflowers", "sunflower"],
    ["boxes", "box"],
    ["sandwiches", "sandwich"],
    ["glasses", "glass"],
    ["pies", "pie"],
    ["tacos", "taco"],
    ["trays", "tray"],
  ])("%s and %s fold together", (plural, singular) => {
    expect(foldWord(plural)).toBe(foldWord(singular));
  });

  it("leaves words that only look plural alone", () => {
    expect(foldWord("hummus")).toBe("hummus");
    expect(foldWord("glass")).toBe("glass");
    expect(foldWord("bus")).toBe("bus");
    expect(foldWord("12s")).toBe("12s");
  });
});

describe("askKey", () => {
  it("counts the same ask once however it's written", () => {
    const key = askKey("oat milk latte");
    expect(askKey("Oat Milk Lattes!")).toBe(key);
    expect(askKey("  some oat-milk latte ")).toBe(askKey("oat milk latte"));
    expect(askKey("a sourdough loaf")).toBe(askKey("Sourdough loaf"));
    expect(askKey("crème brûlée")).toBe(askKey("creme brulees"));
  });

  it("keeps different asks apart", () => {
    expect(askKey("vegan cookies")).not.toBe(askKey("cookies"));
    expect(askKey("gluten-free bread")).not.toBe(askKey("bread"));
  });

  it("is empty when nothing is left", () => {
    expect(askKey("the ...")).toBe("");
  });
});

describe("askLabel", () => {
  it("shows the wording, lowercased, without filler or stray punctuation", () => {
    expect(askLabel("  Gluten-free   bread?! ")).toBe("gluten-free bread");
    expect(askLabel("a sourdough loaf")).toBe("sourdough loaf");
    expect(askLabel("Some vegan cookies, please.")).toBe("vegan cookies, please");
    expect(askLabel("“Mai's croissant”")).toBe("mai's croissant");
  });

  it("keeps a one-word ask even when it's a filler word", () => {
    expect(askLabel("any")).toBe("any");
  });

  it("cuts long wording with an ellipsis", () => {
    const label = askLabel(`cake ${"very ".repeat(30)}big`);
    expect(label.endsWith("…")).toBe(true);
    expect(Array.from(label).length).toBeLessThanOrEqual(81);
  });
});
