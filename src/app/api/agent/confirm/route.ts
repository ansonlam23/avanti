import { z } from "zod";
import { placeSignedOrder } from "@/lib/agent/place-order";
import { getDb } from "@/lib/db/server";
import { badRequest, jsonError, serverError } from "@/lib/http";
import { LIMITS, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Visa calls can take ~15 s; never cut a hold off mid-flight

// Called ONLY by the shopper's "Confirm & hold" tap (the AI has no tool for this).
// The server re-reads the price from the menu, then the avanti shopper agent
// signs the order and sends it to the shop's endpoint over HTTP.
const Body = z.object({
  shop_slug: z.string().min(1).max(60),
  item_id: z.string().uuid(),
  qty: z.number().int().min(1).max(20),
  pickup_time: z.string().datetime({ offset: true }).nullable(),
  customer_name: z.string().trim().max(60).nullable(),
  idempotency_key: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid order confirmation");
  const b = parsed.data;
  const limited = await rateLimit(req, "confirm", ...LIMITS.confirm);
  if (limited) return limited;
  try {
    const { data: item } = await getDb()
      .from("items")
      .select("price_cents, shops!inner(slug)")
      .eq("id", b.item_id)
      .eq("shops.slug", b.shop_slug)
      .maybeSingle<{ price_cents: number | null }>();
    if (!item) return jsonError(404, "not_found", "That item isn't on this shop's menu");
    if (item.price_cents === null) return jsonError(409, "no_price", "That item doesn't have a price yet");

    const { status, body } = await placeSignedOrder({
      origin: new URL(req.url).origin,
      slug: b.shop_slug,
      request: {
        item_id: b.item_id,
        qty: b.qty,
        amount_cents: item.price_cents * b.qty,
        pickup_time: b.pickup_time,
        customer_name: b.customer_name,
        idempotency_key: b.idempotency_key,
      },
    });
    return Response.json(body, { status });
  } catch (err) {
    return serverError(err);
  }
}
