import { requireOwner } from "@/lib/auth/require-owner";
import { serverError } from "@/lib/http";
import { loadDashboard } from "@/lib/orders/dashboard";

export const dynamic = "force-dynamic";

// Owner-only snapshot of the counter: shop, menu, orders, door log, stats.
export async function GET(req: Request, ctx: RouteContext<"/api/shops/[slug]/dashboard">) {
  const { slug } = await ctx.params;
  try {
    const owner = await requireOwner(req, { slug });
    if (!owner.ok) return owner.response;
    return Response.json(await loadDashboard(owner.shopId), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
