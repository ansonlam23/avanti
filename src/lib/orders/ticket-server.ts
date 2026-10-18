import "server-only";
import { requireOwner } from "@/lib/auth/require-owner";
import { getDb } from "@/lib/db/server";
import { jsonError } from "@/lib/http";
import { notifyShop } from "@/lib/realtime/server";
import type { OrderStatus } from "@/lib/types";
import { missingProgressColumn, type TicketOrder } from "./progress";

// The pickup ticket (CONTRACTS §18): the shopper's order with its live status,
// and the three small actions that move it. The order id is the shopper's
// capability (an unguessable uuid, as in GET /api/orders/[id]); the owner's
// two actions also need the shop's owner token.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE =
  "id, status, qty, amount_cents, currency, pickup_time, pickup_code, payment_mode, card_last4, created_at, customer_name, items(name), shops(name, slug, location_label)";
const PROGRESS = "seen_at, ready_at, here_at";

type Row = Omit<TicketOrder, "item_name" | "shop_name" | "shop_slug" | "shop_location"> & {
  items: { name: string } | null;
  shops: { name: string; slug: string; location_label: string | null } | null;
};

/** The shopper's order for their ticket; null if there's no such order. Works before migration 0007 too. */
export async function loadTicketOrder(id: string): Promise<TicketOrder | null> {
  const db = getDb();
  let res = await db.from("orders").select(`${BASE}, ${PROGRESS}`).eq("id", id).maybeSingle();
  if (res.error && missingProgressColumn(res.error)) {
    res = await db.from("orders").select(BASE).eq("id", id).maybeSingle();
  }
  if (res.error) throw new Error(`load order: ${res.error.message}`);
  if (!res.data) return null;
  const { items, shops, ...rest } = res.data as unknown as Row;
  return {
    ...rest,
    item_name: items?.name ?? "Item",
    shop_name: shops?.name ?? "Shop",
    shop_slug: shops?.slug ?? "",
    shop_location: shops?.location_label ?? null,
  };
}

export type ProgressField = "seen_at" | "ready_at" | "here_at";

/**
 * Stamp one progress field on a held order, once: the counter saw it (owner),
 * the owner marked it ready (owner), or the shopper said "I'm here" (order id).
 * Idempotent: a second tap returns the first time. Every change pings the
 * shop's channel ("go refetch"), so the ticket and the counter update live.
 */
export async function markProgress(req: Request, id: string, field: ProgressField, by: "owner" | "shopper"): Promise<Response> {
  if (!UUID.test(id)) return jsonError(404, "not_found", "Order not found");
  const db = getDb();
  const { data, error } = await db
    .from("orders")
    .select(`id, shop_id, status, ${field}, shops(slug)`)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (missingProgressColumn(error)) {
      return jsonError(503, "not_ready", "Live pickup updates aren't switched on yet.");
    }
    return jsonError(500, "db_error", error.message);
  }
  if (!data) return jsonError(404, "not_found", "Order not found");
  const order = data as unknown as { id: string; shop_id: string; status: OrderStatus; shops: { slug: string } | null } & Record<
    ProgressField,
    string | null
  >;

  let slug = order.shops?.slug ?? "";
  if (by === "owner") {
    const owner = await requireOwner(req, { shopId: order.shop_id });
    if (!owner.ok) return owner.response;
    slug = owner.slug;
  }

  if (order[field]) return Response.json({ id: order.id, [field]: order[field] });
  if (order.status !== "held") return jsonError(409, "not_held", `This order is already ${order.status}`);

  const at = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from("orders")
    .update({ [field]: at })
    .eq("id", order.id)
    .eq("status", "held")
    .is(field, null)
    .select(`id, ${field}`)
    .maybeSingle();
  if (updateError) return jsonError(500, "db_error", updateError.message);
  // Lost a race with another tap (or the order was just settled): report what's there now.
  if (!updated) return Response.json({ id: order.id, [field]: order[field] ?? at });
  if (slug) await notifyShop(slug, { kind: "order", status: "held" });
  return Response.json(updated);
}
