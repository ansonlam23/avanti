// The visible feed of /ask and how one AI reply is laid out. Pure.
import type { OrderProposal, ToolName, ToolResult } from "@/lib/ai/shopper-types";

/** Every item of one AI reply shares a `responseId`; `proactive` = a reply to an app event. */
export type FeedItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "ai"; id: string; responseId: string; text: string; streaming: boolean; proactive: boolean }
  | {
      kind: "tool";
      id: string;
      responseId: string;
      name: ToolName;
      args: Record<string, unknown>;
      result: ToolResult;
      proactive: boolean;
    }
  | { kind: "notice"; id: string; responseId: string | null; tone: "error" | "info"; text: string };

export function proposalOf(item: FeedItem): OrderProposal | null {
  if (item.kind !== "tool" || item.name !== "propose_order") return null;
  return item.result.ok && "proposal" in item.result ? item.result.proposal : null;
}

function responseOf(item: FeedItem): string | null {
  return item.kind === "user" ? null : item.responseId;
}

/**
 * How a reply reads on a phone:
 *  - normal: the AI's work (shop cards, menus, "own words") → its words → the order card.
 *  - proactive ("Heads up"): its words first → the order card for the alternative
 *    (the search behind it is skipped when there's a card).
 * Order cards wait until the reply settles, so they land last, right above the composer.
 * An errand (one reply searching for several things) skips its search slips: the
 * cards already say which shop has each thing, and nine shop slips would bury them.
 */
export function orderFeed(feed: FeedItem[], activeResponse: string | null): FeedItem[] {
  const out: FeedItem[] = [];
  let i = 0;
  while (i < feed.length) {
    const rid = responseOf(feed[i]);
    if (!rid) {
      out.push(feed[i++]);
      continue;
    }
    const group: FeedItem[] = [];
    while (i < feed.length && responseOf(feed[i]) === rid) group.push(feed[i++]);

    const settled = rid !== activeResponse;
    const texts = group.filter((f) => f.kind === "ai");
    const notices = group.filter((f) => f.kind === "notice");
    const proposals = group.filter((f) => proposalOf(f) !== null);
    const searches = group.filter((f) => f.kind === "tool" && f.name === "search_shops").length;
    const work = group.filter(
      (f) => f.kind === "tool" && proposalOf(f) === null && !(searches >= 2 && f.name === "search_shops"),
    );
    const proactive = group.some((f) => (f.kind === "ai" || f.kind === "tool") && f.proactive);

    if (proactive) {
      out.push(...texts);
      if (settled) out.push(...(proposals.length ? [] : work), ...proposals);
    } else {
      out.push(...work, ...texts);
      if (settled) out.push(...proposals);
    }
    out.push(...notices);
  }
  return out;
}
