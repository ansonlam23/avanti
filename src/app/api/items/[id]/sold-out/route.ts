import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getDb } from "@/lib/db/server";
import { badRequest, jsonError, notFound, serverError } from "@/lib/http";
import { notifyShop } from "@/lib/realtime/server";
import type { Item } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({ sold_out: z.boolean() });

// Owner taps "Sold out" (or "Back in stock"). Orders already held keep their stock.
export async function POST(req: Request, ctx: RouteContext<"/api/items/[id]/sold-out">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { sold_out: boolean }");

  try {
    const db = getDb();
    const { data: item, error } = await db.from("items").select("id, shop_id, stock").eq("id", id).maybeSingle();
    if (error) return jsonError(500, "db_error", error.message);
    if (!item) return notFound("Item not found");

    const owner = await requireOwner(req, { shopId: item.shop_id });
    if (!owner.ok) return owner.response;

    // "Back in stock" with nothing left means the owner restocked: give it a fresh batch.
    const restock = !parsed.data.sold_out && item.stock <= 0 ? { stock: 5 } : {};
    const { data: updated, error: upErr } = await db
      .from("items")
      .update({ sold_out: parsed.data.sold_out, ...restock })
      .eq("id", id)
      .select("*")
      .single();
    if (upErr) return jsonError(500, "db_error", upErr.message);

    const { count: heldOrders } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("item_id", id)
      .eq("status", "held");

    await db.from("events").insert({
      shop_id: item.shop_id,
      type: parsed.data.sold_out ? "sold_out" : "restocked",
      detail: { item_id: id, item_name: (updated as Item).name, held_orders: heldOrders ?? 0 },
    });
    await notifyShop(owner.slug, {
      kind: "stock",
      item_id: id,
      stock: (updated as Item).stock,
      sold_out: (updated as Item).sold_out,
    });
    return Response.json({ item: updated as Item, held_orders: heldOrders ?? 0 });
  } catch (err) {
    return serverError(err);
  }
}
