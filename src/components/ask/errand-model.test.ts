import { describe, expect, it } from "vitest";
import type { PublicOrder } from "@/lib/types";
import {
  cardGroups,
  confirmable,
  confirmAllOf,
  errandStops,
  errandTotals,
  errandView,
  isErrand,
  showConfirmAll,
} from "./errand-model";
import type { FeedItem } from "./feed";
import { newProposal, type ProposalState } from "./state";

const card = (id: string, rid: string, shop: string, item: string, cents: number): FeedItem => ({
  kind: "tool",
  id,
  responseId: rid,
  name: "propose_order",
  args: {},
  result: {
    ok: true,
    note: "",
    proposal: { shop_slug: shop, shop_name: shop, item_id: item, item_name: item, amount_cents: cents, pickup_time: "2026-10-18T00:30:00.000Z" },
  } as never,
  proactive: false,
});

const feed: FeedItem[] = [
  { kind: "user", id: "u1", text: "cake" },
  card("old", "r0", "mais-bakery", "cake", 1800),
  { kind: "user", id: "u2", text: "a cake, flowers and a print by 6" },
  { kind: "tool", id: "s1", responseId: "r1", name: "search_shops", args: {}, result: { ok: true, shops: [] } as never, proactive: false },
  card("c1", "r1", "mais-bakery", "cake", 1800),
  card("c2", "r1", "petal-cart", "bouquet", 2200),
  card("c3", "r1", "rabbit-rook-prints", "print", 1500),
  { kind: "ai", id: "t1", responseId: "r1", text: "Tap Confirm all.", streaming: false, proactive: false },
];

const ready = (): Record<string, ProposalState> => ({
  old: { ...newProposal("k0"), status: "replaced" },
  c1: newProposal("k1"),
  c2: newProposal("k2"),
  c3: newProposal("k3"),
});

const order = (id: string, status: PublicOrder["status"], cents: number, shop: string): PublicOrder => ({
  id,
  status,
  qty: 1,
  amount_cents: cents,
  currency: "USD",
  pickup_time: "2026-10-18T00:30:00.000Z",
  pickup_code: "4821",
  payment_mode: "sandbox",
  card_last4: "1111",
  created_at: "2026-10-18T00:12:00.000Z",
  item_name: "x",
  shop_name: shop,
  shop_slug: shop,
});

describe("errand model", () => {
  const groups = cardGroups(feed);
  const errand = groups[1];

  it("groups order cards by the reply that put them up", () => {
    expect(groups.map((g) => [g.responseId, g.cards.map((c) => c.id)])).toEqual([
      ["r0", ["old"]],
      ["r1", ["c1", "c2", "c3"]],
    ]);
    expect(isErrand(groups[0])).toBe(false);
    expect(isErrand(errand)).toBe(true);
  });

  it("Confirm all covers the cards still open, with their DB-priced total", () => {
    const ps = ready();
    expect(confirmAllOf(errand, ps)).toEqual({ ids: ["c1", "c2", "c3"], totalCents: 5500 });
    expect(showConfirmAll(errand, ps)).toBe(true);
    // one held by its own button, one retryable failure: still two to place
    ps.c1 = { ...ps.c1, status: "held", orderId: "o1" };
    ps.c2 = { ...ps.c2, status: "failed", error: { code: "network", message: "", retry: true } };
    expect(confirmAllOf(errand, ps)).toEqual({ ids: ["c2", "c3"], totalCents: 3700 });
    // a final failure can't be retried with the same key: one left, so no Confirm all
    ps.c2 = { ...ps.c2, error: { code: "over_ai_limit", message: "", retry: false } };
    expect(confirmable(ps.c2)).toBe(false);
    expect(showConfirmAll(errand, ps)).toBe(false);
  });

  it("shows the cards until nothing is left to place, then the summary if anything was held", () => {
    const ps = ready();
    expect(errandView(errand, ps, false)).toBe("cards");
    ps.c1 = { ...ps.c1, status: "held", orderId: "o1" };
    ps.c2 = { ...ps.c2, status: "sold_out" };
    ps.c3 = { ...ps.c3, status: "pending" };
    expect(errandView(errand, ps, false)).toBe("cards");
    ps.c3 = { ...ps.c3, status: "held", orderId: "o3" };
    expect(errandView(errand, ps, true)).toBe("cards"); // Confirm all still running
    expect(errandView(errand, ps, false)).toBe("summary");
    const none = { ...ready(), c1: { ...ps.c1, status: "sold_out" as const, orderId: null }, c2: ps.c2, c3: { ...ps.c3, status: "replaced" as const, orderId: null } };
    expect(errandView(errand, none, false)).toBe("cards"); // nothing held: no summary
  });

  it("turns placed orders into one stop per shop, and lists what wasn't placed", () => {
    const ps = ready();
    ps.c1 = { ...ps.c1, status: "held", orderId: "o1" };
    ps.c2 = { ...ps.c2, status: "sold_out" };
    ps.c3 = { ...ps.c3, status: "held", orderId: "o3" };
    const orders = { o1: order("o1", "held", 1800, "mais-bakery"), o3: order("o3", "paid", 1500, "rabbit-rook-prints") };
    const { stops, missed } = errandStops(errand, ps, orders);
    expect(stops.map((s) => [s.id, s.lines.map((l) => l.order.id), s.pickupAt])).toEqual([
      ["mais-bakery", ["o1"], Date.parse("2026-10-18T00:30:00.000Z")],
      ["rabbit-rook-prints", ["o3"], Date.parse("2026-10-18T00:30:00.000Z")],
    ]);
    expect(missed.map((c) => c.id)).toEqual(["c2"]);
    expect(errandTotals(Object.values(orders))).toEqual({ heldCents: 1800, paidCents: 1500, releasedCents: 0 });
  });

  it("puts two things from one shop on one stop", () => {
    const two = cardGroups([card("a", "r", "mais-bakery", "cake", 1800), card("b", "r", "mais-bakery", "cookie", 250)])[0];
    const ps = { a: { ...newProposal("ka"), status: "held" as const, orderId: "oa" }, b: { ...newProposal("kb"), status: "held" as const, orderId: "ob" } };
    const orders = { oa: order("oa", "held", 1800, "mais-bakery"), ob: order("ob", "held", 250, "mais-bakery") };
    const { stops } = errandStops(two, ps, orders);
    expect(stops).toHaveLength(1);
    expect(stops[0].lines).toHaveLength(2);
  });
});
