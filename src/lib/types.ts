// Shared domain types (lead-owned; change only via CONTRACTS.md).
// Convention: data shapes (DB rows, API bodies, AI JSON) are snake_case,
// code (functions, params, React props) is camelCase.

export type PriceSource = "spoken" | "tag_in_photo" | "owner" | "missing";
export type OrderStatus = "pending" | "held" | "paid" | "released" | "failed";
export type PaymentMode = "simulated" | "sandbox";

/** Shop-local 24h times, America/Los_Angeles. e.g. { start: "08:00", end: "18:00" } */
export interface PickupWindow {
  start: string;
  end: string;
}

export interface ShopRules {
  max_per_order: number;
  accept_ai_orders: boolean;
  notes?: string | null;
  /** The most one AI order may cost, in cents (absent/null = no cap). See src/lib/orders/ai-rules.ts. */
  ai_max_order_cents?: number | null;
  /** Item ids the owner keeps off-limits to AI shoppers ("order in person"). */
  ai_blocked_items?: string[];
  /** Stamp cards for regulars (CONTRACTS §17). Absent/null = no loyalty program. See src/lib/loyalty. */
  loyalty?: LoyaltyRule | null;
}

/** "Every 5th pickup: a free cookie". every 2–20, reward 1–40 chars. */
export interface LoyaltyRule {
  every: number;
  reward: string;
}

/** Public shop row. `owner_token_hash` is server-only and never part of this type. */
export interface Shop {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  owner_language: string; // "en", "vi", "es", …
  photo_url: string | null;
  open: boolean;
  pickup_window: PickupWindow;
  rules: ShopRules;
  is_demo: boolean;
  /** Shows up in AI search for everyone (our seeded demo shops). Visitor shops are private sandboxes. */
  listed?: boolean;
  /** Set when this is a visitor's private copy of a demo shop. */
  copied_from?: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

/** Tags are kebab-case: "nut-free", "contains-nuts", "contains-dairy", "vegan", "gluten-free", "vegetarian", … */
export interface Item {
  id: string;
  shop_id: string;
  name: string; // in the owner's language
  name_en: string | null; // English, if different
  description: string | null;
  price_cents: number | null; // null = "Needs a price" (never invented)
  price_source: PriceSource;
  tags: string[];
  stock: number;
  sold_out: boolean;
  sort: number;
  created_at: string;
}

export interface Order {
  id: string;
  shop_id: string;
  item_id: string;
  qty: number;
  amount_cents: number; // always computed server-side from the menu
  currency: "USD";
  pickup_time: string | null; // ISO timestamp
  customer_name: string | null;
  status: OrderStatus;
  payment_mode: PaymentMode;
  agent_id: string | null;
  idempotency_key: string;
  visa_auth_id: string | null;
  visa_capture_id: string | null;
  visa_reversal_id: string | null;
  card_last4: string | null;
  pickup_code: string; // 4 digits
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  held_at: string | null;
  paid_at: string | null;
  released_at: string | null;
}

/** What a shopper (or the shopper agent) may see about their order. */
export type PublicOrder = Pick<
  Order,
  | "id"
  | "status"
  | "qty"
  | "amount_cents"
  | "currency"
  | "pickup_time"
  | "pickup_code"
  | "payment_mode"
  | "card_last4"
  | "created_at"
> & { item_name: string; shop_name: string; shop_slug: string };

export interface Agent {
  id: string;
  name: string;
  key_id: string; // RFC 7638 JWK thumbprint of the public key
  public_jwk: { kty: "OKP"; crv: "Ed25519"; x: string };
  verified: boolean;
  created_at: string;
}

export type EventType =
  | "order_verified"
  | "bot_blocked"
  | "order_held"
  | "order_failed"
  | "paid"
  | "released"
  | "sold_out"
  | "restocked"
  | "shop_opened";

export interface ShopEvent {
  id: number;
  shop_id: string | null;
  type: EventType;
  reason: string | null; // BlockReason for bot_blocked
  detail: Record<string, unknown>;
  created_at: string;
}

/** Why the trust layer rejected a request (shown verbatim in the agent log). */
export type BlockReason =
  | "unsigned" // no Signature / Signature-Input headers
  | "malformed" // headers present but unparseable / missing required params
  | "unknown_agent" // keyid not in the agent directory (or not verified)
  | "bad_signature" // signature doesn't verify against the directory key
  | "expired" // now > expires (or window longer than allowed)
  | "not_yet_valid" // created is in the future beyond skew
  | "replayed" // nonce already used
  | "digest_mismatch" // body changed after signing (e.g. edited amount)
  | "wrong_target"; // signed @authority/@path don't match this request

// ── Onboarding (Gemini structured output) ──────────────────────────────
export interface DraftItem {
  name: string;
  name_en: string | null;
  price_cents: number | null;
  price_source: PriceSource;
  description: string | null;
  tags: string[];
  est_quantity: number | null;
}

export interface MenuDraft {
  shop_name: string | null;
  language: string;
  items: DraftItem[];
  unclear: string[]; // things the AI couldn't determine, shown to the owner
}

// ── API bodies ─────────────────────────────────────────────────────────
export interface ApiError {
  error: { code: string; message: string; reason?: BlockReason };
}

/**
 * Body of POST /api/shops/[slug]/orders. This exact JSON string is what the
 * shopper agent signs (via Content-Digest). No card data ever goes through
 * the agent: the server pays with the sandbox test card on file.
 */
export interface OrderRequest {
  item_id: string;
  qty: number;
  amount_cents: number; // the price the agent was quoted; must match the menu
  pickup_time: string | null;
  customer_name: string | null;
  idempotency_key: string;
  /**
   * Optional device key for stamp cards (CONTRACTS §17): SHA-256 hex (64 lowercase
   * chars) of a random id that only the shopper's browser knows. Never the id itself.
   */
  shopper_key?: string | null;
}
