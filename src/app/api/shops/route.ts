import { after } from "next/server";
import { createShop, createShopRequestSchema, originFrom, type CreateShopResponse } from "@/lib/db/shops";
import { hasSupabase } from "@/lib/env";
import { LIMITS, rateLimit } from "@/lib/ratelimit";
import { notifyShop } from "@/lib/realtime/server";

// POST /api/shops: "Turn on your sign". Creates the live shop + its items.
// The owner token is returned exactly once; only its hash is stored.

export const dynamic = "force-dynamic";

function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  // Public demo: visitor shops are private sandboxes; cap how many one IP makes.
  const limited = await rateLimit(req, "create-shop", ...LIMITS.createShop);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send the shop as JSON.");
  }

  const parsed = createShopRequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return fail(400, "bad_request", `${where}${first?.message ?? "invalid shop"}`);
  }

  if (!hasSupabase()) return fail(503, "db_not_configured", "The shop database isn't connected yet.");

  try {
    const { shop, ownerToken } = await createShop(parsed.data);
    const origin = originFrom(req);
    after(() => notifyShop(shop.slug, { kind: "shop", open: true }));
    const res: CreateShopResponse = {
      shop,
      owner_token: ownerToken,
      owner_url: `${origin}/shop/${shop.slug}?k=${encodeURIComponent(ownerToken)}`,
      public_url: `${origin}/s/${shop.slug}`,
      agent_url: `${origin}/s/${shop.slug}/agent.json`,
    };
    return Response.json(res, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[shops] create failed:", err instanceof Error ? err.message : err);
    return fail(500, "create_failed", "Couldn't turn on the sign. Try again.");
  }
}
