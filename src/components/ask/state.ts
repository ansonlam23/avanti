// /ask's view state and its reducer. Pure (unit-tested in state.test.ts).
import type { ToolName, ToolResult } from "@/lib/ai/shopper-types";
import type { BlockReason, PublicOrder } from "@/lib/types";
import { proposalOf, type FeedItem } from "./feed";

/** `replaced` = a newer card superseded this one before it was confirmed. */
export type ProposalStatus = "ready" | "pending" | "held" | "failed" | "sold_out" | "replaced";

export interface ProposalState {
  status: ProposalStatus;
  /**
   * Idempotency key, made ONCE when the card appears. Every tap/retry of this
   * card sends it, so the shop can never place two holds for one card.
   */
  key: string;
  orderId: string | null;
  stage: "signing" | "visa" | null;
  /** `retry`: tapping again (same key) can still succeed; else ask for a fresh card. */
  error: { code: string; message: string; retry: boolean; reason?: BlockReason } | null;
  heldMs: number | null; // Confirm → HELD, measured on this device
}

/** The two hero beats after Confirm & hold (a FocusReveal over the chat). */
export interface Reveal {
  orderId: string;
  step: "verified" | "held";
}

export interface State {
  feed: FeedItem[];
  busy: boolean;
  status: string | null;
  /** The reply still streaming (its order cards wait until it settles). */
  activeResponse: string | null;
  proposals: Record<string, ProposalState>;
  orders: Record<string, PublicOrder>;
  /** Item ids the shop just ran out of (live). */
  gone: Record<string, true>;
  reveal: Reveal | null;
}

export type Action =
  | { type: "reset" }
  | { type: "user"; id: string; text: string; hidden: boolean; status: string; responseId: string }
  | { type: "status"; status: string | null }
  | { type: "text"; id: string; responseId: string; delta: string; proactive: boolean }
  | {
      type: "tool";
      id: string;
      responseId: string;
      name: ToolName;
      args: Record<string, unknown>;
      result: ToolResult;
      proactive: boolean;
      /** Idempotency key for an order card (made by the caller; reducers stay pure). */
      key?: string;
    }
  | { type: "notice"; id: string; responseId: string | null; tone: "error" | "info"; text: string }
  | { type: "done" }
  | { type: "proposal"; id: string; patch: Partial<ProposalState> }
  | { type: "order"; order: PublicOrder }
  | { type: "gone"; itemId: string; gone: boolean }
  | { type: "reveal"; reveal: Reveal | null };

export const INITIAL: State = {
  feed: [],
  busy: false,
  status: null,
  activeResponse: null,
  proposals: {},
  orders: {},
  gone: {},
  reveal: null,
};

export function newProposal(key: string): ProposalState {
  return { status: "ready", key, orderId: null, stage: null, error: null, heldMs: null };
}

export function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return INITIAL;
    case "user":
      return {
        ...state,
        busy: true,
        status: a.status,
        activeResponse: a.responseId,
        feed: a.hidden ? state.feed : [...state.feed, { kind: "user", id: a.id, text: a.text }],
      };
    case "status":
      return { ...state, status: a.status };
    case "text": {
      const last = state.feed.at(-1);
      if (last?.kind === "ai" && last.responseId === a.responseId) {
        return { ...state, status: null, feed: [...state.feed.slice(0, -1), { ...last, text: last.text + a.delta }] };
      }
      const item: FeedItem = {
        kind: "ai",
        id: a.id,
        responseId: a.responseId,
        text: a.delta.replace(/^\s+/, ""),
        streaming: true,
        proactive: a.proactive,
      };
      return { ...state, status: null, feed: [...state.feed, item] };
    }
    case "tool": {
      const item: FeedItem = {
        kind: "tool",
        id: a.id,
        responseId: a.responseId,
        name: a.name,
        args: a.args,
        result: a.result,
        proactive: a.proactive,
      };
      const proposal = proposalOf(item);
      if (!proposal) return { ...state, feed: [...state.feed, item] };
      // One live Confirm button at a time: older unconfirmed cards step aside.
      const proposals: Record<string, ProposalState> = {};
      for (const [id, p] of Object.entries(state.proposals)) {
        proposals[id] = p.status === "ready" || p.status === "failed" ? { ...p, status: "replaced", error: null } : p;
      }
      const fresh = newProposal(a.key ?? `card-${a.id}`);
      proposals[a.id] = { ...fresh, status: state.gone[proposal.item_id] ? "sold_out" : "ready" };
      return { ...state, feed: [...state.feed, item], proposals };
    }
    case "notice":
      return {
        ...state,
        feed: [...state.feed, { kind: "notice", id: a.id, responseId: a.responseId, tone: a.tone, text: a.text }],
      };
    case "done":
      return {
        ...state,
        busy: false,
        status: null,
        activeResponse: null,
        feed: state.feed.map((f) => (f.kind === "ai" && f.streaming ? { ...f, streaming: false } : f)),
      };
    case "proposal": {
      const prev = state.proposals[a.id];
      if (!prev) return state;
      return { ...state, proposals: { ...state.proposals, [a.id]: { ...prev, ...a.patch } } };
    }
    case "order":
      return { ...state, orders: { ...state.orders, [a.order.id]: a.order } };
    case "gone": {
      const gone = { ...state.gone };
      if (a.gone) gone[a.itemId] = true;
      else delete gone[a.itemId];
      const proposals = { ...state.proposals };
      for (const f of state.feed) {
        const p = proposalOf(f);
        const ps = proposals[f.id];
        if (!p || !ps || p.item_id !== a.itemId) continue;
        if (a.gone && ps.status === "ready") proposals[f.id] = { ...ps, status: "sold_out" };
        if (!a.gone && ps.status === "sold_out") proposals[f.id] = { ...ps, status: "ready", error: null };
      }
      return { ...state, gone, proposals };
    }
    case "reveal":
      return { ...state, reveal: a.reveal };
  }
}
