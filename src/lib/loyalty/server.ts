import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/types";
import { loyaltyOf } from "./rules";
import { isShopperKey } from "./shopper-key";
import { rewardDue, visitsByOrder, type KeyedOrder, type LoyaltyCard } from "./stamps";

// Loyalty reads (CONTRACTS §17). Stamps are counted from orders, never stored:
// a stamp = a paid order at the shop carrying the shopper's device key.

/**
 * Postgres "undefined column" (42703) or PostgREST "not in the schema cache"
 * (PGRST204): migration 0006 (orders.shopper_key) isn't applied on this DB.
 * Loyalty then switches itself off; ordering never depends on it.
 */
export function missingShopperKeyColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(err && (err.code === "42703" || err.code === "PGRST204") && /shopper_key/.test(err.message ?? ""));
}

/** One shop's pickups (paid + held) for these device keys. null when the column isn't there yet. */
export async function keyedOrders(db: SupabaseClient, shopId: string, keys: string[]): Promise<KeyedOrder[] | null> {
  const list = [...new Set(keys.filter(isShopperKey))];
  if (list.length === 0) return [];
  const { data, error } = await db
    .from("orders")
    .select("id, shopper_key, status, created_at, paid_at")
    .eq("shop_id", shopId)
    .in("shopper_key", list)
    .in("status", ["paid", "held"]);
  if (error) {
    if (missingShopperKeyColumn(error)) return null;
    throw new Error(`load stamps: ${error.message}`);
  }
  return (data ?? []) as KeyedOrder[];
}

export type LoyaltyLookup = { found: false } | { found: true; card: LoyaltyCard | null };

type OrderWithShop = {
  id: string;
  shop_id: string;
  status: OrderStatus;
  shopper_key: string | null;
  shops: { name: string; slug: string; rules: unknown } | null;
};

/** The stamp card behind one order (the order id is the shopper's capability, as in GET /api/orders/[id]). */
export async function loyaltyForOrder(db: SupabaseClient, orderId: string): Promise<LoyaltyLookup> {
  const { data, error } = await db
    .from("orders")
    .select("id, shop_id, status, shopper_key, shops(name, slug, rules)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    if (!missingShopperKeyColumn(error)) throw new Error(`load order: ${error.message}`);
    // Before migration 0006 no order carries a device key, so there's no card to show.
    const { data: exists } = await db.from("orders").select("id").eq("id", orderId).maybeSingle();
    return exists ? { found: true, card: null } : { found: false };
  }
  if (!data) return { found: false };
  const order = data as unknown as OrderWithShop;
  const rule = loyaltyOf(order.shops?.rules as { loyalty?: unknown } | undefined);
  if (!rule || !order.shops || !isShopperKey(order.shopper_key)) return { found: true, card: null };

  const rows = await keyedOrders(db, order.shop_id, [order.shopper_key]);
  if (!rows) return { found: true, card: null };
  const visit = visitsByOrder(rows).get(order.id) ?? null;
  return {
    found: true,
    card: {
      shop_name: order.shops.name,
      shop_slug: order.shops.slug,
      every: rule.every,
      reward: rule.reward,
      stamps: rows.filter((r) => r.status === "paid").length,
      visit,
      earned: rewardDue(visit, rule.every),
    },
  };
}
