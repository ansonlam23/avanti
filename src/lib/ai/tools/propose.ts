// propose_order: validate against the live menu + rules and price it from the DB.
// It never places anything: the shopper must tap "Confirm & hold". Pure.
import type { ProposeOrderResult } from "@/lib/ai/shopper-types";
import { checkAiRules } from "@/lib/orders/ai-rules";
import { checkPickup, dayTimeLabel, windowLabel } from "./time";
import { maxPerOrder, pickupWindow, shopSummary, type ShopWithItems } from "./views";

export interface ProposeArgs {
  item_id: string;
  qty: number;
  pickup_time?: string | null;
}

export function proposeOrder(shop: ShopWithItems, args: ProposeArgs, now: Date): ProposeOrderResult {
  const window = pickupWindow(shop);
  const fail = (error: string, message: string): ProposeOrderResult => ({ ok: false, error, message, pickup_window: window });

  if (!shop.open) return fail("closed", `${shop.name} is closed right now.`);
  if (shop.rules?.accept_ai_orders === false) return fail("no_ai_orders", `${shop.name} isn't taking AI orders.`);

  const item = (shop.items ?? []).find((i) => i.id === args.item_id);
  if (!item) return fail("not_on_menu", `That item isn't on ${shop.name}'s menu.`);
  if (item.price_cents === null) return fail("no_price", `${item.name} doesn't have a price yet, so it can't be ordered.`);
  if (item.sold_out || item.stock <= 0) return fail("sold_out", `${item.name} is sold out at ${shop.name}.`);

  const qty = Number(args.qty);
  const limit = maxPerOrder(shop);
  if (!Number.isInteger(qty) || qty < 1) return fail("bad_qty", "Quantity must be a whole number, at least 1.");
  if (qty > limit) return fail("over_limit", `${shop.name} allows at most ${limit} per order.`);
  if (qty > item.stock) return fail("not_enough_stock", `${shop.name} has only ${item.stock} ${item.name} left.`);
  // The owner's AI rules: the same check the shop's order endpoint makes, so the AI can explain and adapt first.
  const refusal = checkAiRules(shop.rules, shop.name, item, item.price_cents * qty);
  if (refusal) return fail(refusal.code, refusal.message);

  const pickup = checkPickup(window, args.pickup_time, now);
  if (!pickup.ok) return fail(pickup.error, `${pickup.message} ${shop.name} picks up ${windowLabel(window)}.`);

  const summary = shopSummary(shop, now);
  return {
    ok: true,
    proposal: {
      shop_slug: shop.slug,
      shop_name: shop.name,
      is_demo: Boolean(shop.is_demo),
      location_label: shop.location_label,
      walk_minutes: summary.walk_minutes,
      item_id: item.id,
      item_name: item.name,
      item_name_en: item.name_en && item.name_en !== item.name ? item.name_en : null,
      qty,
      unit_price_cents: item.price_cents,
      amount_cents: item.price_cents * qty,
      currency: "USD",
      pickup_time: pickup.at.toISOString(),
      pickup_label: dayTimeLabel(pickup.at, now),
      stock_left: item.stock,
      max_per_order: limit,
    },
    note: "Not ordered yet. The shopper sees an order card and must tap Confirm & hold; then a Visa hold is placed (charged only at pickup).",
  };
}
