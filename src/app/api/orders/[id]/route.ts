import { notFound, serverError } from "@/lib/http";
import { loadTicketOrder, UUID } from "@/lib/orders/ticket-server";

export const dynamic = "force-dynamic";

// Shopper-facing order status. The id is an unguessable UUID (capability URL).
// Also carries the pickup ticket's live status and the pickup name (CONTRACTS §18).
export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound("Order not found");
  try {
    const order = await loadTicketOrder(id);
    if (!order) return notFound("Order not found");
    return Response.json({ order }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
