import "server-only";
import { randomInt } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/server";
import { jsonError } from "@/lib/http";
import { notifyShop } from "@/lib/realtime/server";
import { supabaseDirectory, supabaseNonceStore, verifyRequest } from "@/lib/trust";
import { DEMO_TEST_CARD, getPayments } from "@/lib/visa";
import type { Item, Order, PublicOrder, ShopRules } from "@/lib/types";

// The shop's order endpoint (CONTRACTS §9): verify the agent's signature
// BEFORE anything else, then validate against the menu, reserve stock, and
// ask Visa for a hold. Bots never get past step 1, so they never reach Visa.

const OrderBody = z.object({
  item_id: z.string().uuid(),
  qty: z.number().int().min(1).max(20),
  amount_cents: z.number().int().positive(),
  pickup_time: z.string().datetime({ offset: true }).nullable(),
  customer_name: z.string().trim().max(60).nullable(),
  idempotency_key: z.string().min(8).max(100),
});

type ShopRow = { id: string; slug: string; name: string; open: boolean; rules: ShopRules };

export async function handleSignedOrder(req: Request, slug: string): Promise<Response> {
  const db = getDb();
  const raw = await req.text(); // exact bytes the agent signed

  const { data: shop } = await db
    .from("shops")
    .select("id, slug, name, open, rules")
    .eq("slug", slug)
    .maybeSingle<ShopRow>();
  if (!shop) return jsonError(404, "not_found", "Shop not found");

  // 1 · Trust: signed by a known agent, fresh, untampered, never seen before.
  const verdict = await verifyRequest({
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: raw,
    directory: supabaseDirectory(db),
    nonces: supabaseNonceStore(db),
  });
  if (!verdict.ok) {
    await db.from("events").insert({
      shop_id: shop.id,
      type: "bot_blocked",
      reason: verdict.reason,
      detail: { detail: verdict.detail, ua: req.headers.get("user-agent")?.slice(0, 80) ?? null },
    });
    return jsonError(401, "blocked", `Request blocked: ${verdict.detail}`, verdict.reason);
  }

  await db.from("events").insert({
    shop_id: shop.id,
    type: "order_verified",
    detail: { agent_name: verdict.agent.name, key_id: verdict.keyId },
  });
  // Housekeeping: expired nonces can't be replayed anymore; trim them now and then.
  // (postgrest only sends on await, and Vercel stops unawaited work after the response.)
  if (Math.random() < 0.1) {
    after(async () => {
      await db.rpc("purge_expired_nonces");
    });
  }

  // 2 · The order itself, checked against the shop's own menu and rules.
  const parsed = OrderBody.safeParse(safeJson(raw));
  if (!parsed.success) return jsonError(400, "bad_request", "Order body doesn't match the menu contract");
  const body = parsed.data;

  if (!shop.open || !shop.rules?.accept_ai_orders) {
    return jsonError(409, "closed", `${shop.name} isn't taking AI orders right now`);
  }
  if (body.qty > (shop.rules.max_per_order ?? 2)) {
    return jsonError(409, "over_limit", `${shop.name} allows at most ${shop.rules.max_per_order} per order`);
  }

  const { data: item } = await db
    .from("items")
    .select("*")
    .eq("id", body.item_id)
    .eq("shop_id", shop.id)
    .maybeSingle<Item>();
  if (!item) return jsonError(404, "not_found", "That item isn't on this menu");
  if (item.price_cents === null) return jsonError(409, "no_price", `${item.name} doesn't have a price yet`);

  const amount = item.price_cents * body.qty; // the only source of truth for money
  if (body.amount_cents !== amount) {
    return jsonError(409, "price_mismatch", `The menu price is now ${amount} cents; please re-confirm`);
  }

  // Idempotent: the same confirm tap never creates two holds.
  const { data: existing } = await db
    .from("orders")
    .select("id")
    .eq("idempotency_key", body.idempotency_key)
    .maybeSingle<{ id: string }>();
  if (existing) return Response.json({ order: await publicOrder(existing.id) }, { status: 200 });

  // Build the payments adapter BEFORE touching stock: a misconfigured adapter
  // must fail loudly, not silently eat inventory on every attempt.
  let payments: ReturnType<typeof getPayments>;
  try {
    payments = getPayments();
  } catch (err) {
    return jsonError(502, "not_configured", `Payments aren't configured: ${(err as Error).message}`);
  }

  const { data: reserved, error: reserveErr } = await db.rpc("reserve_stock", { p_item: item.id, p_qty: body.qty });
  if (reserveErr) return jsonError(500, "db_error", reserveErr.message);
  if (!reserved) return jsonError(409, "sold_out", `${item.name} just sold out`);

  const { data: order, error: insertErr } = await db
    .from("orders")
    .insert({
      shop_id: shop.id,
      item_id: item.id,
      qty: body.qty,
      amount_cents: amount,
      pickup_time: body.pickup_time,
      customer_name: body.customer_name,
      status: "pending",
      payment_mode: payments.mode,
      agent_id: verdict.agent.id,
      idempotency_key: body.idempotency_key,
      pickup_code: String(randomInt(0, 10000)).padStart(4, "0"),
    })
    .select("*")
    .single<Order>();
  if (insertErr || !order) {
    await db.rpc("return_stock", { p_item: item.id, p_qty: body.qty });
    // A concurrent duplicate tap lost the race on the unique key: return the winner.
    if (insertErr?.code === "23505") {
      const { data: winner } = await db
        .from("orders")
        .select("id")
        .eq("idempotency_key", body.idempotency_key)
        .maybeSingle<{ id: string }>();
      if (winner) return Response.json({ order: await publicOrder(winner.id) }, { status: 200 });
    }
    return jsonError(500, "db_error", insertErr?.message ?? "Couldn't create the order");
  }

  // 3 · Visa: authorization only (a hold). Charged at pickup, released on no-show.
  const hold = await payments.hold({
    orderId: order.id,
    amountCents: amount,
    currency: "USD",
    card: DEMO_TEST_CARD,
    description: `${shop.name}: ${body.qty} × ${item.name}`,
  });

  if (!hold.ok) {
    await db
      .from("orders")
      .update({ status: "failed", failure_reason: `${hold.code}: ${hold.message}`.slice(0, 200) })
      .eq("id", order.id);
    await db.rpc("return_stock", { p_item: item.id, p_qty: body.qty });
    await db.from("events").insert({
      shop_id: shop.id,
      type: "order_failed",
      detail: { order_id: order.id, code: hold.code, message: hold.message.slice(0, 200), mode: hold.mode },
    });
    await notifyShop(shop.slug, { kind: "order", status: "failed" });
    return hold.code === "declined"
      ? jsonError(402, "declined", `Visa declined the hold: ${hold.message}`)
      : jsonError(502, hold.code, `Visa couldn't place the hold: ${hold.message}`);
  }

  const { error: heldErr } = await db
    .from("orders")
    .update({
      status: "held",
      visa_auth_id: hold.id,
      card_last4: hold.cardLast4 ?? DEMO_TEST_CARD.number.slice(-4),
      held_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (heldErr) {
    // The hold exists at Visa but we couldn't record it: release it rather than strand it.
    await payments.release({
      orderId: order.id,
      authId: hold.id,
      amountCents: amount,
      currency: "USD",
      reason: "order_failed",
    });
    await db.rpc("return_stock", { p_item: item.id, p_qty: body.qty });
    return jsonError(500, "db_error", `Couldn't record the hold: ${heldErr.message}`);
  }
  await db.from("events").insert({
    shop_id: shop.id,
    type: "order_held",
    detail: { order_id: order.id, amount_cents: amount, mode: hold.mode, visa_id: hold.id },
  });
  await notifyShop(shop.slug, { kind: "order", status: "held" });
  await notifyShop(shop.slug, {
    kind: "stock",
    item_id: item.id,
    stock: Math.max(0, item.stock - body.qty),
    sold_out: item.sold_out,
  });

  return Response.json({ order: await publicOrder(order.id) }, { status: 201 });
}

export async function publicOrder(id: string): Promise<PublicOrder> {
  const { data, error } = await getDb()
    .from("orders")
    .select(
      "id, status, qty, amount_cents, currency, pickup_time, pickup_code, payment_mode, card_last4, created_at, items(name), shops(name, slug)",
    )
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(`load order ${id}: ${error?.message ?? "missing"}`);
  const { items, shops, ...rest } = data as unknown as Omit<PublicOrder, "item_name" | "shop_name" | "shop_slug"> & {
    items: { name: string } | null;
    shops: { name: string; slug: string } | null;
  };
  return { ...rest, item_name: items?.name ?? "Item", shop_name: shops?.name ?? "Shop", shop_slug: shops?.slug ?? "" };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
