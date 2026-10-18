import { describe, expect, it } from "vitest";
import type { AskShopResult, ItemSummary, MenuResult, OrderProposal, SearchShop, SearchShopsResult } from "@/lib/ai/shopper-types";
import { askedNeeds, factsFor, metNeeds, needsIn, orderReasons, readyBy, shopLine, type WhyFacts, type WhySource } from "./why";

const item = (id: string, tags: string[] = [], over: Partial<ItemSummary> = {}): ItemSummary => ({
  id,
  name: id,
  name_en: null,
  description: null,
  price_cents: 1800,
  tags,
  stock: 3,
  sold_out: false,
  available: true,
  ...over,
});

const shop = (over: Partial<SearchShop> = {}): SearchShop => ({
  slug: "mais-bakery",
  name: "Mai's Bakery",
  tagline: null,
  is_demo: true,
  photo_url: null,
  location_label: "University Way NE",
  walk_minutes: 11,
  pickup_window: { start: "08:00", end: "18:00" },
  pickup_open_now: true,
  earliest_pickup: "3:40 PM",
  accepts_ai_orders: true,
  max_per_order: 2,
  ready_by_needed: true,
  matches: [item("cake", ["nut-free"])],
  more_matches: 0,
  ...over,
});

const search = (query: string, neededBy: string | null, shops: SearchShop[]): WhySource => ({
  kind: "search",
  result: { ok: true, query, needed_by: neededBy, shopper_location: "UW campus", shops, other_open_shops: [] } satisfies SearchShopsResult,
});

const ask = (question: string, items: ItemSummary[], slug = "mais-bakery"): WhySource => ({
  kind: "ask",
  result: {
    ok: true,
    shop: { slug, name: "Mai's Bakery", is_demo: true },
    question,
    topics: [],
    items,
    rules: { max_per_order: 2, accept_ai_orders: true, notes: null },
    pickup_window: { start: "08:00", end: "18:00" },
    location_label: null,
    tagline: null,
    answer_rule: "",
  } satisfies AskShopResult,
});

const menu = (items: ItemSummary[], limit: number | null = null): WhySource => ({
  kind: "menu",
  result: { ok: true, shop: { ...shop({ ai_order_limit_cents: limit }), open: true, notes: null }, items } satisfies MenuResult,
});

const proposal = (over: Partial<OrderProposal> = {}): OrderProposal => ({
  shop_slug: "mais-bakery",
  shop_name: "Mai's Bakery",
  is_demo: true,
  location_label: null,
  walk_minutes: 11,
  item_id: "cake",
  item_name: "Chocolate cake",
  item_name_en: null,
  qty: 1,
  unit_price_cents: 1800,
  amount_cents: 1800,
  currency: "USD",
  pickup_time: "2026-10-18T00:30:00.000Z",
  pickup_label: "5:30 PM",
  stock_left: 3,
  max_per_order: 2,
  ...over,
});

const facts = (over: Partial<WhyFacts> = {}): WhyFacts => ({ tags: null, asked: [], neededBy: null, aiLimitCents: null, ...over });
const texts = (p: OrderProposal, f: WhyFacts) => orderReasons(p, f).map((r) => r.text);

describe("needsIn", () => {
  it("reads the need from the AI's question to the shop", () => {
    expect(needsIn("Does the chocolate cake have nuts?")).toEqual(["nut-free"]);
    expect(needsIn("Is it gluten-free and dairy free?")).toEqual(["gluten-free", "dairy-free"]);
    expect(needsIn("anything vegan? plant-based is fine")).toEqual(["vegan"]);
    expect(needsIn("does it have eggs")).toEqual(["egg-free"]);
  });

  it("matches whole words only", () => {
    expect(needsIn("eggplant dip")).toEqual([]);
    expect(needsIn("nutmeg latte")).toEqual([]);
    expect(needsIn("peanut butter cookie")).toEqual(["peanut-free"]); // peanut ≠ tree nuts
  });

  it("finds nothing in an empty or plain search", () => {
    expect(needsIn("birthday cake")).toEqual([]);
    expect(needsIn("")).toEqual([]);
    expect(needsIn(null)).toEqual([]);
  });

  it("collects what was asked across searches and questions", () => {
    const sources = [search("vegan cookies", null, []), ask("Does it have nuts?", [])];
    expect(askedNeeds(sources).sort()).toEqual(["nut-free", "vegan"]);
  });
});

describe("metNeeds", () => {
  it("keeps only the owner's tags that meet an asked need, verbatim", () => {
    expect(metNeeds(["nut-free", "vegan"], ["nut-free"])).toEqual(["nut-free"]);
    expect(metNeeds(["Nut-Free"], ["nut-free"])).toEqual(["nut-free"]);
  });

  it("never turns a 'contains' tag or a near-miss into a reason", () => {
    expect(metNeeds(["contains-nuts"], ["nut-free"])).toEqual([]);
    expect(metNeeds(["vegetarian"], ["vegan"])).toEqual([]); // vegetarian isn't vegan
    expect(metNeeds(["vegan"], ["nut-free"])).toEqual([]); // vegan doesn't mean nut-free
    expect(metNeeds(null, ["nut-free"])).toEqual([]);
  });
});

describe("readyBy", () => {
  it("says the deadline when the pickup is at or before it, the same day", () => {
    expect(readyBy("5:30 PM", "6 PM")).toBe("ready by 6");
    expect(readyBy("6 PM", "6 PM")).toBe("ready by 6");
    expect(readyBy("11:30 AM", "12 PM")).toBe("ready by 12 PM");
    expect(readyBy("tomorrow 9 AM", "tomorrow 10:30 AM")).toBe("ready by 10:30");
  });

  it("says nothing when the pickup is late, on another day, or unknown", () => {
    expect(readyBy("6:30 PM", "6 PM")).toBeNull();
    expect(readyBy("tomorrow 9 AM", "6 PM")).toBeNull();
    expect(readyBy("5:30 PM", null)).toBeNull();
    expect(readyBy("soon", "6 PM")).toBeNull();
  });
});

describe("factsFor", () => {
  it("takes the item's tags and deadline from the search that found it, the cap from the shop", () => {
    const f = factsFor([search("birthday cake", "6 PM", [shop({ ai_order_limit_cents: 2000 })])], proposal());
    expect(f).toEqual({ tags: ["nut-free"], asked: [], neededBy: "6 PM", aiLimitCents: 2000 });
  });

  it("knows nothing about an item no card shows", () => {
    const f = factsFor([search("cake", "6 PM", [shop()])], proposal({ item_id: "brownie" }));
    expect(f.tags).toBeNull();
    expect(f.neededBy).toBeNull(); // the deadline belongs to the search that found the item
  });

  it("ignores other shops", () => {
    const f = factsFor([search("cake", "6 PM", [shop({ slug: "ave-bakery" })])], proposal());
    expect(f).toEqual(facts());
  });

  it("the newest card wins: a later search without a deadline clears it", () => {
    const f = factsFor([search("cake", "6 PM", [shop()]), search("cake", null, [shop()])], proposal());
    expect(f.neededBy).toBeNull();
  });

  it("reads tags from a menu or the shop's own answer, and the questions asked", () => {
    const f = factsFor([menu([item("cake", ["dairy-free"])], 2500), ask("Is the cake nut-free?", [item("cake", ["nut-free"])])], proposal());
    expect(f).toEqual({ tags: ["nut-free"], asked: ["nut-free"], neededBy: null, aiLimitCents: 2500 });
  });
});

describe("orderReasons", () => {
  it("explains the pick with the shop's own words first", () => {
    const f = facts({ tags: ["nut-free"], asked: ["nut-free"], neededBy: "6 PM" });
    expect(texts(proposal(), f)).toEqual(["nut-free, per the shop", "ready by 6", "11 min walk"]);
  });

  it("keeps the line short", () => {
    const f = facts({ tags: ["nut-free"], asked: ["nut-free"], neededBy: "6 PM", aiLimitCents: 2000 });
    expect(orderReasons(proposal(), f)).toHaveLength(3);
  });

  it("never invents a reason: no asked need, no deadline, no walk, no cap → only what's true", () => {
    expect(texts(proposal(), facts())).toEqual(["11 min walk", "in stock"]);
    // a tag nobody asked about isn't a reason, and "in stock" alone explains nothing
    expect(texts(proposal({ walk_minutes: null }), facts({ tags: ["nut-free"] }))).toEqual([]);
  });

  it("says the owner's AI limit only when the order is within it", () => {
    expect(texts(proposal(), facts({ aiLimitCents: 2000 }))).toEqual(["11 min walk", "within the shop's $20 AI limit", "in stock"]);
    expect(texts(proposal({ amount_cents: 3600, qty: 2 }), facts({ aiLimitCents: 2000 }))).toEqual(["11 min walk", "in stock"]);
  });

  it("leaves out 'ready by' when the pickup misses the deadline", () => {
    expect(texts(proposal({ pickup_label: "tomorrow 8 AM" }), facts({ neededBy: "6 PM" }))).toEqual(["11 min walk", "in stock"]);
  });
});

describe("shopLine", () => {
  it("leads with the asked need the shop's own tags meet, then walk and the deadline", () => {
    expect(shopLine(shop(), "6 PM", ["nut-free"])).toEqual(["nut-free", "11 min walk", "ready by 6 PM"]);
  });

  it("without an asked need it's the plain facts", () => {
    expect(shopLine(shop(), "6 PM", [])).toEqual(["11 min walk", "ready by 6 PM"]);
    expect(shopLine(shop({ ready_by_needed: false }), "6 PM", [])).toEqual(["11 min walk", "can't make 6 PM"]);
    expect(shopLine(shop({ walk_minutes: null, ready_by_needed: null }), null, [])).toEqual(["University Way NE", "pickup till 6 PM"]);
  });

  it("only counts matches that can still be ordered", () => {
    const sold = shop({ matches: [item("cake", ["nut-free"], { sold_out: true, available: false })] });
    expect(shopLine(sold, null, ["nut-free"])).toEqual(["11 min walk", "pickup till 6 PM"]);
    expect(shopLine(shop(), null, ["nut-free"], { cake: true })).toEqual(["11 min walk", "pickup till 6 PM"]);
    const inPerson = shop({ matches: [item("cake", ["nut-free"], { ai_orderable: false })] });
    expect(shopLine(inPerson, null, ["nut-free"])).toEqual(["11 min walk", "pickup till 6 PM"]);
  });
});
