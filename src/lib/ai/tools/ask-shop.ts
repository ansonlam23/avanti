// ask_shop: ONLY the shop's own words that bear on the question. Pure.
// The model must answer from this, or say "<Shop> didn't say. Want me to ask?"
import type { AskShopResult } from "@/lib/ai/shopper-types";
import { itemSaysAbout, notesSayAbout, queryTerms, scoreItem, topicsIn } from "./match";
import { clip, isAvailable, maxPerOrder, pickupWindow, sortItems, type ShopWithItems } from "./views";

export const MAX_ASK_ITEMS = 12;

export function askShopResult(shop: ShopWithItems, question: string): AskShopResult {
  const q = clip(question, 300) ?? "";
  const items = sortItems(shop.items ?? []);
  const terms = queryTerms(q);
  const mentioned = items.filter((item) => terms.keywords.length > 0 && scoreItem(item, { ...terms, diet: [] }) > 0);
  // Items the question names; otherwise the whole menu (e.g. "is anything nut-free?").
  const relevant = (mentioned.length ? mentioned : items).slice(0, MAX_ASK_ITEMS);
  const notes = shop.rules?.notes ?? null;

  return {
    ok: true,
    shop: { slug: shop.slug, name: shop.name, is_demo: Boolean(shop.is_demo) },
    question: q,
    topics: topicsIn(q).map((topic) => ({
      topic,
      shop_says: notesSayAbout(notes, topic),
      items: relevant.map((item) => ({ id: item.id, name: item.name, says: itemSaysAbout(item, topic) })),
    })),
    items: relevant.map((item) => ({
      id: item.id,
      name: item.name,
      name_en: item.name_en && item.name_en !== item.name ? item.name_en : null,
      description: clip(item.description),
      tags: Array.isArray(item.tags) ? item.tags : [],
      price_cents: item.price_cents,
      available: isAvailable(item),
    })),
    rules: {
      max_per_order: maxPerOrder(shop),
      accept_ai_orders: shop.rules?.accept_ai_orders !== false,
      notes: clip(notes),
    },
    pickup_window: pickupWindow(shop),
    location_label: shop.location_label,
    tagline: clip(shop.tagline, 120),
    answer_rule:
      `Answer only from this data, in ${shop.name}'s own words (tags, descriptions, notes). ` +
      `If it doesn't answer the question, reply: "${shop.name} didn't say. Want me to ask?" ` +
      `Never guess or infer allergens or ingredients.`,
  };
}
