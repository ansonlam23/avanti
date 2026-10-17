import { serverError } from "@/lib/http";
import { releaseOrder } from "@/lib/orders/lifecycle";

export const dynamic = "force-dynamic";

// No-show → Visa authorization reversal → RELEASED (stock goes back on the menu).
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/release">) {
  const { id } = await ctx.params;
  try {
    return await releaseOrder(req, id);
  } catch (err) {
    return serverError(err);
  }
}
