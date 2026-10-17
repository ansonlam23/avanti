import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { newOwnerToken } from "@/lib/auth/owner";
import { getDb } from "@/lib/db/server";
import type { Item, Shop } from "@/lib/types";

// "Run your own copy": a visitor gets a private copy of a listed demo shop
// (same menu, fresh stock, their own owner link) so they can play the owner
// without stepping on anyone else's demo.

const SHOP_COLUMNS =
  "id, slug, name, tagline, owner_language, photo_url, open, pickup_window, rules, is_demo, listed, copied_from, location_label, lat, lng, created_at";

export async function listListedShops(): Promise<Shop[]> {
  const { data, error } = await getDb()
    .from("shops")
    .select(SHOP_COLUMNS)
    .eq("listed", true)
    .eq("open", true)
    .order("created_at");
  if (error) throw new Error(`list demo shops: ${error.message}`);
  return (data ?? []) as Shop[];
}

export async function copyDemoShop(sourceSlug: string) {
  const db = getDb();
  const { data: source, error } = await db
    .from("shops")
    .select(SHOP_COLUMNS)
    .eq("slug", sourceSlug)
    .eq("listed", true)
    .maybeSingle<Shop>();
  if (error) throw new Error(`load demo shop: ${error.message}`);
  if (!source) return null;

  const { data: items } = await db.from("items").select("*").eq("shop_id", source.id).order("sort");
  const { token, hash } = newOwnerToken();
  const slug = `${source.slug}-${randomBytes(3).toString("hex")}`;

  const { data: shop, error: shopErr } = await db
    .from("shops")
    .insert({
      slug,
      name: source.name,
      tagline: `Your private copy of ${source.name}`,
      owner_language: source.owner_language,
      photo_url: source.photo_url,
      open: true,
      pickup_window: source.pickup_window,
      rules: source.rules,
      is_demo: true,
      listed: false,
      copied_from: source.id,
      location_label: source.location_label,
      lat: source.lat,
      lng: source.lng,
      owner_token_hash: hash,
    })
    .select(SHOP_COLUMNS)
    .single<Shop>();
  if (shopErr || !shop) throw new Error(`copy shop: ${shopErr?.message ?? "no row"}`);

  const rows = ((items ?? []) as Item[]).map((it) => ({
    shop_id: shop.id,
    name: it.name,
    name_en: it.name_en,
    description: it.description,
    price_cents: it.price_cents,
    price_source: it.price_source,
    tags: it.tags,
    stock: Math.max(it.stock, 3),
    sold_out: false,
    sort: it.sort,
  }));
  if (rows.length) {
    const { error: itemsErr } = await db.from("items").insert(rows);
    if (itemsErr) throw new Error(`copy items: ${itemsErr.message}`);
  }
  await db.from("events").insert({ shop_id: shop.id, type: "shop_opened", detail: { copied_from: source.slug } });

  // Housekeeping: drop visitor sandboxes older than 2 days.
  if (Math.random() < 0.1) {
    after(async () => {
      await db.rpc("purge_old_sandboxes");
    });
  }

  return {
    shop,
    owner_token: token,
    owner_url: `/shop/${shop.slug}?k=${token}`,
    public_url: `/s/${shop.slug}`,
    agent_url: `/s/${shop.slug}/agent.json`,
  };
}
