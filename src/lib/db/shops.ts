import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { newOwnerToken } from "@/lib/auth/owner";
import { getDb } from "@/lib/db/server";
import { hasSupabase } from "@/lib/env";
import { SHOP_TIMEZONE, slugify } from "@/lib/format";
import type { Item, PriceSource, Shop } from "@/lib/types";

// Shops + items data access (server-only). `owner_token_hash` is never
// selected except by getShopOwnerHash(), and never leaves the server.

export const SHOP_PUBLIC_COLUMNS =
  "id, slug, name, tagline, owner_language, photo_url, open, pickup_window, rules, is_demo, listed, copied_from, location_label, lat, lng, created_at";
export const ITEM_COLUMNS =
  "id, shop_id, name, name_en, description, price_cents, price_source, tags, stock, sold_out, sort, created_at";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const PHOTO_BUCKET = "shop-photos";

// ── Reads ──────────────────────────────────────────────────────────────

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  if (!SLUG_RE.test(slug)) return null;
  const res = await getDb().from("shops").select(SHOP_PUBLIC_COLUMNS).eq("slug", slug).maybeSingle();
  if (res.error) throw new Error(`getShopBySlug: ${res.error.message}`);
  return (res.data as Shop | null) ?? null;
}

/** For owner checks only: pair with ownerTokenMatches(). Never return this to a client. */
export async function getShopOwnerHash(slug: string): Promise<{ id: string; owner_token_hash: string } | null> {
  if (!SLUG_RE.test(slug)) return null;
  const res = await getDb().from("shops").select("id, owner_token_hash").eq("slug", slug).maybeSingle();
  if (res.error) throw new Error(`getShopOwnerHash: ${res.error.message}`);
  return (res.data as { id: string; owner_token_hash: string } | null) ?? null;
}

export async function listItems(shopId: string): Promise<Item[]> {
  const res = await getDb()
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("shop_id", shopId)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (res.error) throw new Error(`listItems: ${res.error.message}`);
  return (res.data ?? []) as Item[];
}

export async function listOpenShops(): Promise<Shop[]> {
  const res = await getDb()
    .from("shops")
    .select(SHOP_PUBLIC_COLUMNS)
    .eq("open", true)
    .order("created_at", { ascending: false })
    .limit(100);
  if (res.error) throw new Error(`listOpenShops: ${res.error.message}`);
  return (res.data ?? []) as Shop[];
}

// ── Create (POST /api/shops) ───────────────────────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM (24h)");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const kebabTag = z
  .string()
  .transform((t) =>
    t
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  )
  .pipe(z.string().min(1).max(32));

const createItemSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    name_en: optionalText(80),
    description: optionalText(300),
    price_cents: z.number().int().min(1).max(100_000).nullable(),
    price_source: z.enum(["spoken", "tag_in_photo", "owner", "missing"]),
    tags: z
      .array(kebabTag)
      .max(16)
      .default([])
      .transform((tags) => [...new Set(tags)]),
    stock: z.number().int().min(0).max(999),
  })
  .transform((it) => ({
    ...it,
    // A null price is always "missing"; a price can never claim to be missing.
    price_source: (it.price_cents === null ? "missing" : it.price_source === "missing" ? "owner" : it.price_source) as PriceSource,
  }));

export const createShopRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: optionalText(140),
  owner_language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/)
    .default("en"),
  photo_url: z.httpUrl().max(1000).nullish().transform((v) => v ?? null),
  pickup_window: z
    .object({ start: hhmm, end: hhmm })
    .refine((w) => w.start < w.end, "pickup window must end after it starts"),
  rules: z.object({
    max_per_order: z.number().int().min(1).max(20),
    accept_ai_orders: z.boolean(),
    notes: optionalText(280),
  }),
  location_label: optionalText(120),
  lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
  is_demo: z.boolean().optional().default(false),
  items: z.array(createItemSchema).min(1).max(30),
});

export type CreateShopRequest = z.input<typeof createShopRequestSchema>;
export type CreateShopInput = z.output<typeof createShopRequestSchema>;

/** 201 body of POST /api/shops. `owner_token` is shown once and never stored in plain text. */
export interface CreateShopResponse {
  shop: Shop;
  owner_token: string;
  owner_url: string;
  public_url: string;
  agent_url: string;
}

/**
 * Create a live shop (open = true) with its items and a `shop_opened` event.
 * Shops made here are private sandboxes: `listed` is never set from input, so
 * the DB default (false, migration 0003) applies (CONTRACTS §11).
 */
export async function createShop(input: CreateShopInput): Promise<{ shop: Shop; ownerToken: string; items: Item[] }> {
  const db = getDb();
  const { token, hash } = newOwnerToken();
  const base = slugify(input.name);

  let shop: Shop | null = null;
  for (let attempt = 0; attempt < 4 && !shop; attempt++) {
    const slug = await freeSlug(base);
    const res = await db
      .from("shops")
      .insert({
        slug,
        name: input.name,
        tagline: input.tagline,
        owner_language: input.owner_language,
        photo_url: input.photo_url,
        open: true,
        pickup_window: input.pickup_window,
        rules: {
          max_per_order: input.rules.max_per_order,
          accept_ai_orders: input.rules.accept_ai_orders,
          ...(input.rules.notes ? { notes: input.rules.notes } : {}),
        },
        is_demo: input.is_demo,
        location_label: input.location_label,
        lat: input.lat,
        lng: input.lng,
        owner_token_hash: hash,
      })
      .select(SHOP_PUBLIC_COLUMNS)
      .single();
    if (res.error) {
      if (res.error.code === "23505") continue; // slug taken in a race → next suffix
      throw new Error(`createShop: ${res.error.message}`);
    }
    shop = res.data as Shop;
  }
  if (!shop) throw new Error("createShop: no free slug");

  const itemsRes = await db
    .from("items")
    .insert(
      input.items.map((it, i) => ({
        shop_id: shop.id,
        name: it.name,
        name_en: it.name_en,
        description: it.description,
        price_cents: it.price_cents,
        price_source: it.price_source,
        tags: it.tags,
        stock: it.stock,
        sort: i,
      })),
    )
    .select(ITEM_COLUMNS);
  if (itemsRes.error) {
    await db.from("shops").delete().eq("id", shop.id);
    throw new Error(`createShop items: ${itemsRes.error.message}`);
  }
  const items = ((itemsRes.data ?? []) as Item[]).sort((a, b) => a.sort - b.sort);

  const ev = await db.from("events").insert({
    shop_id: shop.id,
    type: "shop_opened",
    detail: {
      items: items.length,
      priced: items.filter((i) => i.price_cents !== null).length,
      is_demo: input.is_demo,
    },
  });
  if (ev.error) console.warn(`[shops] shop_opened event failed for ${shop.slug}: ${ev.error.message}`);

  return { shop, ownerToken: token, items };
}

/** base, base-2, base-3 … (first one not taken). */
async function freeSlug(base: string): Promise<string> {
  const res = await getDb().from("shops").select("slug").like("slug", `${base}%`).limit(1000);
  if (res.error) throw new Error(`freeSlug: ${res.error.message}`);
  const taken = new Set((res.data ?? []).map((r) => (r as { slug: string }).slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// ── Photos (Supabase Storage, public bucket, server-side uploads only) ──

const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Upload a counter photo; returns its public URL, or null if storage isn't set up / fails. */
export async function uploadShopPhoto(data: Buffer, mimeType: string): Promise<string | null> {
  const ext = PHOTO_EXT[mimeType];
  if (!ext || !hasSupabase()) return null;
  try {
    const storage = getDb().storage.from(PHOTO_BUCKET);
    const path = `shops/${randomUUID()}.${ext}`;
    const up = await storage.upload(path, data, { contentType: mimeType, upsert: false, cacheControl: "31536000" });
    if (up.error) {
      console.warn(`[shops] photo upload failed: ${up.error.message}`);
      return null;
    }
    return storage.getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn(`[shops] photo upload failed: ${(err as Error).message}`);
    return null;
  }
}

// ── agent.json (AgentMenu, CONTRACTS §5) ──────────────────────────────

export interface AgentMenu {
  schema: "open-sign/agent-menu@1";
  shop: {
    slug: string;
    name: string;
    tagline: string | null;
    language: string;
    photo_url: string | null;
    open: boolean;
    is_demo: boolean;
    location: { label: string | null; lat: number | null; lng: number | null };
  };
  pickup_window: { start: string; end: string; timezone: string };
  rules: { max_per_order: number; accept_ai_orders: boolean };
  items: Array<{
    id: string;
    name: string;
    name_en: string | null;
    description: string | null;
    price_cents: number | null;
    currency: "USD";
    tags: string[];
    stock: number;
    available: boolean;
  }>;
  ordering: {
    endpoint: string;
    method: "POST";
    content_type: "application/json";
    body: Record<string, string>;
    auth: {
      scheme: string;
      alg: "ed25519";
      label: string;
      tag: string;
      covered_components: string[];
      required_params: string[];
      max_window_seconds: number;
      unsigned_requests: "rejected";
    };
    payment: string;
  };
  updated_at: string;
}

/** An item can be ordered only if it has a price, stock, and isn't sold out. */
export function isAvailable(item: Pick<Item, "sold_out" | "stock" | "price_cents">): boolean {
  return !item.sold_out && item.stock > 0 && item.price_cents !== null;
}

// Mirrors CONTRACTS §7 (src/lib/trust exports the same constants once merged).
const AGENT_AUTH = {
  scheme: "HTTP Message Signatures (RFC 9421), Trusted Agent Protocol style",
  alg: "ed25519",
  label: "sig1",
  tag: "agent-payer-auth",
  covered_components: ["@method", "@authority", "@path", "content-type", "content-digest"],
  required_params: ["created", "expires", "keyid", "nonce", "alg", "tag"],
  max_window_seconds: 480,
  unsigned_requests: "rejected",
} as const;

export function toAgentMenu(shop: Shop, items: Item[], origin: string): AgentMenu {
  return {
    schema: "open-sign/agent-menu@1",
    shop: {
      slug: shop.slug,
      name: shop.name,
      tagline: shop.tagline,
      language: shop.owner_language,
      photo_url: shop.photo_url,
      open: shop.open,
      is_demo: shop.is_demo,
      location: { label: shop.location_label, lat: shop.lat, lng: shop.lng },
    },
    pickup_window: { start: shop.pickup_window.start, end: shop.pickup_window.end, timezone: SHOP_TIMEZONE },
    rules: { max_per_order: shop.rules.max_per_order, accept_ai_orders: shop.rules.accept_ai_orders },
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      name_en: i.name_en,
      description: i.description,
      price_cents: i.price_cents,
      currency: "USD",
      tags: i.tags,
      stock: i.stock,
      available: isAvailable(i),
    })),
    ordering: {
      endpoint: `${origin}/api/shops/${shop.slug}/orders`,
      method: "POST",
      content_type: "application/json",
      body: {
        item_id: "uuid",
        qty: "integer ≤ max_per_order",
        amount_cents: "integer = price_cents × qty",
        pickup_time: "ISO-8601 or null",
        customer_name: "string or null",
        idempotency_key: "string",
      },
      auth: { ...AGENT_AUTH, covered_components: [...AGENT_AUTH.covered_components], required_params: [...AGENT_AUTH.required_params] },
      payment: "Visa card authorization (hold) at order; captured at pickup; reversed on no-show.",
    },
    updated_at: new Date().toISOString(),
  };
}

// ── Request helpers ────────────────────────────────────────────────────

/** Absolute origin of the incoming request (works on localhost, LAN IPs and Vercel). */
export function originFrom(req: Request): string {
  const h = req.headers;
  const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0].trim();
  const fallback = new URL(req.url);
  const proto = (h.get("x-forwarded-proto") ?? fallback.protocol.replace(":", "")).split(",")[0].trim();
  return host ? `${proto}://${host}` : fallback.origin;
}
