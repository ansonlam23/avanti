import { getDb } from "@/lib/db/server";
import { badRequest, notFound, serverError } from "@/lib/http";
import { loyaltyForOrder } from "@/lib/loyalty/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The shopper's stamp card at one shop (CONTRACTS §17), read through the order it
// came with: the order id is already the shopper's capability (GET /api/orders/[id]),
// so the device key never travels in a URL or a log line.
// → { loyalty: { shop_name, shop_slug, every, reward, stamps, visit, earned } | null }
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("order") ?? "";
  if (!UUID.test(id)) return badRequest("Expected ?order=<order id>");
  try {
    const found = await loyaltyForOrder(getDb(), id);
    if (!found.found) return notFound("Order not found");
    return Response.json({ loyalty: found.card }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
