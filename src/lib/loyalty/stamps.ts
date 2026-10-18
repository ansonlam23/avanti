// Stamp math for loyalty seals (CONTRACTS §17). Pure, unit-tested.
//
// A stamp is one picked-up (paid) order at a shop that carries the shopper's
// device key. On an order: visit = paid_before + 1, and the reward is due on
// that order when visit % every === 0 (every 5 → the 5th, 10th, … pickup).
// Held orders count ahead of time, in the order they were placed, so the owner
// sees "Give: free cookie" on the ticket BEFORE tapping Picked up.
import type { OrderStatus } from "@/lib/types";

export function visitNumber(paidBefore: number): number {
  return Math.max(0, Math.floor(paidBefore)) + 1;
}

/** This visit earns the reward (every 5 → visits 5, 10, 15 …). */
export function rewardDue(visit: number | null | undefined, every: number): boolean {
  return typeof visit === "number" && visit > 0 && every > 0 && visit % every === 0;
}

export interface CardState {
  /** Seals pressed on the current card (1…every once the shopper has a stamp). */
  filled: number;
  /** Pickups still to go for the reward (0 when this visit earned it). */
  toGo: number;
  /** This visit completed the card: the reward is on the house. */
  complete: boolean;
}

/** The stamp card right after pickup number `visit`; a finished card starts over on the next pickup. */
export function cardAt(visit: number, every: number): CardState {
  if (!(every > 0) || !(visit > 0)) return { filled: 0, toGo: Math.max(0, every), complete: false };
  const filled = ((visit - 1) % every) + 1;
  return { filled, toGo: every - filled, complete: filled === every };
}

/** GET /api/loyalty?order=<id> → { loyalty: LoyaltyCard | null } (null: no program, or no device key on the order). */
export interface LoyaltyCard {
  shop_name: string;
  shop_slug: string;
  every: number;
  reward: string;
  /** Picked-up (paid) orders at this shop with this device key, all time. */
  stamps: number;
  /** Which pickup this order is for the shopper (null: not a pickup, e.g. released). */
  visit: number | null;
  /** This order's pickup earned the reward (visit % every === 0). */
  earned: boolean;
}

/** The rows needed to number one shop's pickups per device key. */
export interface KeyedOrder {
  id: string;
  shopper_key: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
}

const at = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/**
 * Which pickup each order is for its shopper at this shop. Paid orders are
 * numbered in the order they were picked up; held orders follow, in the order
 * they were placed (each one's visit = paid_before + 1, assuming the earlier
 * hold is picked up first). Released, failed and pending orders aren't pickups.
 * Pass one shop's rows only.
 */
export function visitsByOrder(rows: KeyedOrder[]): Map<string, number> {
  const byKey = new Map<string, { paid: KeyedOrder[]; held: KeyedOrder[] }>();
  for (const r of rows) {
    if (r.status !== "paid" && r.status !== "held") continue;
    const g = byKey.get(r.shopper_key) ?? { paid: [], held: [] };
    (r.status === "paid" ? g.paid : g.held).push(r);
    byKey.set(r.shopper_key, g);
  }
  const visits = new Map<string, number>();
  const tie = (a: KeyedOrder, b: KeyedOrder) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const { paid, held } of byKey.values()) {
    paid.sort((a, b) => at(a.paid_at ?? a.created_at) - at(b.paid_at ?? b.created_at) || tie(a, b));
    held.sort((a, b) => at(a.created_at) - at(b.created_at) || tie(a, b));
    paid.forEach((o, i) => visits.set(o.id, visitNumber(i)));
    held.forEach((o, i) => visits.set(o.id, visitNumber(paid.length + i)));
  }
  return visits;
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const v = Math.abs(Math.trunc(n));
  const teen = v % 100 >= 11 && v % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][v % 10] ?? "th");
  return `${Math.trunc(n)}${suffix}`;
}

// ── Copy (DESIGN.md §10: short, concrete words) ─────────────────────────

/** The quiet line on the owner's ticket: "First pickup" · "Regular · 3rd pickup". */
export function regularLine(visit: number | null | undefined): string | null {
  if (typeof visit !== "number" || visit < 1) return null;
  return visit === 1 ? "First pickup" : `Regular · ${ordinal(visit)} pickup`;
}

/** The shopper's card, still filling: "2 more for a free cookie". */
export function toGoLine(toGo: number, reward: string): string {
  return `${toGo} more for ${reward}`;
}

/** The shopper's card, the pickup that earned it: "This one's on the house: a free cookie". */
export const EARNED_LEAD = "This one's on the house:";
export function earnedLine(reward: string): string {
  return `${EARNED_LEAD} ${reward}`;
}

/** Seals per row on the card: one row up to 6, else even rows of at most 6 (7 → 4 + 3, 10 → 5 + 5, 20 → 5 × 4). */
export function sealColumns(every: number): number {
  if (every <= 6) return Math.max(1, every);
  return Math.ceil(every / Math.ceil(every / 6));
}
