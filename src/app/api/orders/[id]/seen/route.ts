import { serverError } from "@/lib/http";
import { markProgress } from "@/lib/orders/ticket-server";

export const dynamic = "force-dynamic";

// The counter showed this held order to the owner: the shopper's ticket says "{shop} saw it" (CONTRACTS §18).
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/seen">) {
  const { id } = await ctx.params;
  try {
    return await markProgress(req, id, "seen_at", "owner");
  } catch (err) {
    return serverError(err);
  }
}
