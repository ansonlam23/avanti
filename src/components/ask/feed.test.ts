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

  it("keeps a proactive search when there's no card, and notices last", () => {
    const feed: FeedItem[] = [
      { kind: "tool", id: "s", responseId: "r9", name: "search_shops", args: {}, result: search, proactive: true },
      { kind: "ai", id: "t", responseId: "r9", text: "Nothing else nearby.", streaming: false, proactive: true },
      { kind: "notice", id: "n", responseId: "r9", tone: "error", text: "oops" },
    ];
    expect(ids(orderFeed(feed, null))).toEqual(["t", "s", "n"]);
  });
});
