// get_menu: the shop's live menu. Pure (data passed in).
import type { MenuResult } from "@/lib/ai/shopper-types";
import { clip, itemSummary, shopSummary, sortItems, type ShopWithItems } from "./views";

export const MAX_MENU_ITEMS = 30;

export function menuResult(shop: ShopWithItems, now: Date): MenuResult {
  return {
    ok: true,
    shop: { ...shopSummary(shop, now), open: Boolean(shop.open), notes: clip(shop.rules?.notes ?? null) },
    items: sortItems(shop.items ?? [])
      .slice(0, MAX_MENU_ITEMS)
      .map(itemSummary),
  };
}
