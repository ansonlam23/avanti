// Owner insights (CONTRACTS §16): what AI shoppers asked for near a shop today.
// Rows live in public.ai_queries (migration 0005). No shopper identity of any kind.

/** Who ran the search: avanti's own shopper chat, or an outside AI over MCP. */
export type AiQuerySource = "chat" | "mcp";

/** One ai_queries row as inserted (one per search_shops call). */
export interface AiQueryInsert {
  source: AiQuerySource;
  /** What was searched for: one line, 1–200 characters, emails and long numbers removed. */
  query: string;
  /** The deadline the search was given, as passed (≤ 40 characters), or null. */
  needed_by: string | null;
  /** Shops the search returned: the matching shops, or the open shops nearby when nothing matched. */
  shop_slugs: string[];
  /** Of those, the shops with at least one matching item. */
  matched_slugs: string[];
}

/** The columns the insights read back. */
export interface AiQueryRow {
  query: string;
  shop_slugs: string[];
  matched_slugs: string[];
  created_at: string;
}

/** Something asked near the shop that its menu didn't have. */
export interface UnmetAsk {
  /** The most common wording, lowercased: "oat milk latte". */
  ask: string;
  /** Searches today that asked for it, showed this shop, and didn't match its menu. */
  count: number;
  /** In none of those searches did any shop have it. */
  nobody_nearby: boolean;
}

/** GET /api/shops/{slug}/insights. Counts for one Los Angeles calendar day. */
export interface ShopInsights {
  /** The day counted, "2026-10-17" (America/Los_Angeles). */
  day: string;
  timezone: "America/Los_Angeles";
  /** 00:00 that day in Los Angeles, as an ISO instant. */
  since: string;
  /** AI searches today that showed this shop. */
  shown: number;
  /** Of those, the searches where this shop had a matching item. */
  matched: number;
  /** Orders placed today (held, paid or released). */
  ordered: number;
  /** The top asks that showed this shop but weren't on its menu, most asked first (at most 5). */
  unmet: UnmetAsk[];
}
