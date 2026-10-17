import { getDb } from "@/lib/db/server";
import { jsonError, notFound, serverError } from "@/lib/http";
import type { PublicOrder } from "@/lib/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shopper-facing order status. The id is an unguessable UUID (capability URL).
export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound("Order not found");
  try {
    const { data, error } = await getDb()
      .from("orders")
      .select(
        "id, status, qty, amount_cents, currency, pickup_time, pickup_code, payment_mode, card_last4, created_at, items(name), shops(name, slug)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonError(500, "db_error", error.message);
    if (!data) return notFound("Order not found");
    const { items, shops, ...rest } = data as unknown as Omit<PublicOrder, "item_name" | "shop_name" | "shop_slug"> & {
      items: { name: string } | null;
      shops: { name: string; slug: string } | null;
    };
    const order: PublicOrder = {
      ...rest,
      item_name: items?.name ?? "Item",
      shop_name: shops?.name ?? "Shop",
      shop_slug: shops?.slug ?? "",
    };
    return Response.json({ order }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
