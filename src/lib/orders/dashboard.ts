import "server-only";
import { getDb, must } from "@/lib/db/server";
import type { BlockReason, Item, Order, Shop, ShopEvent } from "@/lib/types";

export type DashboardOrder = Order & { item_name: string };

export interface DashboardStats {
  verified: number;
  blocked: number;
  blocked_by_reason: Partial<Record<BlockReason, number>>;
  held_cents: number;
  paid_cents: number;
  /** Orders that reached the payment step without a verified agent (0 by design; measured, not assumed). */
  unverified_orders: number;
  /** Verified AI orders the owner's own rules turned down (over the AI cap, or an item kept off-limits to AI). Absent = 0. */
  refused_by_rules?: number;
}

export interface Dashboard {
  shop: Shop;
  items: Item[];
  orders: DashboardOrder[];
  events: ShopEvent[];
  stats: DashboardStats;
}

const SHOP_COLUMNS =
  "id, slug, name, tagline, owner_language, photo_url, open, pickup_window, rules, is_demo, location_label, lat, lng, created_at";

export async function loadDashboard(shopId: string): Promise<Dashboard> {
  const db = getDb();
  const [shopRes, itemsRes, ordersRes, eventsRes, statsRes, unverifiedRes, refusedRes] = await Promise.all([
    db.from("shops").select(SHOP_COLUMNS).eq("id", shopId).single(),
    db.from("items").select("*").eq("shop_id", shopId).order("sort").order("created_at"),
    db
      .from("orders")
      .select("*, items(name)")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("events").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(60),
    db.rpc("door_stats", { p_shop: shopId }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("agent_id", null),
    db
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("type", "order_failed")
      .in("reason", ["over_ai_limit", "not_for_ai"]),
  ]);

  const shop = must(shopRes, "load shop") as Shop;
  const items = must(itemsRes, "load items") as Item[];
  const orders = (must(ordersRes, "load orders") as (Order & { items: { name: string } | null })[]).map(
    ({ items: item, ...o }) => ({ ...o, item_name: item?.name ?? "Item" }),
  );
  const events = must(eventsRes, "load events") as ShopEvent[];
  const counted = must(statsRes, "load stats") as { type: string; reason: string | null; n: number }[];

  const stats: DashboardStats = {
    verified: 0,
    blocked: 0,
    blocked_by_reason: {},
    held_cents: 0,
    paid_cents: 0,
    unverified_orders: unverifiedRes.count ?? 0,
    refused_by_rules: refusedRes.count ?? 0,
  };
  for (const e of counted) {
    const n = Number(e.n);
    if (e.type === "order_verified") stats.verified += n;
    if (e.type === "bot_blocked") {
      stats.blocked += n;
      const r = (e.reason ?? "malformed") as BlockReason;
      stats.blocked_by_reason[r] = (stats.blocked_by_reason[r] ?? 0) + n;
    }
  }
  for (const o of orders) {
    if (o.status === "held") stats.held_cents += o.amount_cents;
    if (o.status === "paid") stats.paid_cents += o.amount_cents;
  }
  return { shop, items, orders, events, stats };
}
