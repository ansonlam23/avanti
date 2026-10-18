// "Why this shop?": the reasons behind the AI's pick, built ONLY from data the
// cards on screen already hold (the shop's own tags, walk minutes, the pickup
// vs the shopper's deadline, stock, the owner's AI limit). Nothing is guessed:
// when a fact isn't there, its reason is left out. Pure (why.test.ts).
import type { AskShopResult, MenuResult, OrderProposal, SearchShop, SearchShopsResult } from "@/lib/ai/shopper-types";
import { normalize, stem } from "@/lib/ai/tools/match";
import { formatClock, formatPriceShort } from "@/lib/format";

/** A tool result that a card on screen is showing. */
export type WhySource =
  | { kind: "search"; result: SearchShopsResult }
  | { kind: "menu"; result: MenuResult }
  | { kind: "ask"; result: AskShopResult };

/**
 * Tags an owner can put on an item that say it meets a need (from the
 * onboarding tag list), and the words a shopper uses to ask about each.
 * A "contains-…" tag is never a reason, so it isn't here.
 */
const NEED_TAGS: Record<string, string[]> = {
  "nut-free": ["nut", "almond", "walnut", "pecan", "hazelnut", "pistachio", "cashew", "macadamia"],
  "peanut-free": ["peanut"],
  "gluten-free": ["gluten", "wheat", "celiac", "coeliac"],
  "dairy-free": ["dairy", "milk", "lactose"],
  "egg-free": ["egg"],
  "soy-free": ["soy", "soya"],
  "sesame-free": ["sesame"],
  "sugar-free": ["sugar"],
  vegan: ["vegan", "plant based"],
  vegetarian: ["vegetarian", "veggie", "veggies"],
  halal: ["halal"],
  kosher: ["kosher"],
};

/** Whole words only ("eggplant" isn't "egg"), plurals folded ("nuts" → "nut"). */
function words(text: string): string {
  return ` ${normalize(text).split(" ").filter(Boolean).map(stem).join(" ")} `;
}

/** The needs a question or search names, as the tags that would meet them: "has nuts?" → ["nut-free"]. */
export function needsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const said = words(text);
  return Object.entries(NEED_TAGS)
    .filter(([, asks]) => asks.some((a) => said.includes(words(a))))
    .map(([tag]) => tag);
}

/** Everything the shopper asked about in this chat: the AI's searches and its questions to shops. */
export function askedNeeds(sources: readonly WhySource[]): string[] {
  const asked = new Set<string>();
  for (const s of sources) {
    const text = s.kind === "search" ? s.result.query : s.kind === "ask" ? s.result.question : null;
    for (const need of needsIn(text)) asked.add(need);
  }
  return [...asked];
}

/** The item's own tags that meet a need the shopper asked about, in the owner's words. */
export function metNeeds(tags: readonly string[] | null | undefined, asked: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const t = tag.trim().toLowerCase();
    if (asked.includes(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export interface WhyFacts {
  /** The item's tags as the owner set them; null = no card on screen shows this item. */
  tags: string[] | null;
  /** Needs the shopper asked about, as tags ("nut-free"). */
  asked: string[];
  /** The deadline of the latest search that found this item ("6 PM"); null = none given. */
  neededBy: string | null;
  /** The shop's cap on one AI order, in cents; null = no cap, or not known. */
  aiLimitCents: number | null;
}

/** What the cards on screen say about the proposal's item and shop (the newest card wins). */
export function factsFor(
  sources: readonly WhySource[],
  proposal: Pick<OrderProposal, "shop_slug" | "item_id">,
): WhyFacts {
  let tags: string[] | null = null;
  let neededBy: string | null = null;
  let aiLimitCents: number | null = null;
  for (const s of sources) {
    if (s.kind === "search") {
      const shop = s.result.shops.find((x) => x.slug === proposal.shop_slug);
      if (!shop) continue;
      aiLimitCents = shop.ai_order_limit_cents ?? null;
      const item = shop.matches.find((m) => m.id === proposal.item_id);
      if (item) {
        tags = item.tags;
        neededBy = s.result.needed_by;
      }
    } else if (s.kind === "menu") {
      if (s.result.shop.slug !== proposal.shop_slug) continue;
      aiLimitCents = s.result.shop.ai_order_limit_cents ?? null;
      const item = s.result.items.find((i) => i.id === proposal.item_id);
      if (item) tags = item.tags;
    } else {
      if (s.result.shop.slug !== proposal.shop_slug) continue;
      const item = s.result.items.find((i) => i.id === proposal.item_id);
      if (item) tags = item.tags;
    }
  }
  return { tags, asked: askedNeeds(sources), neededBy, aiLimitCents };
}

interface Clock {
  /** "" for today, else "tomorrow" / a weekday. */
  day: string;
  minutes: number;
  /** "5:30" / "6" */
  time: string;
  suffix: "AM" | "PM";
}

/** "5:30 PM" / "tomorrow 6 PM" (the tools' own labels) → a wall-clock time. */
function readClock(label: string): Clock | null {
  const m = /^(?:(.+?)\s+)?(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i.exec(label.trim());
  if (!m) return null;
  const h = Number(m[2]);
  const min = Number(m[3] ?? "0");
  if (h < 1 || h > 12 || min > 59) return null;
  const suffix = m[4].toUpperCase() as "AM" | "PM";
  return {
    day: (m[1] ?? "").toLowerCase(),
    minutes: ((h % 12) + (suffix === "PM" ? 12 : 0)) * 60 + min,
    time: m[3] ? `${h}:${m[3]}` : `${h}`,
    suffix,
  };
}

/** "ready by 6" when the pickup is on the deadline's day, at or before it; else nothing. */
export function readyBy(pickupLabel: string, neededBy: string | null): string | null {
  if (!neededBy) return null;
  const at = readClock(pickupLabel);
  const by = readClock(neededBy);
  if (!at || !by || at.day !== by.day || at.minutes > by.minutes) return null;
  return `ready by ${at.suffix === by.suffix ? by.time : `${by.time} ${by.suffix}`}`;
}

export type ReasonKind = "need" | "ready" | "walk" | "limit" | "stock";
export interface Reason {
  kind: ReasonKind;
  text: string;
}

/** At most this many reasons: one quiet line, two at most on a phone. */
export const MAX_REASONS = 3;

/**
 * Why this order card's shop, most telling first: the item meets what the
 * shopper asked (in the shop's own tags) → ready by their deadline → the walk
 * → within the owner's AI limit → in stock.
 */
export function orderReasons(p: OrderProposal, f: WhyFacts): Reason[] {
  const out: Reason[] = [];
  const met = metNeeds(f.tags, f.asked).slice(0, 2);
  if (met.length) out.push({ kind: "need", text: `${met.join(", ")}, per the shop` });
  const ready = readyBy(p.pickup_label, f.neededBy);
  if (ready) out.push({ kind: "ready", text: ready });
  if (p.walk_minutes !== null) out.push({ kind: "walk", text: `${p.walk_minutes} min walk` });
  if (f.aiLimitCents !== null && f.aiLimitCents > 0 && p.amount_cents <= f.aiLimitCents) {
    out.push({ kind: "limit", text: `within the shop's ${formatPriceShort(f.aiLimitCents)} AI limit` });
  }
  if (p.stock_left >= p.qty) out.push({ kind: "stock", text: "in stock" });
  // "in stock" alone explains nothing (every card is): then there's no line at all
  return out.some((r) => r.kind !== "stock") ? out.slice(0, MAX_REASONS) : [];
}

/**
 * A shop card's line, the same reasons said shorter, then the pickup facts:
 * "nut-free · 11 min walk · ready by 6 PM". The tag comes from a match that can
 * still be ordered, and only when the shopper asked for that need.
 */
export function shopLine(
  shop: SearchShop,
  neededBy: string | null,
  asked: readonly string[],
  gone: Readonly<Record<string, true>> = {},
): string[] {
  const orderable = shop.matches.filter((m) => m.available && !gone[m.id] && m.ai_orderable !== false);
  const need = orderable.map((m) => metNeeds(m.tags, asked)[0]).find(Boolean) ?? null;
  const when =
    neededBy && shop.ready_by_needed !== null
      ? shop.ready_by_needed
        ? `ready by ${neededBy}`
        : `can't make ${neededBy}`
      : shop.pickup_open_now
        ? `pickup till ${formatClock(shop.pickup_window.end)}`
        : shop.earliest_pickup
          ? `pickup from ${shop.earliest_pickup}`
          : null;
  const where = shop.walk_minutes !== null ? `${shop.walk_minutes} min walk` : shop.location_label;
  return [need, where, when].filter((x): x is string => Boolean(x));
}
