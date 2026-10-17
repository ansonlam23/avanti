// DB rows → the small JSON the model and the cards see. Pure.
import type { ItemSummary, ShopSummary } from "@/lib/ai/shopper-types";
import type { Item, Shop } from "@/lib/types";
import { walkMinutes } from "./geo";
import { dayTimeLabel, earliestPickup, insideWindow } from "./time";

/** Columns we read (never owner_token_hash). */
export const SHOP_COLUMNS =
  "id, slug, name, tagline, owner_language, photo_url, open, pickup_window, rules, is_demo, location_label, lat, lng";
export const ITEM_COLUMNS = "id, shop_id, name, name_en, description, price_cents, tags, stock, sold_out, sort";

export type ShopRow = Omit<Shop, "created_at">;
export type ItemRow = Pick<
  Item,
  "id" | "shop_id" | "name" | "name_en" | "description" | "price_cents" | "tags" | "stock" | "sold_out" | "sort"
>;
export type ShopWithItems = ShopRow & { items: ItemRow[] };

const DEFAULT_WINDOW = { start: "08:00", end: "18:00" };
const TEXT_LIMIT = 200;

export function clip(s: string | null | undefined, max = TEXT_LIMIT): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function isAvailable(item: Pick<ItemRow, "sold_out" | "stock" | "price_cents">): boolean {
  return !item.sold_out && item.stock > 0 && item.price_cents !== null;
}

export function maxPerOrder(shop: Pick<ShopRow, "rules">): number {
  const n = Number(shop.rules?.max_per_order);
  return Number.isInteger(n) && n > 0 ? n : 2;
}

export function pickupWindow(shop: Pick<ShopRow, "pickup_window">) {
  const w = shop.pickup_window;
  return w && typeof w.start === "string" && typeof w.end === "string" ? { start: w.start, end: w.end } : DEFAULT_WINDOW;
}

export function itemSummary(item: ItemRow): ItemSummary {
  return {
    id: item.id,
    name: item.name,
    name_en: item.name_en && item.name_en !== item.name ? item.name_en : null,
    description: clip(item.description),
    price_cents: item.price_cents,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 12) : [],
    stock: Math.max(0, item.stock ?? 0),
    sold_out: Boolean(item.sold_out),
    available: isAvailable(item),
  };
}

export function shopSummary(shop: ShopRow, now: Date): ShopSummary {
  const window = pickupWindow(shop);
  const earliest = earliestPickup(window, now);
  return {
    slug: shop.slug,
    name: shop.name,
    tagline: clip(shop.tagline, 120),
    is_demo: Boolean(shop.is_demo),
    photo_url: shop.photo_url,
    location_label: shop.location_label,
    walk_minutes: walkMinutes(shop.lat, shop.lng),
    pickup_window: window,
    pickup_open_now: insideWindow(window, now),
    earliest_pickup: earliest ? dayTimeLabel(earliest, now) : null,
    accepts_ai_orders: shop.rules?.accept_ai_orders !== false,
    max_per_order: maxPerOrder(shop),
  };
}

export function sortItems(items: ItemRow[]): ItemRow[] {
  return [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}
