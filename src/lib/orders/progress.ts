// The pickup ticket's live status (CONTRACTS §18). Pure, unit-tested.
//
// After "Confirm & hold" the shopper gets a ticket: Sent → Preparing → Ready →
// Picked up. Three timestamps on the order drive it (migration 0007):
// seen_at (the counter showed it to the owner), ready_at (the owner tapped
// Ready), here_at (the shopper tapped "I'm here").
import type { PublicOrder } from "@/lib/types";

export interface OrderProgress {
  seen_at?: string | null;
  ready_at?: string | null;
  here_at?: string | null;
}

/** GET /api/orders/[id]: the shopper's order, plus what the ticket needs. */
export type TicketOrder = PublicOrder &
  OrderProgress & {
    /** The pickup name the shopper gave (the ticket says "for Anson"). */
    customer_name?: string | null;
    /** Where the shop is, in the owner's words ("The Ave, near 45th"). */
    shop_location?: string | null;
  };

export type StepKey = "sent" | "preparing" | "ready" | "picked";

export interface TicketStep {
  key: StepKey;
  label: string;
  done: boolean;
  /** The step in progress (only while held). */
  current: boolean;
}

/**
 * Sent → Preparing → Ready → Picked up. While held, exactly one step is the one
 * in progress: Sent until the counter has shown the order (seen_at), Preparing
 * until the owner taps Ready, then Ready until pickup. Paid: all four done.
 */
export function ticketSteps(order: Pick<TicketOrder, "status"> & OrderProgress): TicketStep[] {
  const keys: StepKey[] = ["sent", "preparing", "ready", "picked"];
  const labels: Record<StepKey, string> = { sent: "Sent", preparing: "Preparing", ready: "Ready", picked: "Picked up" };
  if (order.status === "paid") return keys.map((key) => ({ key, label: labels[key], done: true, current: false }));
  const held = order.status === "held";
  const stage = !held ? -1 : order.ready_at ? 2 : order.seen_at ? 1 : 0;
  return keys.map((key, i) => ({ key, label: labels[key], done: held && i < stage, current: i === stage }));
}

/** "Mai's Bakery (demo)" → "Mai's Bakery": the step labels stay short. */
export function shortShop(name: string): string {
  return name.replace(/\s*\((demo|test)\)\s*$/i, "").trim() || name;
}

/** "chocolate birthday cake" for qty 1, "2 lemon bars" otherwise (names stay as the owner wrote them). */
function what(qty: number, item: string): string {
  const name = item.trim().toLowerCase();
  if (qty <= 1) return `the ${name}`;
  const plural = /^[a-z\s'-]+$/.test(name) && !/s$/.test(name) ? (/[^aeiou]y$/.test(name) ? `${name.slice(0, -1)}ies` : `${name}s`) : name;
  return `${qty} ${plural}`;
}

/** What the counter says when the shopper taps "I'm here": "Anson is here for the chocolate cake." */
export function hereLine(order: { customer_name?: string | null; qty: number; item_name: string }): string {
  const who = order.customer_name?.trim() || "Your shopper";
  return `${who} is here for ${what(order.qty, order.item_name)}.`;
}

/** The shopper's ticket when the owner taps Ready: "Your chocolate cake is ready." */
export function readyLine(order: { qty: number; item_name: string }): string {
  const name = order.item_name.trim().toLowerCase();
  return order.qty > 1 ? `Your ${what(order.qty, order.item_name)} are ready.` : `Your ${name} is ready.`;
}

/** The note that travels with a shared ticket link (the code is on the ticket too). */
export function shareText(order: Pick<TicketOrder, "shop_name" | "qty" | "item_name" | "pickup_code">): string {
  return `Can you pick this up for me at ${shortShop(order.shop_name)}? ${order.qty} × ${order.item_name}, pickup code ${order.pickup_code}.`;
}

/**
 * Postgres "undefined column" (42703) or PostgREST "not in the schema cache"
 * (PGRST204) for the progress columns: migration 0007 isn't applied on this DB
 * yet. The ticket then shows only what the order itself knows.
 */
export function missingProgressColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(err && (err.code === "42703" || err.code === "PGRST204") && /(seen|ready|here)_at/.test(err.message ?? ""));
}
