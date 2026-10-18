import "server-only";
import { getDb } from "@/lib/db/server";
import type { OrderStatus } from "@/lib/types";
import { laDayStart, summarizeInsights } from "./summary";
import type { AiQueryRow, ShopInsights } from "./types";

/** Orders that count as "ordered": they reached a Visa hold (failed and in-flight ones don't). */
export const ORDERED_STATUSES: OrderStatus[] = ["held", "paid", "released"];
/** PostgREST returns at most 1000 rows per select; past that, shown/matched come from exact counts. */
const MAX_ROWS = 1000;

/** One shop's insights for today (Los Angeles): its AI searches and today's orders. Read-only. */
export async function loadInsights(shopId: string, slug: string, now = new Date()): Promise<ShopInsights> {
  const db = getDb();
  const since = laDayStart(now).toISOString();
  const [searches, orders] = await Promise.all([
    db
      .from("ai_queries")
      .select("query, shop_slugs, matched_slugs, created_at", { count: "exact" })
      .contains("shop_slugs", [slug])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS),
    db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .gte("created_at", since)
      .in("status", ORDERED_STATUSES),
  ]);
  if (searches.error) throw new Error(`load AI searches: ${searches.error.message}`);
  if (orders.error) throw new Error(`count today's orders: ${orders.error.message}`);

  const rows = (searches.data ?? []) as AiQueryRow[];
  const insights = summarizeInsights(rows, slug, { now, ordered: orders.count ?? 0 });
  // A very busy day: the rows are the newest MAX_ROWS, so count the totals exactly.
  if ((searches.count ?? 0) > rows.length) {
    const matched = await db
      .from("ai_queries")
      .select("id", { count: "exact", head: true })
      .contains("matched_slugs", [slug])
      .gte("created_at", since);
    if (matched.error) throw new Error(`count matched AI searches: ${matched.error.message}`);
    return { ...insights, shown: searches.count ?? insights.shown, matched: matched.count ?? insights.matched };
  }
  return insights;
}
