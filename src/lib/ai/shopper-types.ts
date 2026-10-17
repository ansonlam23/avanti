// Shapes shared by the shopper chat server (POST /api/agent/chat) and the /ask UI.
// Client-safe: no server imports here. Data shapes are snake_case (CONTRACTS §0.6).
import type { PickupWindow, PublicOrder } from "@/lib/types";

export const TOOL_NAMES = ["search_shops", "get_menu", "ask_shop", "propose_order", "check_order"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(name: unknown): name is ToolName {
  return typeof name === "string" && (TOOL_NAMES as readonly string[]).includes(name);
}

// ── Transcript (the client keeps it; the server is stateless) ──────────

/** One function call the model made. `step` = which round of the tool loop it was in. */
export interface ToolCallRecord {
  id?: string;
  name: ToolName;
  args: Record<string, unknown>;
  step: number;
}

export interface ToolResultRecord {
  id?: string;
  name: ToolName;
  result: ToolResult;
  step: number;
}

/**
 * Machine-readable app event on a hidden turn. For `sold_out` the server runs
 * search_shops for the same kind of item before the model's first round (the
 * real tool, on live data), so the "Heads up" lands one model round sooner.
 */
export interface ChatEventInfo {
  kind: "sold_out";
  shop_slug: string;
  item_id: string;
  item_name: string;
  /** The shopper's original search, if any (so the alternative honors it). */
  query?: string | null;
  needed_by?: string | null;
}

/**
 * `hidden: true` user turns carry app events (text starts with "[event]"):
 * they go to the model but are never shown as bubbles.
 * A model turn = every tool round of one reply + the visible text.
 */
export interface ChatTurn {
  role: "user" | "model";
  text?: string;
  hidden?: boolean;
  event?: ChatEventInfo;
  tool_calls?: ToolCallRecord[];
  tool_results?: ToolResultRecord[];
}

export interface ChatRequest {
  messages: ChatTurn[];
  /** This browser's own private shops (getMyShops()), so search can show them (CONTRACTS §11). */
  my_shops?: string[];
}

/** Streamed as `text/event-stream`, one JSON object per `data:` line. */
export type ChatEvent =
  | { type: "call"; name: ToolName; args: Record<string, unknown> } // the model asked for a tool (status line)
  | { type: "text"; delta: string } // model text, streamed
  | { type: "tool"; name: ToolName; args: Record<string, unknown>; result: ToolResult } // render as a card
  | { type: "turn"; turn: ChatTurn } // the finished model turn, append to the transcript
  | { type: "error"; message: string; code?: string }
  | { type: "done" };

// ── Tool results (small JSON; also what the cards render) ──────────────

export interface ShopSummary {
  slug: string;
  name: string;
  tagline: string | null;
  is_demo: boolean;
  photo_url: string | null;
  location_label: string | null;
  /** From the fixed shopper location (UW campus), straight-line at ~80 m/min. null = shop has no lat/lng. */
  walk_minutes: number | null;
  pickup_window: PickupWindow; // "HH:MM", America/Los_Angeles
  pickup_open_now: boolean;
  /** Earliest pickup we could propose, e.g. "3:40 PM" or "tomorrow 8 AM". */
  earliest_pickup: string | null;
  accepts_ai_orders: boolean;
  max_per_order: number;
  /** The most one AI order may cost at this shop, in cents; null/absent = no cap. */
  ai_order_limit_cents?: number | null;
}

export interface ItemSummary {
  id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  price_cents: number | null; // null = "Needs a price" (not orderable)
  tags: string[];
  stock: number;
  sold_out: boolean;
  /** !sold_out && stock > 0 && price_cents !== null */
  available: boolean;
  /** false = the owner keeps this item off-limits to AI shoppers ("order it in person"). Absent = true. */
  ai_orderable?: boolean;
}

export interface SearchShop extends ShopSummary {
  /** null when the shopper gave no deadline. */
  ready_by_needed: boolean | null;
  matches: ItemSummary[];
  more_matches: number;
}

export interface ToolFailure {
  ok: false;
  error: string;
  message: string;
}

export interface SearchShopsResult {
  ok: true;
  query: string;
  needed_by: string | null; // label, e.g. "6 PM"
  shopper_location: string;
  shops: SearchShop[];
  /** When nothing matched: what else is open, so the AI can offer it honestly. */
  other_open_shops: Array<Pick<ShopSummary, "slug" | "name" | "is_demo" | "walk_minutes">>;
  note?: string;
}

export interface MenuResult {
  ok: true;
  shop: ShopSummary & { open: boolean; notes: string | null };
  items: ItemSummary[];
}

export interface AskShopResult {
  ok: true;
  shop: { slug: string; name: string; is_demo: boolean };
  question: string;
  /** Allergen/diet topics found in the question, with exactly what the shop's own data says per item. */
  topics: Array<{
    topic: string;
    shop_says: string[];
    items: Array<{ id: string; name: string; says: string[] }>;
  }>;
  items: Array<Pick<ItemSummary, "id" | "name" | "name_en" | "description" | "tags" | "price_cents" | "available">>;
  rules: { max_per_order: number; accept_ai_orders: boolean; notes: string | null };
  pickup_window: PickupWindow;
  location_label: string | null;
  tagline: string | null;
  answer_rule: string;
}

export interface OrderProposal {
  shop_slug: string;
  shop_name: string;
  is_demo: boolean;
  location_label: string | null;
  walk_minutes: number | null;
  item_id: string;
  item_name: string;
  item_name_en: string | null;
  qty: number;
  unit_price_cents: number;
  amount_cents: number; // price_cents × qty, from the DB
  currency: "USD";
  pickup_time: string; // ISO (UTC)
  pickup_label: string; // "5:30 PM" | "tomorrow 9 AM"
  stock_left: number;
  max_per_order: number;
}

export interface ProposeOrderOk {
  ok: true;
  proposal: OrderProposal;
  note: string;
}

export type ProposeOrderResult = ProposeOrderOk | (ToolFailure & { pickup_window?: PickupWindow });

export type CheckOrderResult = { ok: true; order: PublicOrder } | ToolFailure;

export type ToolResult =
  | SearchShopsResult
  | MenuResult
  | AskShopResult
  | ProposeOrderResult
  | CheckOrderResult
  | ToolFailure;
