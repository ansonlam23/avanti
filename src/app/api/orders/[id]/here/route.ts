import { serverError } from "@/lib/http";
import { markProgress } from "@/lib/orders/ticket-server";
import { LIMITS, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// The shopper (or whoever holds the ticket link) tapped "I'm here": the counter
// shows "At the door" and says so out loud (CONTRACTS §18). The order id is the capability.
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/here">) {
  const limited = await rateLimit(req, "order-here", ...LIMITS.confirm);
  if (limited) return limited;
  const { id } = await ctx.params;
  try {
    return await markProgress(req, id, "here_at", "shopper");
  } catch (err) {
    return serverError(err);
  }
}
