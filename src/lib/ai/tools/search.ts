// search_shops: open shops + matching items, nearest first. Pure (data passed in).
import type { SearchShop, SearchShopsResult } from "@/lib/ai/shopper-types";
import { SHOPPER_LOCATION } from "./geo";
import { queryTerms, scoreItem, shopNameMatches } from "./match";
import { dayTimeLabel, earliestPickup, parseShopTime } from "./time";
import { clip, isAvailable, itemSummary, pickupWindow, shopSummary, sortItems, type ShopWithItems } from "./views";

export const MAX_SHOPS = 5;
export const MAX_MATCHES_PER_SHOP = 4;

export interface SearchArgs {
  query: string;
  needed_by?: string | null;
}

/**
 * Which shops this visitor may see in search (CONTRACTS §11): open, and either
 * listed (our demo shops) or one of the visitor's own. When the visitor runs a
 * private copy of a demo shop, the listed original is hidden so orders go to
 * the copy they're watching.
 */
export function visibleShops(shops: ShopWithItems[], myShops: readonly string[] = []): ShopWithItems[] {
  const mine = new Set(myShops);
  const visible = shops.filter((s) => s.open && (s.listed === true || mine.has(s.slug)));
  const copied = new Set(visible.filter((s) => mine.has(s.slug) && s.copied_from).map((s) => s.copied_from));
  return visible.filter((s) => mine.has(s.slug) || !copied.has(s.id));
}

export function searchCatalog(
  shops: ShopWithItems[],
  args: SearchArgs,
  now: Date,
  opts: { myShops?: readonly string[] } = {},
): SearchShopsResult {
  const query = clip(args.query, 120) ?? "";
  const terms = queryTerms(query);
  const deadline = args.needed_by ? parseShopTime(args.needed_by, now) : null;
  const mine = new Set(opts.myShops ?? []);
  const open = visibleShops(shops, opts.myShops);

  const ranked: Array<{ shop: SearchShop; score: number; mine: boolean }> = [];
  for (const shop of open) {
    const items = sortItems(shop.items ?? []);
    const nameHit = shopNameMatches(shop.name, terms);
    const scored = items
      .map((item) => ({ item, score: scoreItem(item, terms) }))
      .filter((x) => x.score > 0)
      // available first, then best match, then the owner's own order
      .sort((a, b) => Number(isAvailable(b.item)) - Number(isAvailable(a.item)) || b.score - a.score);
    // A shop-name hit ("Mai's") or an empty query shows the shop's menu head.
    const hits = scored.length ? scored : nameHit || terms.keywords.length === 0 ? items.map((item) => ({ item, score: 0 })) : [];
    if (!hits.length) continue;

    const summary = shopSummary(shop, now);
    let readyByNeeded: boolean | null = null;
    if (deadline) {
      const earliest = earliestPickup(pickupWindow(shop), now);
      readyByNeeded = earliest !== null && earliest.getTime() <= deadline.getTime();
    }
    ranked.push({
      mine: mine.has(shop.slug),
      score: (scored[0]?.score ?? 0) + (nameHit ? 3 : 0) + (hits.some((h) => isAvailable(h.item)) ? 1 : 0),
      shop: {
        ...summary,
        ready_by_needed: readyByNeeded,
        matches: hits.slice(0, MAX_MATCHES_PER_SHOP).map((h) => itemSummary(h.item, shop.rules)),
        more_matches: Math.max(0, hits.length - MAX_MATCHES_PER_SHOP),
      },
    });
  }

  ranked.sort(
    (a, b) =>
      Number(b.shop.ready_by_needed !== false) - Number(a.shop.ready_by_needed !== false) ||
      Number(b.mine) - Number(a.mine) ||
      b.score - a.score ||
      (a.shop.walk_minutes ?? 999) - (b.shop.walk_minutes ?? 999),
  );

  const result: SearchShopsResult = {
    ok: true,
    query,
    needed_by: deadline ? dayTimeLabel(deadline, now) : null,
    shopper_location: SHOPPER_LOCATION.label,
    shops: ranked.slice(0, MAX_SHOPS).map((r) => r.shop),
    other_open_shops: [],
  };
  if (!result.shops.length) {
    result.other_open_shops = open
      .map((s) => shopSummary(s, now))
      .sort((a, b) => (a.walk_minutes ?? 999) - (b.walk_minutes ?? 999))
      .slice(0, MAX_SHOPS)
      .map(({ slug, name, is_demo, walk_minutes }) => ({ slug, name, is_demo, walk_minutes }));
    result.note = open.length
      ? `No open shop lists anything matching "${query}".`
      : "No shops are open right now.";
  }
  return result;
}
