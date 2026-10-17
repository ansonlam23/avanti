import { describe, expect, it } from "vitest";
import { demoStreet, item, NOW, shop } from "./fixtures";
import { menuResult } from "./menu";
import { searchCatalog, visibleShops } from "./search";

describe("search_shops", () => {
  it("finds cakes at open shops, with walk minutes, demo labels and live availability", () => {
    const { all } = demoStreet();
    const r = searchCatalog(all, { query: "birthday cake", needed_by: "18:00" }, NOW);
    expect(r.ok).toBe(true);
    expect(r.needed_by).toBe("6 PM");
    expect(r.shops.map((s) => s.slug)).toEqual(["ave-bakery", "mais-bakery"]); // both match; Ave is closer
    const ave = r.shops[0];
    expect(ave).toMatchObject({ is_demo: true, walk_minutes: 4, ready_by_needed: true, accepts_ai_orders: true });
    expect(ave.matches[0]).toMatchObject({ name: "Chocolate birthday cake", price_cents: 2200, available: true });
    const mai = r.shops[1];
    expect(mai).toMatchObject({ is_demo: false, walk_minutes: 10, pickup_open_now: true, earliest_pickup: "3:25 PM" });
    expect(mai.matches.map((m) => m.name)).toEqual(["Chocolate cake"]);
  });

  it("never lists closed shops", () => {
    const { all } = demoStreet();
    const r = searchCatalog(all, { query: "cheesecake" }, NOW);
    expect(r.shops).toEqual([]);
    expect(r.note).toMatch(/No open shop/);
    expect(r.other_open_shops.map((s) => s.slug)).toEqual(["ave-bakery", "mais-bakery", "pho-shizzle"]);
  });

  it("puts sold-out matches after available ones and marks them unavailable", () => {
    const { mai } = demoStreet();
    mai.items.push({ ...mai.items[0], id: "00000000-0000-4000-8000-999999999999", name: "Carrot cake", sold_out: true, sort: 0 });
    const r = searchCatalog([mai], { query: "cake" }, NOW);
    expect(r.shops[0].matches.map((m) => [m.name, m.available])).toEqual([
      ["Chocolate cake", true],
      ["Carrot cake", false],
    ]);
  });

  it("ranks shops that can't make the deadline last", () => {
    const { mai, pho } = demoStreet();
    pho.items[0].name_en = "Beef pho cake"; // contrived so both shops match "cake"
    // At 7 AM with a 9 AM deadline: Mai's opens at 8 (ready), Pho Corner only at 11 (not ready).
    const r = searchCatalog([pho, mai], { query: "cake", needed_by: "09:00" }, new Date("2026-10-16T14:00:00Z"));
    expect(r.shops.map((s) => [s.slug, s.ready_by_needed])).toEqual([
      ["mais-bakery", true],
      ["pho-shizzle", false],
    ]);
  });

  it("matches a shop by name and shows its menu head", () => {
    const { all } = demoStreet();
    const r = searchCatalog(all, { query: "Mai's" }, NOW);
    expect(r.shops[0].slug).toBe("mais-bakery");
    expect(r.shops[0].matches.length).toBeGreaterThan(0);
  });

  it("returns walk_minutes null when a shop has no coordinates", () => {
    const { all } = demoStreet();
    const r = searchCatalog(all, { query: "pho" }, NOW);
    expect(r.shops[0]).toMatchObject({ slug: "pho-shizzle", walk_minutes: null });
    expect(r.shops[0].matches[0]).toMatchObject({ name: "Phở bò", name_en: "Beef pho" });
  });
});

describe("search visibility on the public demo (CONTRACTS §11)", () => {
  function street() {
    const s = demoStreet();
    const stranger = shop({ slug: "someones-cakes", name: "Someone's Cakes", listed: false });
    stranger.items = [item(stranger.id, { name: "Lemon cake", price_cents: 1200 })];
    const copy = shop({
      slug: "mais-bakery-3fa2c1",
      name: "Mai's Bakery",
      is_demo: true,
      listed: false,
      copied_from: s.mai.id,
    });
    copy.items = [item(copy.id, { name: "Chocolate cake", price_cents: 1800, tags: ["nut-free"], stock: 3 })];
    return { ...s, stranger, copy, all: [...s.all, stranger, copy] };
  }

  it("never shows other visitors' private shops", () => {
    const { all } = street();
    const r = searchCatalog(all, { query: "cake" }, NOW);
    expect(r.shops.map((s) => s.slug)).toEqual(["ave-bakery", "mais-bakery"]);
    expect(visibleShops(all).map((s) => s.slug)).not.toContain("someones-cakes");
  });

  it("shows my own private shop first, and hides the listed original I copied", () => {
    const { all } = street();
    const r = searchCatalog(all, { query: "cake" }, NOW, { myShops: ["mais-bakery-3fa2c1"] });
    expect(r.shops.map((s) => s.slug)).toEqual(["mais-bakery-3fa2c1", "ave-bakery"]);
    expect(r.shops[0]).toMatchObject({ is_demo: true, name: "Mai's Bakery" });
  });

  it("my_shops can't reveal a closed shop", () => {
    const { all, copy } = street();
    copy.open = false;
    const r = searchCatalog(all, { query: "cake" }, NOW, { myShops: [copy.slug] });
    expect(r.shops.map((s) => s.slug)).toEqual(["ave-bakery", "mais-bakery"]);
  });

  it("the no-match fallback only lists visible shops", () => {
    const { all } = street();
    const r = searchCatalog(all, { query: "bicycle" }, NOW);
    expect(r.other_open_shops.map((s) => s.slug)).toEqual(["ave-bakery", "mais-bakery", "pho-shizzle"]);
  });
});

describe("get_menu", () => {
  it("returns every item with available = !sold_out && stock > 0 && price_cents !== null", () => {
    const { mai } = demoStreet();
    mai.items[1].stock = 0;
    const r = menuResult(mai, NOW);
    expect(r.items.map((i) => [i.name, i.available])).toEqual([
      ["Chocolate cake", true],
      ["Croissant", false], // no stock
      ["Round loaf", false], // needs a price
    ]);
    expect(r.shop).toMatchObject({ slug: "mais-bakery", open: true, notes: "No nuts in anything.", max_per_order: 2 });
  });

  it("never leaks server-only columns", () => {
    const { mai } = demoStreet();
    const json = JSON.stringify(menuResult({ ...mai, owner_token_hash: "secret" } as never, NOW));
    expect(json).not.toContain("secret");
    expect(json).not.toContain("owner_token");
  });
});
