import { describe, expect, it } from "vitest";
import { orderFeed, type FeedItem } from "./feed";

const proposal = { ok: true, proposal: { item_id: "i1" }, note: "" } as never;
const search = { ok: true, shops: [] } as never;

function reply(rid: string, proactive = false): FeedItem[] {
  return [
    { kind: "tool", id: `${rid}-search`, responseId: rid, name: "search_shops", args: {}, result: search, proactive },
    { kind: "tool", id: `${rid}-card`, responseId: rid, name: "propose_order", args: {}, result: proposal, proactive },
    { kind: "ai", id: `${rid}-text`, responseId: rid, text: "Tap Confirm & hold.", streaming: false, proactive },
  ];
}

const ids = (f: FeedItem[]) => f.map((x) => x.id);

describe("orderFeed", () => {
  it("lays a reply out as: work → words → order card", () => {
    const feed: FeedItem[] = [{ kind: "user", id: "u1", text: "cake" }, ...reply("r1")];
    expect(ids(orderFeed(feed, null))).toEqual(["u1", "r1-search", "r1-text", "r1-card"]);
  });

  it("holds the order card back until the reply settles", () => {
    const feed: FeedItem[] = [{ kind: "user", id: "u1", text: "cake" }, ...reply("r1")];
    expect(ids(orderFeed(feed, "r1"))).toEqual(["u1", "r1-search", "r1-text"]);
  });

  it("puts a proactive 'Heads up' first and skips the search behind its card", () => {
    const feed: FeedItem[] = [...reply("r1"), ...reply("r2", true)];
    expect(ids(orderFeed(feed, null))).toEqual(["r1-search", "r1-text", "r1-card", "r2-text", "r2-card"]);
    expect(ids(orderFeed(feed, "r2"))).toEqual(["r1-search", "r1-text", "r1-card", "r2-text"]);
  });

  it("an errand (several searches in one reply) skips the search slips; its cards land together", () => {
    const tool = (id: string, name: "search_shops" | "ask_shop" | "propose_order", result: unknown): FeedItem =>
      ({ kind: "tool", id, responseId: "r1", name, args: {}, result, proactive: false }) as FeedItem;
    const feed: FeedItem[] = [
      { kind: "user", id: "u1", text: "a cake, flowers and a print by 6" },
      tool("s1", "search_shops", search),
      tool("s2", "search_shops", search),
      tool("s3", "search_shops", search),
      tool("a1", "ask_shop", { ok: true, topics: [] }),
      tool("c1", "propose_order", proposal),
      tool("c2", "propose_order", proposal),
      { kind: "ai", id: "t", responseId: "r1", text: "Tap Confirm all.", streaming: false, proactive: false },
    ];
    expect(ids(orderFeed(feed, null))).toEqual(["u1", "a1", "t", "c1", "c2"]);
    expect(ids(orderFeed(feed, "r1"))).toEqual(["u1", "a1", "t"]);
  });

  it("a stamp card belongs to no reply: it stays where it landed, between replies", () => {
    const card = { shop_name: "Mai's", shop_slug: "mais", every: 5, reward: "a free cookie", stamps: 3, visit: 3, earned: false };
    const feed: FeedItem[] = [
      { kind: "user", id: "u1", text: "cake" },
      ...reply("r1"),
      { kind: "stamp", id: "s1", orderId: "o1", card },
      { kind: "user", id: "u2", text: "and a coffee?" },
      ...reply("r2"),
    ];
    expect(ids(orderFeed(feed, null))).toEqual(["u1", "r1-search", "r1-text", "r1-card", "s1", "u2", "r2-search", "r2-text", "r2-card"]);
  });

  it("keeps a proactive search when there's no card, and notices last", () => {
    const feed: FeedItem[] = [
      { kind: "tool", id: "s", responseId: "r9", name: "search_shops", args: {}, result: search, proactive: true },
      { kind: "ai", id: "t", responseId: "r9", text: "Nothing else nearby.", streaming: false, proactive: true },
      { kind: "notice", id: "n", responseId: "r9", tone: "error", text: "oops" },
    ];
    expect(ids(orderFeed(feed, null))).toEqual(["t", "s", "n"]);
  });
});
