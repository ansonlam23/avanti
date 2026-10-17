import { loadShop } from "@/lib/ai/tools/catalog";
import { menuResult } from "@/lib/ai/tools/menu";
import { hasSupabase } from "@/lib/env";
import { jsonError, notFound, serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/agent/menu/<slug>: the same live menu the get_menu tool returns.
// The /ask screen calls it when a stock ping arrives, to confirm an item in an
// open order card is really gone before telling the AI.
export async function GET(_req: Request, ctx: RouteContext<"/api/agent/menu/[slug]">) {
  const { slug } = await ctx.params;
  if (!hasSupabase()) return jsonError(503, "db_not_configured", "The shop directory isn't connected yet.");
  try {
    const shop = await loadShop(slug);
    if (!shop) return notFound("Shop not found");
    return Response.json(menuResult(shop, new Date()), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
