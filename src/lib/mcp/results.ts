// Shopper tool results → MCP tool results: one readable line, then the
// compact JSON (CONTRACTS §15). Pure. Every price in here comes from the
// tool result, which read it from the shop's own menu in the database.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  AskShopResult,
  ItemSummary,
  MenuResult,
  OrderProposal,
  SearchShopsResult,
  ShopSummary,
  ToolFailure,
  ToolResult,
} from "@/lib/ai/shopper-types";
import { windowLabel } from "@/lib/ai/tools/time";
import { formatCents, formatPriceShort } from "@/lib/format";
import type { PaymentMode } from "@/lib/types";
import { isAsap, orderLink, orderPrompt, pickupPhrase } from "./links";

const LINE_SHOPS = 3;
const LINE_MATCHES = 2;
const LINE_MENU_ITEMS = 8;

export function callResult(line: string, data: unknown, isError = false): CallToolResult {
  return {
    content: [
      { type: "text", text: line },
      { type: "text", text: JSON.stringify(data) },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

/** A refusal or error: the human message first, then the JSON ({ ok: false, error, message, … }). */
export function failureResult(r: ToolFailure): CallToolResult {
  return callResult(r.message, r, true);
}

function unexpected(r: ToolResult): CallToolResult {
  return callResult("The shop directory sent an unexpected answer. Try again in a moment.", r, true);
}

function shopBrief(s: Pick<ShopSummary, "name" | "is_demo" | "walk_minutes">): string {
  return `${s.name}${s.is_demo ? " (demo)" : ""}${s.walk_minutes !== null ? `, ${s.walk_minutes} min walk` : ""}`;
}

/** "Chocolate cake at $18 (3 left)", "Round loaf (needs a price)", "Croissant at $4.50 (sold out, in person only)". */
function itemBrief(i: ItemSummary): string {
  if (i.price_cents === null) return `${i.name} (needs a price)`;
  const bits = [i.sold_out || i.stock <= 0 ? "sold out" : `${i.stock} left`];
  if (i.ai_orderable === false) bits.push("in person only");
  return `${i.name} at ${formatPriceShort(i.price_cents)} (${bits.join(", ")})`;
}

export function searchResult(r: ToolResult): CallToolResult {
  if (!r.ok) return failureResult(r);
  if (!("shops" in r)) return unexpected(r);
  const s: SearchShopsResult = r;
  if (!s.shops.length) {
    const others = s.other_open_shops.map((o) => `${o.name}${o.is_demo ? " (demo)" : ""}`);
    const line = `${s.note ?? `Nothing matches "${s.query}".`}${others.length ? ` Open now: ${others.join(", ")}.` : ""}`;
    return callResult(line, s);
  }
  const shops = s.shops.slice(0, LINE_SHOPS).map((shop) => {
    const late = shop.ready_by_needed === false && s.needed_by ? ` (not ready by ${s.needed_by})` : "";
    const hidden = Math.max(0, shop.matches.length - LINE_MATCHES) + shop.more_matches;
    const more = hidden ? `; +${hidden} more` : "";
    return `${shopBrief(shop)}${late}: ${shop.matches.slice(0, LINE_MATCHES).map(itemBrief).join("; ")}${more}`;
  });
  const extra = s.shops.length > LINE_SHOPS ? ` · +${s.shops.length - LINE_SHOPS} more` : "";
  const n = s.shops.length;
  return callResult(`${n} open shop${n === 1 ? "" : "s"} for "${s.query}" near the ${s.shopper_location}: ${shops.join(" · ")}${extra}.`, s);
}

export function menuToolResult(r: ToolResult): CallToolResult {
  if (!r.ok) return failureResult(r);
  if (!("items" in r) || "answer_rule" in r) return unexpected(r);
  const m: MenuResult = r;
  const bits = [m.shop.open ? `pickup ${windowLabel(m.shop.pickup_window)}` : "closed now"];
  if (!m.shop.accepts_ai_orders) bits.push("not taking AI orders");
  if (m.shop.ai_order_limit_cents) bits.push(`AI orders up to ${formatCents(m.shop.ai_order_limit_cents)}`);
  const items = m.items.slice(0, LINE_MENU_ITEMS).map(itemBrief);
  if (m.items.length > LINE_MENU_ITEMS) items.push(`+${m.items.length - LINE_MENU_ITEMS} more`);
  return callResult(`${shopBrief(m.shop)}, ${bits.join(", ")}: ${items.join("; ") || "no items yet"}.`, m);
}

export function askResult(r: ToolResult): CallToolResult {
  if (!r.ok) return failureResult(r);
  if (!("answer_rule" in r)) return unexpected(r);
  const a: AskShopResult = r;
  const name = a.shop.name;
  const topics = a.topics.map((t) => t.topic);
  const facts = a.topics.flatMap((t) => [
    ...t.shop_says,
    ...t.items.filter((i) => i.says.length).map((i) => `${i.name}: ${i.says.join(", ")}`),
  ]);
  let line: string;
  if (facts.length) {
    line = `${name}'s own words on ${topics.join(", ")}: ${[...new Set(facts)].join("; ")}. Answer only from these words; never guess allergens.`;
  } else if (topics.length) {
    line = `${name} didn't say anything about ${topics.join(", ")}. Tell the person "${name} didn't say" instead of guessing.`;
  } else {
    line = `${name}'s own words (item descriptions, tags, shop notes) are in the JSON. Answer only from them; if they don't cover it, say "${name} didn't say."`;
  }
  return callResult(line, a);
}

const PAYMENT_NOTE: Record<PaymentMode, string> = {
  sandbox: "Visa sandbox, test card: no real money moves",
  simulated: "payments are simulated: no real money moves",
};

export interface OrderContext {
  origin: string;
  paymentMode: PaymentMode;
  /** What the caller asked for (null/"asap" = earliest pickup), so the link doesn't pin a slot that will go stale. */
  requestedPickup: string | null | undefined;
}

/**
 * start_order: never places or pays for anything. On success it returns a
 * short summary and an order_link (/ask with the order prefilled); the person
 * confirms there. On refusal, the shop's human message.
 */
export function orderResult(r: ToolResult, ctx: OrderContext): CallToolResult {
  if (!r.ok) return failureResult(r);
  if (!("proposal" in r)) return unexpected(r);
  const p: OrderProposal = r.proposal;
  const asap = isAsap(ctx.requestedPickup);
  const link = orderLink(ctx.origin, orderPrompt(p, { asap }));
  const each = p.qty > 1 ? ` (${formatCents(p.unit_price_cents)} each)` : "";
  const at = pickupPhrase(p.pickup_label);
  const when = asap ? `as soon as possible (earliest ${at})` : at;
  const summary = `${p.qty} × ${p.item_name} from ${p.shop_name}${p.is_demo ? " (demo)" : ""}, ${formatCents(p.amount_cents)}${each}, pickup ${when}`;
  const next =
    "Not ordered yet. Give the person the order_link: they open it and confirm in avanti, where a signed, verified order places a Visa hold that is charged only at pickup.";
  const line = `Not ordered yet: ${summary}. To order, open ${link} and confirm in avanti: a signed, verified order places a Visa hold, charged only at pickup (${PAYMENT_NOTE[ctx.paymentMode]}).`;
  return callResult(line, {
    ok: true,
    status: "not_placed",
    summary,
    order_link: link,
    proposal: p,
    payments: ctx.paymentMode,
    next_step: next,
  });
}
