import { serverError } from "@/lib/http";
import { markProgress } from "@/lib/orders/ticket-server";

export const dynamic = "force-dynamic";

// The owner tapped Ready: the shopper's ticket says it's ready (CONTRACTS §18).
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/ready">) {
  const { id } = await ctx.params;
  try {
    return await markProgress(req, id, "ready_at", "owner");
  } catch (err) {
    return serverError(err);
  }
}
