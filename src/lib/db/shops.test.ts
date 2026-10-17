import { describe, expect, it } from "vitest";
import { createShopRequestSchema, isAvailable, originFrom, toAgentMenu } from "@/lib/db/shops";
import type { Item, Shop } from "@/lib/types";

const validBody = {
  name: "  Mai's Bakery ",
  owner_language: "EN",
  photo_url: "https://example.supabase.co/storage/v1/object/public/shop-photos/shops/x.jpg",
  pickup_window: { start: "08:00", end: "18:00" },
  rules: { max_per_order: 2, accept_ai_orders: true },
  items: [
    { name: "Chocolate cake", price_cents: 1800, price_source: "spoken", tags: ["Nut Free", "nut-free"], stock: 2 },
    { name: "Round loaf", price_cents: null, price_source: "spoken", tags: [], stock: 1 },
    { name: "Cookie", price_cents: 300, price_source: "missing", tags: [], stock: 12 },
  ],
};

describe("createShopRequestSchema", () => {
  it("accepts a real onboarding payload and normalizes it", () => {
    const r = createShopRequestSchema.parse(validBody);
    expect(r.name).toBe("Mai's Bakery");
    expect(r.owner_language).toBe("en");
    expect(r.is_demo).toBe(false);
    expect(r.items[0].tags).toEqual(["nut-free"]);
    // a null price is always "missing"; a typed price can't claim to be missing
    expect(r.items[1].price_source).toBe("missing");
    expect(r.items[2].price_source).toBe("owner");
    expect(r.items[0].name_en).toBeNull();
  });

  it.each([
    ["no items", { ...validBody, items: [] }],
    ["31 items", { ...validBody, items: Array.from({ length: 31 }, () => validBody.items[0]) }],
    ["window ends before it starts", { ...validBody, pickup_window: { start: "18:00", end: "08:00" } }],
    ["bad clock", { ...validBody, pickup_window: { start: "8am", end: "18:00" } }],
    ["zero price", { ...validBody, items: [{ ...validBody.items[0], price_cents: 0 }] }],
    ["fractional cents", { ...validBody, items: [{ ...validBody.items[0], price_cents: 4.5 }] }],
    ["negative stock", { ...validBody, items: [{ ...validBody.items[0], stock: -1 }] }],
    ["javascript: photo url", { ...validBody, photo_url: "javascript:alert(1)" }],
    ["max per order 0", { ...validBody, rules: { max_per_order: 0, accept_ai_orders: true } }],
    ["empty name", { ...validBody, name: "   " }],
  ])("rejects %s", (_, body) => {
    expect(createShopRequestSchema.safeParse(body).success).toBe(false);
  });
});

const shop: Shop = {
  id: "s1",
  slug: "mais-bakery",
  name: "Mai's Bakery",
  tagline: null,
  owner_language: "en",
  photo_url: null,
  open: true,
  pickup_window: { start: "08:00", end: "18:00" },
  rules: { max_per_order: 2, accept_ai_orders: true },
  is_demo: false,
  location_label: "University Way NE, Seattle",
  lat: 47.66,
  lng: -122.31,
  created_at: "2026-10-16T19:00:00Z",
};

const item = (over: Partial<Item>): Item => ({
  id: "i1",
  shop_id: "s1",
  name: "Chocolate cake",
  name_en: null,
  description: null,
  price_cents: 1800,
  price_source: "spoken",
  tags: ["nut-free"],
  stock: 2,
  sold_out: false,
  sort: 0,
  created_at: "2026-10-16T19:00:00Z",
  ...over,
});

describe("toAgentMenu (CONTRACTS §5)", () => {
  const menu = toAgentMenu(
    shop,
    [item({}), item({ id: "i2", price_cents: null }), item({ id: "i3", stock: 0 }), item({ id: "i4", sold_out: true })],
    "https://open-sign.vercel.app",
  );

  it("has exactly the contract's keys", () => {
    expect(Object.keys(menu)).toEqual(["schema", "shop", "pickup_window", "rules", "items", "ordering", "updated_at"]);
    expect(menu.schema).toBe("open-sign/agent-menu@1");
    expect(Object.keys(menu.shop)).toEqual(["slug", "name", "tagline", "language", "photo_url", "open", "is_demo", "location"]);
    expect(menu.shop.location).toEqual({ label: "University Way NE, Seattle", lat: 47.66, lng: -122.31 });
    expect(menu.pickup_window).toEqual({ start: "08:00", end: "18:00", timezone: "America/Los_Angeles" });
    expect(menu.rules).toEqual({ max_per_order: 2, accept_ai_orders: true });
    expect(Object.keys(menu.items[0])).toEqual([
      "id", "name", "name_en", "description", "price_cents", "currency", "tags", "stock", "available",
    ]);
  });

  it("marks only priced, in-stock, not-sold-out items available", () => {
    expect(menu.items.map((i) => i.available)).toEqual([true, false, false, false]);
    expect(isAvailable({ sold_out: false, stock: 1, price_cents: 100 })).toBe(true);
  });

  it("points agents at an absolute, signed order endpoint", () => {
    expect(menu.ordering.endpoint).toBe("https://open-sign.vercel.app/api/shops/mais-bakery/orders");
    expect(menu.ordering.auth).toMatchObject({ alg: "ed25519", label: "sig1", tag: "agent-payer-auth", max_window_seconds: 480, unsigned_requests: "rejected" });
    expect(menu.ordering.auth.covered_components).toEqual(["@method", "@authority", "@path", "content-type", "content-digest"]);
    expect(Number.isNaN(Date.parse(menu.updated_at))).toBe(false);
  });
});

describe("originFrom", () => {
  it("prefers forwarded host/proto (Vercel), falls back to the URL", () => {
    const fwd = new Request("http://internal:3000/api/shops", {
      headers: { "x-forwarded-host": "open-sign.vercel.app", "x-forwarded-proto": "https" },
    });
    expect(originFrom(fwd)).toBe("https://open-sign.vercel.app");
    expect(originFrom(new Request("http://localhost:3101/s/x/agent.json"))).toBe("http://localhost:3101");
  });
});
