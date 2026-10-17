// Test fixtures for the shopper tools (imported only by *.test.ts).
import type { ItemRow, ShopWithItems } from "./views";

export const NOW = new Date("2026-10-16T22:12:00Z");

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

export function item(shopId: string, over: Partial<ItemRow> & { name: string }): ItemRow {
  return {
    id: uuid(),
    shop_id: shopId,
    name_en: null,
    description: null,
    price_cents: 500,
    tags: [],
    stock: 5,
    sold_out: false,
    sort: 0,
    ...over,
  };
}

export function shop(over: Partial<ShopWithItems> & { slug: string; name: string }): ShopWithItems {
  const id = over.id ?? uuid();
  return {
    id,
    tagline: null,
    owner_language: "en",
    photo_url: null,
    open: true,
    pickup_window: { start: "08:00", end: "18:00" },
    rules: { max_per_order: 2, accept_ai_orders: true },
    is_demo: false,
    listed: true, // our seeded demo shops are listed (CONTRACTS §11)
    copied_from: null,
    location_label: "University Way NE, Seattle",
    lat: 47.6553 + 0.0072, // ~800 m north of the shopper → 10 min walk
    lng: -122.3035,
    items: [],
    ...over,
  };
}

export function demoStreet() {
  const mai = shop({ slug: "mais-bakery", name: "Mai's Bakery", rules: { max_per_order: 2, accept_ai_orders: true, notes: "No nuts in anything." } });
  mai.items = [
    item(mai.id, { name: "Chocolate cake", price_cents: 1800, tags: ["nut-free", "contains-dairy"], stock: 3, sort: 1, description: "Rich chocolate sponge. Made with butter and eggs." }),
    item(mai.id, { name: "Croissant", price_cents: 450, tags: ["contains-dairy"], stock: 12, sort: 2 }),
    item(mai.id, { name: "Round loaf", price_cents: null, tags: [], stock: 4, sort: 3 }),
  ];
  const ave = shop({ slug: "ave-bakery", name: "Ave Bakery", is_demo: true, lat: 47.6553 + 0.0027, lng: -122.3035 }); // ~300 m → 4 min
  ave.items = [
    item(ave.id, { name: "Chocolate birthday cake", price_cents: 2200, tags: ["contains-nuts"], stock: 1, sort: 1 }),
    item(ave.id, { name: "Walnut brownie", price_cents: 400, tags: ["contains-nuts"], stock: 6, sort: 2 }),
  ];
  const pho = shop({ slug: "pho-shizzle", name: "Pho Corner", lat: null, lng: null, pickup_window: { start: "11:00", end: "21:00" } });
  pho.items = [item(pho.id, { name: "Phở bò", name_en: "Beef pho", price_cents: 1450, stock: 20, sort: 1 })];
  const closed = shop({ slug: "night-cakes", name: "Night Cakes", open: false });
  closed.items = [item(closed.id, { name: "Cheesecake", price_cents: 900 })];
  return { mai, ave, pho, closed, all: [mai, ave, pho, closed] };
}
