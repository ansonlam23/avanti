import "server-only";
import { getDb } from "@/lib/db/server";
import type { PublicOrder } from "@/lib/types";
import { ITEM_COLUMNS, SHOP_COLUMNS, type ShopWithItems } from "./views";

// Read-only DB access for the shopper tools (server only, secret key).
// One round trip each: shops embed their items (PostgREST FK embedding).

const SHOP_WITH_ITEMS = `${SHOP_COLUMNS}, items(${ITEM_COLUMNS})`;
const MAX_SHOPS_SCANNED = 60;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Shops AI search may show this visitor (CONTRACTS §11): open AND (listed demo
 * shops OR the visitor's own private shops). Never other visitors' sandboxes.
 */
export async function loadSearchableShops(myShops: string[]): Promise<ShopWithItems[]> {
  const mine = myShops.filter((s) => SLUG_RE.test(s) && s.length <= 60);
  let query = getDb()
    .from("shops")
    .select(`${SHOP_WITH_ITEMS}, listed, copied_from`)
    .eq("open", true);
  // Slugs are validated kebab-case, so they're safe inside the PostgREST filter.
  query = mine.length ? query.or(`listed.eq.true,slug.in.(${mine.join(",")})`) : query.eq("listed", true);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_SHOPS_SCANNED);
  if (error) throw new Error(`load shops: ${error.message}`);
  return (data ?? []) as unknown as ShopWithItems[];
}

export async function loadShop(slug: string): Promise<ShopWithItems | null> {
  if (!SLUG_RE.test(slug) || slug.length > 60) return null;
  const { data, error } = await getDb().from("shops").select(SHOP_WITH_ITEMS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`load shop ${slug}: ${error.message}`);
  return (data as unknown as ShopWithItems | null) ?? null;
}

export async function loadPublicOrder(id: string): Promise<PublicOrder | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await getDb()
    .from("orders")
    .select(
      "id, status, qty, amount_cents, currency, pickup_time, pickup_code, payment_mode, card_last4, created_at, items(name), shops(name, slug)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`load order: ${error.message}`);
  if (!data) return null;
  const { items, shops, ...rest } = data as unknown as Omit<PublicOrder, "item_name" | "shop_name" | "shop_slug"> & {
    items: { name: string } | null;
    shops: { name: string; slug: string } | null;
  };
  return { ...rest, item_name: items?.name ?? "Item", shop_name: shops?.name ?? "Shop", shop_slug: shops?.slug ?? "" };
}
