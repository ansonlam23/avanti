import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getDb } from "@/lib/db/server";
import { badRequest, jsonError, notFound, serverError } from "@/lib/http";
import { isAiOrderable, withAiOrderable } from "@/lib/orders/ai-rules";
import { notifyShop } from "@/lib/realtime/server";
import type { ShopRules } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({ ai_orderable: z.boolean() });

// The owner's per-item "AI can order this" switch (CONTRACTS §13). Off = AI shoppers
// are told to order it in person, and the shop's order endpoint refuses it before Visa.
export async function POST(req: Request, ctx: RouteContext<"/api/items/[id]/ai-orderable">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { ai_orderable: boolean }");

  try {
    const db = getDb();
    const { data: item, error } = await db
      .from("items")
      .select("id, shop_id, stock, sold_out")
      .eq("id", id)
      .maybeSingle<{ id: string; shop_id: string; stock: number; sold_out: boolean }>();
    if (error) return jsonError(500, "db_error", error.message);
    if (!item) return notFound("Item not found");

    const owner = await requireOwner(req, { shopId: item.shop_id });
    if (!owner.ok) return owner.response;

    const { data: shop, error: shopErr } = await db
      .from("shops")
      .select("rules")
      .eq("id", item.shop_id)
      .single<{ rules: ShopRules }>();
    if (shopErr) return jsonError(500, "db_error", shopErr.message);

    const rules: ShopRules = {
      ...shop.rules,
      ai_blocked_items: withAiOrderable(shop.rules.ai_blocked_items, item.id, parsed.data.ai_orderable),
    };
    if (!rules.ai_blocked_items?.length) delete rules.ai_blocked_items;
    const { error: upErr } = await db.from("shops").update({ rules }).eq("id", item.shop_id);
    if (upErr) return jsonError(500, "db_error", upErr.message);

    // A stock ping makes the owner's counter and any open shopper cards re-read this item.
    await notifyShop(owner.slug, { kind: "stock", item_id: item.id, stock: item.stock, sold_out: item.sold_out });
    return Response.json({ item_id: item.id, ai_orderable: isAiOrderable(rules, item.id), rules });
  } catch (err) {
    return serverError(err);
  }
}
