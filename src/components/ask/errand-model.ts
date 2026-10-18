// Errands on /ask: one AI reply that put up order cards for several things
// ("a cake, some flowers and a small print by 6"). Pure (errand-model.test.ts).
import type { OrderProposal } from "@/lib/ai/shopper-types";
import type { PublicOrder } from "@/lib/types";
import { proposalOf, type FeedItem } from "./feed";
import type { ProposalState } from "./state";

export interface CardRef {
  id: string;
  proposal: OrderProposal;
}

/** The order cards one reply put up, in the order they came. */
export interface CardGroup {
  responseId: string;
  cards: CardRef[];
}

/** Order cards grouped by the reply that proposed them, oldest reply first. */
export function cardGroups(feed: readonly FeedItem[]): CardGroup[] {
  const groups: CardGroup[] = [];
  const byReply = new Map<string, CardGroup>();
  for (const f of feed) {
    const proposal = proposalOf(f);
    if (!proposal || f.kind !== "tool") continue;
    let g = byReply.get(f.responseId);
    if (!g) {
      g = { responseId: f.responseId, cards: [] };
      byReply.set(f.responseId, g);
      groups.push(g);
    }
    g.cards.push({ id: f.id, proposal });
  }
  return groups;
}

export function isErrand(group: CardGroup | null | undefined): group is CardGroup {
  return Boolean(group && group.cards.length >= 2);
}

/** A tap can still place this card: it's ready, or it failed in a way the same key can retry. */
export function confirmable(ps: ProposalState | undefined): boolean {
  return Boolean(ps && (ps.status === "ready" || (ps.status === "failed" && ps.error?.retry)));
}

/** What "Confirm all" would place: the cards still open, and their total (DB-priced, from the proposals). */
export function confirmAllOf(group: CardGroup, proposals: Record<string, ProposalState>) {
  const cards = group.cards.filter((c) => confirmable(proposals[c.id]));
  return { ids: cards.map((c) => c.id), totalCents: cards.reduce((sum, c) => sum + c.proposal.amount_cents, 0) };
}

/** Confirm all shows while two or more of the errand's cards can still be placed. */
export function showConfirmAll(group: CardGroup, proposals: Record<string, ProposalState>): boolean {
  return isErrand(group) && confirmAllOf(group, proposals).ids.length >= 2;
}

/**
 * The cards while anything is still open or on its way; the summary once
 * nothing is left to confirm and at least one hold went through.
 */
export function errandView(
  group: CardGroup,
  proposals: Record<string, ProposalState>,
  running: boolean,
): "cards" | "summary" {
  if (running) return "cards";
  const states = group.cards.map((c) => proposals[c.id]);
  if (states.some((s) => !s || confirmable(s) || s.status === "pending")) return "cards";
  return states.some((s) => s?.status === "held" && s.orderId) ? "summary" : "cards";
}

export interface ErrandLine {
  cardId: string;
  proposal: OrderProposal;
  order: PublicOrder;
}

/** One shop on the walk, with what's waiting there. */
export interface ErrandStop {
  id: string; // shop slug
  shopName: string;
  isDemo: boolean;
  lines: ErrandLine[];
  /** Earliest pickup here (epoch ms), for the route's tie-break. */
  pickupAt: number | null;
}

/** The errand's placed orders as stops (one per shop), plus the cards that weren't placed. */
export function errandStops(
  group: CardGroup,
  proposals: Record<string, ProposalState>,
  orders: Record<string, PublicOrder>,
): { stops: ErrandStop[]; missed: CardRef[] } {
  const stops: ErrandStop[] = [];
  const bySlug = new Map<string, ErrandStop>();
  const missed: CardRef[] = [];
  for (const c of group.cards) {
    const ps = proposals[c.id];
    const order = ps?.status === "held" && ps.orderId ? orders[ps.orderId] : undefined;
    if (!order || order.status === "failed") {
      missed.push(c);
      continue;
    }
    let stop = bySlug.get(c.proposal.shop_slug);
    if (!stop) {
      stop = { id: c.proposal.shop_slug, shopName: c.proposal.shop_name, isDemo: c.proposal.is_demo, lines: [], pickupAt: null };
      bySlug.set(stop.id, stop);
      stops.push(stop);
    }
    stop.lines.push({ cardId: c.id, proposal: c.proposal, order });
    const at = Date.parse(order.pickup_time ?? c.proposal.pickup_time);
    if (Number.isFinite(at)) stop.pickupAt = stop.pickupAt === null ? at : Math.min(stop.pickupAt, at);
  }
  return { stops, missed };
}

/** Money across the errand's orders, by where it stands now (they follow the owner live). */
export function errandTotals(orders: readonly PublicOrder[]) {
  const sum = (status: PublicOrder["status"]) =>
    orders.filter((o) => o.status === status).reduce((s, o) => s + o.amount_cents, 0);
  return { heldCents: sum("held"), paidCents: sum("paid"), releasedCents: sum("released") };
}
