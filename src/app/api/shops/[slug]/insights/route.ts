import { requireOwner } from "@/lib/auth/require-owner";
import { serverError } from "@/lib/http";
import { loadInsights } from "@/lib/insights/load";

export const dynamic = "force-dynamic";

// Owner-only: what AI shoppers asked for near this shop today (CONTRACTS §16).
// Counts and asked-for wording only; no shopper details are stored or returned.
export async function GET(req: Request, ctx: RouteContext<"/api/shops/[slug]/insights">) {
  const { slug } = await ctx.params;
  try {
    const owner = await requireOwner(req, { slug });
    if (!owner.ok) return owner.response;
    return Response.json(await loadInsights(owner.shopId, owner.slug), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
