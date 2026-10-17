import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getDb } from "@/lib/db/server";
import { badRequest, jsonError, serverError } from "@/lib/http";
import { AI_LIMIT_MAX_CENTS, AI_LIMIT_MIN_CENTS } from "@/lib/orders/ai-rules";
import { notifyShop } from "@/lib/realtime/server";
import type { ShopRules } from "@/lib/types";

export const dynamic = "force-dynamic";

// The owner changes their shop's rules for AI orders (CONTRACTS §13).
// Every field is optional; only the ones sent change. ai_max_order_cents: null removes the cap.
const Body = z
  .object({
    ai_max_order_cents: z.number().int().min(AI_LIMIT_MIN_CENTS).max(AI_LIMIT_MAX_CENTS).nullable().optional(),
    accept_ai_orders: z.boolean().optional(),
    max_per_order: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export async function POST(req: Request, ctx: RouteContext<"/api/shops/[slug]/rules">) {
  const { slug } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest("Expected { ai_max_order_cents?: cents | null, accept_ai_orders?: boolean, max_per_order?: 1-20 }");
  }

  try {
    const owner = await requireOwner(req, { slug });
    if (!owner.ok) return owner.response;

    const db = getDb();
    const { data: shop, error } = await db
      .from("shops")
      .select("id, open, rules")
      .eq("id", owner.shopId)
      .single<{ id: string; open: boolean; rules: ShopRules }>();
    if (error) return jsonError(500, "db_error", error.message);

    const rules: ShopRules = { ...shop.rules };
    const patch = parsed.data;
    if (patch.accept_ai_orders !== undefined) rules.accept_ai_orders = patch.accept_ai_orders;
    if (patch.max_per_order !== undefined) rules.max_per_order = patch.max_per_order;
    if (patch.ai_max_order_cents !== undefined) {
      if (patch.ai_max_order_cents === null) delete rules.ai_max_order_cents;
      else rules.ai_max_order_cents = patch.ai_max_order_cents;
    }

    const { error: upErr } = await db.from("shops").update({ rules }).eq("id", shop.id);
    if (upErr) return jsonError(500, "db_error", upErr.message);

    await notifyShop(owner.slug, { kind: "shop", open: shop.open });
    return Response.json({ rules });
  } catch (err) {
    return serverError(err);
  }
}
