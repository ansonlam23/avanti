import { getShopBySlug, listItems, originFrom, toAgentMenu } from "@/lib/db/shops";
import { hasSupabase } from "@/lib/env";

// GET /s/[slug]/agent.json: the machine-readable menu AI shoppers read
// (AgentMenu, CONTRACTS §5). Always live: cache-control no-store.

export const dynamic = "force-dynamic";

const HEADERS = {
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

export async function GET(req: Request, ctx: RouteContext<"/s/[slug]/agent.json">) {
  const { slug } = await ctx.params;
  if (!hasSupabase()) {
    return Response.json(
      { error: { code: "db_not_configured", message: "The shop database isn't connected yet." } },
      { status: 503, headers: HEADERS },
    );
  }
  const shop = await getShopBySlug(slug);
  if (!shop) {
    return Response.json(
      { error: { code: "not_found", message: `No shop called "${slug}".` } },
      { status: 404, headers: HEADERS },
    );
  }
  const items = await listItems(shop.id);
  return Response.json(toAgentMenu(shop, items, originFrom(req)), { headers: HEADERS });
}
