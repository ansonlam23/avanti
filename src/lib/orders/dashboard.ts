import "server-only";
import { getDb, must } from "@/lib/db/server";
import { loyaltyOf } from "@/lib/loyalty/rules";
import { keyedOrders } from "@/lib/loyalty/server";
import { rewardDue, visitsByOrder } from "@/lib/loyalty/stamps";
import type { BlockReason, Item, Order, Shop, ShopEvent } from "@/lib/types";

export type DashboardOrder = Order & {
  item_name: string;
  /**
   * Stamp cards (CONTRACTS §17), only while the shop runs one: which pickup this is
   * for the shopper's device (null: no device key, or not a pickup). Absent = no program.
   */
  visit?: number | null;
  /** This pickup earns the reward: the ticket says "Give: <reward>" before Picked up. */
  reward_due?: boolean;
  /** The reward to hand over when it's due (null otherwise). */
  reward?: string | null;
};

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
  const rows = must(ordersRes, "load orders") as (Order & { items: { name: string } | null; shopper_key?: string | null })[];
  const loyalty = loyaltyOf(shop.rules);
  const visits = loyalty ? await loadVisits(shopId, rows.map((o) => o.shopper_key ?? "")) : null;
  const orders: DashboardOrder[] = rows.map(({ items: item, ...o }) => {
    delete o.shopper_key; // the device key itself never reaches the owner's screen, only which pickup this is
    const order: DashboardOrder = { ...o, item_name: item?.name ?? "Item" };
    if (!loyalty) return order;
    const visit = visits?.get(o.id) ?? null;
    const due = rewardDue(visit, loyalty.every);
    return { ...order, visit, reward_due: due, reward: due ? loyalty.reward : null };
  });
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

/** Pickup numbers for the device keys on screen (all of their pickups here, not just the last 50 orders). */
async function loadVisits(shopId: string, keys: string[]): Promise<Map<string, number> | null> {
  try {
    const rows = await keyedOrders(getDb(), shopId, keys);
    return rows ? visitsByOrder(rows) : null;
  } catch (err) {
    console.error("[dashboard] stamps", err); // the counter still loads without its stamp lines
    return null;
  }
}
