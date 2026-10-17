import "server-only";
import { timingSafeEqual } from "node:crypto";
import { requireOwner } from "@/lib/auth/require-owner";
import { getDb } from "@/lib/db/server";
import { jsonError } from "@/lib/http";
import { notifyShop } from "@/lib/realtime/server";
import { getPayments } from "@/lib/visa";
import type { Order } from "@/lib/types";

// Owner actions on a held order: picked up → capture (PAID), no-show → reversal (RELEASED).
// The DB is the source of truth for the lifecycle; the payments adapter is stateless.

async function loadHeldOrder(req: Request, id: string) {
  const { data: order } = await getDb().from("orders").select("*").eq("id", id).maybeSingle<Order>();
  if (!order) return { error: jsonError(404, "not_found", "Order not found") } as const;
  const owner = await requireOwner(req, { shopId: order.shop_id });
  if (!owner.ok) return { error: owner.response } as const;
  if (order.status !== "held") {
    return { error: jsonError(409, "not_held", `This order is already ${order.status}`) } as const;
  }
  if (!order.visa_auth_id) return { error: jsonError(409, "no_hold", "This order has no hold to act on") } as const;
  return { order, slug: owner.slug } as const;
}

function paymentError(code: string, message: string): Response {
  return jsonError(code === "already_finalized" ? 409 : 502, code, message);
}

function codesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function pickupOrder(req: Request, id: string, code: string): Promise<Response> {
  const loaded = await loadHeldOrder(req, id);
  if ("error" in loaded) return loaded.error!;
  const { order, slug } = loaded;
  if (!codesMatch(code.trim(), order.pickup_code)) {
    return jsonError(409, "wrong_code", "That code doesn't match this order");
  }

  // Same adapter that placed the hold (a sandbox hold is never settled by the simulator).
  const capture = await getPayments(order.payment_mode).charge({
    orderId: order.id,
    authId: order.visa_auth_id!,
    amountCents: order.amount_cents,
    heldAmountCents: order.amount_cents,
    currency: "USD",
  });
  if (!capture.ok) return paymentError(capture.code, `Visa didn't capture the hold: ${capture.message}`);

  const db = getDb();
  const { data: updated } = await db
    .from("orders")
    .update({ status: "paid", visa_capture_id: capture.id, paid_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "held")
    .select("*")
    .maybeSingle<Order>();
  // Another screen settled it first (e.g. the /demo iframe and a phone): don't double-log.
  if (!updated) return jsonError(409, "not_held", "This order was already settled");
  await db.from("events").insert({
    shop_id: order.shop_id,
    type: "paid",
    detail: { order_id: order.id, amount_cents: order.amount_cents, mode: capture.mode, visa_id: capture.id },
  });
  await notifyShop(slug, { kind: "order", status: "paid" });
  return Response.json({ order: updated });
}

export async function releaseOrder(req: Request, id: string): Promise<Response> {
  const loaded = await loadHeldOrder(req, id);
  if ("error" in loaded) return loaded.error!;
  const { order, slug } = loaded;

  const reversal = await getPayments(order.payment_mode).release({
    orderId: order.id,
    authId: order.visa_auth_id!,
    amountCents: order.amount_cents, // reversals are always for the full authorized amount
    currency: "USD",
    reason: "no_show",
  });
  if (!reversal.ok) return paymentError(reversal.code, `Visa didn't release the hold: ${reversal.message}`);

  const db = getDb();
  const { data: updated } = await db
    .from("orders")
    .update({ status: "released", visa_reversal_id: reversal.id, released_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "held")
    .select("*")
    .maybeSingle<Order>();
  if (!updated) return jsonError(409, "not_held", "This order was already settled");
  await db.rpc("return_stock", { p_item: order.item_id, p_qty: order.qty });
  await db.from("events").insert({
    shop_id: order.shop_id,
    type: "released",
    detail: { order_id: order.id, amount_cents: order.amount_cents, mode: reversal.mode, visa_id: reversal.id },
  });
  await notifyShop(slug, { kind: "order", status: "released" });
  return Response.json({ order: updated });
}
