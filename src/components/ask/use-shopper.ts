"use client";

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { formatCents } from "@/lib/format";
import type {
  ChatEvent,
  ChatEventInfo,
  ChatTurn,
  MenuResult,
  OrderProposal,
  SearchShopsResult,
  ToolResult,
} from "@/lib/ai/shopper-types";
import { getMyShops } from "@/lib/my-shops";
import { useShopPings } from "@/lib/realtime/client";
import type { BlockReason, PublicOrder } from "@/lib/types";
import { proposalOf, type FeedItem } from "./feed";
import { newIdempotencyKey } from "./keys";
import { parseSse } from "./sse";
import { INITIAL, reducer, type Reveal } from "./state";
import { CHECKING_STOCK, statusFor, THINKING } from "./status";

export type { ProposalState, ProposalStatus, Reveal } from "./state";

// All of /ask's behavior: streaming the AI, the transcript we send it (a ref:
// it never renders), Confirm & hold, live order status, and the realtime
// "sold out → tell the AI" loop. The view state + reducer live in state.ts.

const NAME_KEY = "os_shopper_name";
let seq = 0;
const uid = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;


function readName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

async function fetchOrder(id: string): Promise<PublicOrder | null> {
  try {
    const res = await fetch(`/api/orders/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { order?: PublicOrder };
    return body.order ?? null;
  } catch {
    return null;
  }
}

/** true/false = the shop's live menu says so; null = couldn't check. */
async function stillAvailable(slug: string, itemId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`/api/agent/menu/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const menu = (await res.json()) as MenuResult;
    const item = menu.items?.find((i) => i.id === itemId);
    return item ? item.available : false;
  } catch {
    return null;
  }
}

interface Watched {
  itemId: string;
  itemName: string;
  slug: string;
  shopName: string;
}

export function useShopper() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [name, setNameState] = useState(readName);

  const turnsRef = useRef<ChatTurn[]>([]);
  const queueRef = useRef<Array<{ text: string; hidden: boolean; event?: ChatEventInfo }>>([]);
  const busyRef = useRef(false);
  const genRef = useRef(0); // bumps on reset so a stale pump stops
  const abortRef = useRef<AbortController | null>(null);
  const shopNamesRef = useRef<Record<string, string>>({});
  const reactedRef = useRef<Set<string>>(new Set());
  const checkingRef = useRef<Map<string, number>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set()); // order cards with a confirm in flight

  const setName = useCallback((v: string) => {
    const clean = v.slice(0, 60);
    setNameState(clean);
    try {
      window.localStorage.setItem(NAME_KEY, clean);
    } catch {
      // private mode: keep it in memory
    }
  }, []);

  const runStream = useCallback(async (responseId: string, proactive: boolean) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    let firstText: number | null = null;
    const notice = (text: string) => dispatch({ type: "notice", id: uid(), responseId, tone: "error", text });

    const handle = (ev: ChatEvent) => {
      switch (ev.type) {
        case "call":
          dispatch({ type: "status", status: statusFor(ev.name, ev.args, shopNamesRef.current) });
          break;
        case "text":
          if (firstText === null) firstText = performance.now() - t0;
          dispatch({ type: "text", id: uid(), responseId, delta: ev.delta, proactive });
          break;
        case "tool": {
          rememberShops(ev.result, shopNamesRef.current);
          // An order card gets its idempotency key the moment it exists (CONTRACTS §10).
          const key = ev.name === "propose_order" && ev.result.ok ? newIdempotencyKey() : undefined;
          dispatch({ type: "tool", id: uid(), responseId, name: ev.name, args: ev.args, result: ev.result, proactive, key });
          break;
        }
        case "turn":
          turnsRef.current = [...turnsRef.current, ev.turn];
          break;
        case "error":
          notice(ev.message);
          break;
        case "done":
          break;
      }
    };

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // my_shops: this browser's own private shops, so search can show them (CONTRACTS §11)
        body: JSON.stringify({ messages: turnsRef.current, my_shops: getMyShops() }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        notice(body?.error?.message ?? "The AI didn't answer. Try again in a moment.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSse(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(handle);
      }
      buffer += decoder.decode();
      parseSse(`${buffer}\n\n`).events.forEach(handle);
    } catch {
      if (!ctrl.signal.aborted) notice("Lost the connection to the AI. Try again.");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (!ctrl.signal.aborted) {
        dispatch({ type: "done" });
        console.info(
          `[ask] first text ${firstText === null ? "-" : Math.round(firstText)}ms · total ${Math.round(performance.now() - t0)}ms`,
        );
      }
    }
  }, []);

  const pump = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const gen = genRef.current;
    try {
      for (let next = queueRef.current.shift(); next && gen === genRef.current; next = queueRef.current.shift()) {
        const turn: ChatTurn = next.hidden
          ? { role: "user", text: next.text, hidden: true, ...(next.event ? { event: next.event } : {}) }
          : { role: "user", text: next.text };
        turnsRef.current = [...turnsRef.current, turn];
        const responseId = uid();
        dispatch({
          type: "user",
          id: uid(),
          text: next.text,
          hidden: next.hidden,
          status: next.hidden ? CHECKING_STOCK : THINKING,
          responseId,
        });
        await runStream(responseId, next.hidden);
      }
    } finally {
      if (gen === genRef.current) busyRef.current = false;
    }
  }, [runStream]);

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      queueRef.current.push({ text: t, hidden: false });
      void pump();
    },
    [pump],
  );

  /** A hidden app event the AI should react to (e.g. sold out). */
  const sendEvent = useCallback(
    (text: string, event?: ChatEventInfo) => {
      queueRef.current.push({ text, hidden: true, event });
      void pump();
    },
    [pump],
  );

  /** A hidden note for the AI's context only (no reply). */
  const noteEvent = useCallback((text: string) => {
    turnsRef.current = [...turnsRef.current, { role: "user", text, hidden: true }];
  }, []);

  const reset = useCallback(() => {
    genRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    turnsRef.current = [];
    reactedRef.current = new Set();
    busyRef.current = false;
    dispatch({ type: "reset" });
  }, []);

  // ── Sold out → the AI adapts ──────────────────────────────────────────
  /** What the shopper last searched for (so an alternative honors their deadline). */
  const lastSearch = useMemo(() => {
    for (let i = state.feed.length - 1; i >= 0; i--) {
      const f = state.feed[i];
      if (f.kind === "tool" && f.name === "search_shops") {
        const { query, needed_by } = f.args as { query?: unknown; needed_by?: unknown };
        return {
          query: typeof query === "string" ? query : null,
          needed_by: typeof needed_by === "string" ? needed_by : null,
        };
      }
    }
    return { query: null, needed_by: null };
  }, [state.feed]);

  const reactToSoldOut = useCallback(
    (w: Watched, how: "ping" | "confirm") => {
      dispatch({ type: "gone", itemId: w.itemId, gone: true });
      if (reactedRef.current.has(w.itemId)) return;
      reactedRef.current.add(w.itemId);
      sendEvent(
        how === "confirm"
          ? `[event] ${w.shopName} sold out of ${w.itemName} just as the shopper tapped Confirm & hold. Nothing was ordered or charged. Find the best alternative now and offer it in one short message.`
          : `[event] ${w.shopName} just marked ${w.itemName} sold out. The shopper's order card for it can't be confirmed anymore. Find the best alternative now and offer it in one short message.`,
        { kind: "sold_out", shop_slug: w.slug, item_id: w.itemId, item_name: w.itemName, ...lastSearch },
      );
    },
    [sendEvent, lastSearch],
  );

  /**
   * What a sold-out should interrupt: items in open order cards; or, while the
   * shopper is still browsing (no card since their last search), what that search
   * found. Never something they already ordered (buying the last one isn't news).
   */
  const watched = useMemo((): Watched[] => {
    const out: Watched[] = [];
    for (const f of state.feed) {
      const p = proposalOf(f);
      if (p && state.proposals[f.id]?.status === "ready") {
        out.push({ itemId: p.item_id, itemName: p.item_name, slug: p.shop_slug, shopName: p.shop_name });
      }
    }
    if (out.length) return out;
    let searchAt = -1;
    for (let i = state.feed.length - 1; i >= 0; i--) {
      const f = state.feed[i];
      if (f.kind === "tool" && f.name === "search_shops" && f.result.ok) {
        searchAt = i;
        break;
      }
    }
    if (searchAt < 0 || state.feed.slice(searchAt).some((f) => proposalOf(f) !== null)) return out;
    const result = (state.feed[searchAt] as Extract<FeedItem, { kind: "tool" }>).result as SearchShopsResult;
    for (const shop of result.shops) {
      for (const m of shop.matches) {
        if (m.available) out.push({ itemId: m.id, itemName: m.name, slug: shop.slug, shopName: shop.name });
      }
    }
    return out;
  }, [state.feed, state.proposals]);

  const slugs = useMemo(() => {
    const set = new Set<string>();
    for (const f of state.feed) for (const s of slugsIn(f)) set.add(s);
    for (const o of Object.values(state.orders)) if (o.shop_slug) set.add(o.shop_slug);
    return [...set].sort();
  }, [state.feed, state.orders]);

  const recheck = useCallback(
    async (w: Watched) => {
      const last = checkingRef.current.get(w.itemId) ?? 0;
      if (Date.now() - last < 1500) return;
      checkingRef.current.set(w.itemId, Date.now());
      const ok = await stillAvailable(w.slug, w.itemId);
      if (ok === false) reactToSoldOut(w, "ping");
      else if (ok === true && state.gone[w.itemId]) dispatch({ type: "gone", itemId: w.itemId, gone: false });
    },
    [reactToSoldOut, state.gone],
  );

  const refreshOrder = useCallback(async (id: string) => {
    const order = await fetchOrder(id);
    if (order) dispatch({ type: "order", order });
  }, []);

  const lastPollRef = useRef(0);
  useShopPings(slugs, (ping, slug) => {
    if (ping.kind === "stock") {
      const w = watched.find((x) => x.itemId === ping.item_id);
      if (w && (ping.sold_out || ping.stock <= 0)) void recheck(w);
      if (!ping.sold_out && ping.stock > 0 && state.gone[ping.item_id]) {
        dispatch({ type: "gone", itemId: ping.item_id, gone: false });
        reactedRef.current.delete(ping.item_id);
      }
    } else if (ping.kind === "order") {
      // Pings carry no order ids (pickup codes stay private): refetch our orders at that shop.
      for (const o of Object.values(state.orders)) if (o.shop_slug === slug) void refreshOrder(o.id);
    } else if (ping.kind === "poll" && slug === null) {
      // Fallback when realtime is down: re-check open cards + live orders every ~5 s.
      if (Date.now() - lastPollRef.current < 4500) return;
      lastPollRef.current = Date.now();
      for (const o of Object.values(state.orders)) if (o.status === "held" || o.status === "pending") void refreshOrder(o.id);
      const open = Object.entries(state.proposals).some(([, p]) => p.status === "ready");
      if (open) for (const w of watched) void recheck(w);
    }
  });

  // ── Confirm & hold ────────────────────────────────────────────────────
  const confirm = useCallback(
    async (cardId: string, proposal: OrderProposal) => {
      const prev = state.proposals[cardId];
      if (!prev) return;
      const retryable = prev.status === "ready" || (prev.status === "failed" && prev.error?.retry);
      if (!retryable) return;
      // The button is disabled while pending; this also stops a double tap that lands
      // before the re-render. The key was made with the card, so every retry reuses it.
      if (inflightRef.current.has(cardId)) return;
      inflightRef.current.add(cardId);
      const key = prev.key;
      const t0 = performance.now();
      dispatch({ type: "proposal", id: cardId, patch: { status: "pending", stage: "signing", error: null } });
      const stageTimer = setTimeout(() => dispatch({ type: "proposal", id: cardId, patch: { stage: "visa" } }), 800);
      /** retry=false when the shop finished this attempt: the same key would only return the same result. */
      const fail = (code: string, message: string, retry: boolean, reason?: BlockReason) =>
        dispatch({
          type: "proposal",
          id: cardId,
          patch: { status: "failed", stage: null, error: { code, message, retry, reason } },
        });

      try {
        const res = await fetch("/api/agent/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shop_slug: proposal.shop_slug,
            item_id: proposal.item_id,
            qty: proposal.qty,
            pickup_time: proposal.pickup_time,
            customer_name: name.trim() || null,
            idempotency_key: key,
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          order?: PublicOrder;
          error?: { code?: string; message?: string; reason?: BlockReason };
        } | null;

        if (res.ok && body?.order) {
          const order = body.order;
          dispatch({ type: "order", order });
          if (order.status === "failed") {
            fail("failed", "Visa couldn't place the hold, so nothing was charged. Ask me for a fresh card to try again.", false);
            return;
          }
          const heldMs = Math.round(performance.now() - t0);
          console.info(`[ask] confirm → ${order.status} in ${heldMs}ms`);
          dispatch({ type: "proposal", id: cardId, patch: { status: "held", orderId: order.id, stage: null, heldMs } });
          // A 201 from the shop means its trust check passed before anything else: VERIFIED → HELD.
          dispatch({ type: "reveal", reveal: { orderId: order.id, step: "verified" } });
          noteEvent(
            `[event] The shopper tapped Confirm & hold. Order ${order.id}: ${order.qty}× ${order.item_name} at ${order.shop_name}, ${order.status.toUpperCase()} ${formatCents(order.amount_cents)}, pickup ${proposal.pickup_label}.`,
          );
          return;
        }

        const code = body?.error?.code ?? "error";
        const message = body?.error?.message ?? "";
        if (res.status === 409 && code === "sold_out") {
          dispatch({
            type: "proposal",
            id: cardId,
            patch: { status: "sold_out", stage: null, error: { code, message, retry: false } },
          });
          reactToSoldOut(
            { itemId: proposal.item_id, itemName: proposal.item_name, slug: proposal.shop_slug, shopName: proposal.shop_name },
            "confirm",
          );
        } else if (res.status === 429) {
          fail("rate_limited", "That's a lot of orders in a short time. Give it a minute, then tap again.", true);
        } else if (res.status === 402) {
          fail("declined", "Visa declined the hold on the test card. Nothing was charged.", false);
        } else if (res.status === 401) {
          fail(
            "blocked",
            `${proposal.shop_name} couldn't verify this order's signature, so it never reached Visa.`,
            false,
            body?.error?.reason,
          );
        } else if (res.status === 409 || res.status === 404) {
          fail(code, message || "The shop's menu changed. Ask me for a fresh order card.", false);
        } else if (res.status === 502) {
          fail(code, "Visa couldn't place the hold, so nothing was charged. Ask me for a fresh card to try again.", false);
        } else {
          // 500/503: the shop may or may not have the order; the same key makes a retry safe.
          fail(code, "Couldn't reach the shop. Nothing was charged. Tap to try again.", true);
        }
      } catch {
        // Network trouble: the order may or may not exist. Same key on retry = no double hold.
        fail("network", "Lost the connection before the shop answered. Tap to try again; you won't be charged twice.", true);
      } finally {
        clearTimeout(stageTimer);
        inflightRef.current.delete(cardId);
      }
    },
    [name, noteEvent, reactToSoldOut, state.proposals],
  );

  const setReveal = useCallback((reveal: Reveal | null) => dispatch({ type: "reveal", reveal }), []);

  return { state, name, setName, send, reset, confirm, refreshOrder, setReveal };
}

function rememberShops(result: ToolResult, names: Record<string, string>) {
  if (!result.ok) return;
  if ("shops" in result) for (const s of result.shops) names[s.slug] = s.name;
  if ("other_open_shops" in result) for (const s of result.other_open_shops) names[s.slug] = s.name;
  if ("shop" in result && result.shop) names[result.shop.slug] = result.shop.name;
  if ("proposal" in result) names[result.proposal.shop_slug] = result.proposal.shop_name;
}

function slugsIn(f: FeedItem): string[] {
  if (f.kind !== "tool" || !f.result.ok) return [];
  const r = f.result;
  if ("shops" in r) return r.shops.map((s) => s.slug);
  if ("proposal" in r) return [r.proposal.shop_slug];
  if ("shop" in r && r.shop) return [r.shop.slug];
  if ("order" in r) return [r.order.shop_slug];
  return [];
}
