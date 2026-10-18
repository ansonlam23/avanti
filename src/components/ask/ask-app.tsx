"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Receipt, SoundToggle, Wordmark } from "@/components/brand";
import type { MenuResult } from "@/lib/ai/shopper-types";
import { getMyShops } from "@/lib/my-shops";
import type { PaymentMode } from "@/lib/types";
import { AiBubble, Notice, StatusLine, UserBubble } from "./bubbles";
import { Composer } from "./composer";
import { DEFAULT_CHIPS, EmptyState } from "./empty-state";
import { Errand, ErrandNote } from "./errand";
import { cardGroups, isErrand, type CardGroup } from "./errand-model";
import { orderFeed, proposalOf, type FeedItem } from "./feed";
import { MenuCard, ShopSaysCard } from "./menu-card";
import { OrderCard } from "./order-card";
import { OrderReveal, receiptProps } from "./order-reveal";
import { OrderTray, TrayNote } from "./order-tray";
import { SearchResults } from "./shop-cards";
import { useShopper } from "./use-shopper";
import { useWide } from "./use-wide";
import "./ask.css";

// /ask: the AI shopper, ink on rice paper. Phone (390×844): one column, your
// notes are paper slips, the AI's words are plain ink, shops/menus/orders are
// paper slips inline. Laptop (≥ 1024): the conversation in a reading column and
// the order in a column to its right (order-tray.tsx), so the money is always in view.

// "My shops" (CONTRACTS §11) live in localStorage, shared with /demo's owner
// iframe; the storage event keeps this tab in sync when that one changes.
function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
const myShopsSnapshot = () => getMyShops().join(",");

export function AskApp({ initialPrompt = "" }: { initialPrompt?: string }) {
  const { state, name, setName, send, reset, confirm, confirmAll, setReveal } = useShopper();
  const revealOrder = state.reveal ? (state.orders[state.reveal.orderId] ?? null) : null;
  const [draft, setDraft] = useState(initialPrompt);
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [myShop, setMyShop] = useState<{ slug: string; name: string } | null>(null);
  const mineKey = useSyncExternalStore(subscribeStorage, myShopsSnapshot, () => "");
  const mine = useMemo(() => (mineKey ? mineKey.split(",") : []), [mineKey]);

  const mainRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Honesty label for the empty state + order cards (booleans/labels only).
  useEffect(() => {
    let live = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((h: { payments?: PaymentMode } | null) => live && setMode(h?.payments ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // A chip for the visitor's own shop ("What's at <shop>?").
  const firstMine = mine[0] ?? null;
  useEffect(() => {
    if (!firstMine) return;
    let live = true;
    fetch(`/api/agent/menu/${encodeURIComponent(firstMine)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MenuResult>) : null))
      .then((m) => live && m?.shop?.open && setMyShop({ slug: m.shop.slug, name: m.shop.name }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [firstMine]);

  // iOS: keep the composer above the keyboard by sizing to the visual viewport.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = mainRef.current;
    if (!vv || !el) return;
    const update = () => {
      el.style.setProperty("--ask-vh", `${vv.height}px`);
      el.style.setProperty("--ask-top", `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Follow the conversation unless the shopper scrolled up to read.
  const last = state.feed.at(-1);
  const followKey = `${state.feed.length}:${last?.kind === "ai" ? last.text.length : 0}:${state.status ?? ""}:${state.activeResponse ?? ""}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [followKey]);

  const chips = useMemo(
    () => (myShop ? [`What's at ${myShop.name}?`, ...DEFAULT_CHIPS.slice(0, 2)] : DEFAULT_CHIPS),
    [myShop],
  );

  const visible = useMemo(() => orderFeed(state.feed, state.activeResponse), [state.feed, state.activeResponse]);

  const latestProposalItem = useMemo(() => {
    for (let i = state.feed.length - 1; i >= 0; i--) {
      const p = proposalOf(state.feed[i]);
      if (p) return p.item_id;
    }
    return null;
  }, [state.feed]);

  // Laptop: the newest order card that's on screen sits on the tray, not in the feed.
  const wide = useWide();
  const trayItem = useMemo(() => {
    for (let i = visible.length - 1; i >= 0; i--) {
      const f = visible[i];
      if (f.kind === "tool" && proposalOf(f) && state.proposals[f.id]) return f;
    }
    return null;
  }, [visible, state.proposals]);
  const trayRef = useRef<HTMLElement>(null);

  // Errands: one reply's cards for several things travel together (errand.tsx).
  const groupOf = useMemo(() => {
    const m = new Map<string, CardGroup>();
    for (const g of cardGroups(state.feed)) for (const c of g.cards) m.set(c.id, g);
    return m;
  }, [state.feed]);
  const trayGroup = trayItem ? (groupOf.get(trayItem.id) ?? null) : null;
  const trayErrand = isErrand(trayGroup) ? trayGroup : null;

  function submit(text: string) {
    stickRef.current = true;
    send(text);
    setDraft("");
  }

  function orderCard(item: Extract<FeedItem, { kind: "tool" }>) {
    const proposal = proposalOf(item);
    const ps = state.proposals[item.id];
    if (!proposal || !ps) return null;
    return (
      <OrderCard
        proposal={proposal}
        state={ps}
        order={ps.orderId ? (state.orders[ps.orderId] ?? null) : null}
        name={name}
        onName={setName}
        onConfirm={() => void confirm(item.id, proposal)}
        mode={mode}
      />
    );
  }

  function errand(group: CardGroup) {
    return (
      <Errand
        group={group}
        proposals={state.proposals}
        orders={state.orders}
        batch={state.batch}
        name={name}
        onName={setName}
        onConfirm={(c) => void confirm(c.id, c.proposal)}
        onConfirmAll={(ids) => void confirmAll(group.responseId, ids)}
        mode={mode}
      />
    );
  }

  function renderTool(item: Extract<FeedItem, { kind: "tool" }>) {
    const r = item.result;
    if (!r.ok) return null; // the AI explains failures in words
    switch (item.name) {
      case "search_shops":
        return "shops" in r ? <SearchResults result={r} gone={state.gone} mine={mine} /> : null;
      case "get_menu":
        return "items" in r && "shop" in r && "notes" in r.shop ? (
          <MenuCard result={r as MenuResult} gone={state.gone} highlightId={latestProposalItem} />
        ) : null;
      case "ask_shop":
        return "topics" in r ? <ShopSaysCard result={r} /> : null;
      case "propose_order": {
        const proposal = proposalOf(item);
        const group = groupOf.get(item.id);
        if (proposal && isErrand(group)) {
          // the errand appears once, where its first card would be
          if (group.cards[0].id !== item.id) return null;
          if (wide && trayErrand?.responseId === group.responseId) {
            return (
              <ErrandNote
                group={group}
                proposals={state.proposals}
                onShow={() => trayRef.current?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus()}
              />
            );
          }
          return errand(group);
        }
        if (wide && proposal && item.id === trayItem?.id) {
          return (
            <TrayNote
              proposal={proposal}
              held={state.proposals[item.id]?.status === "held"}
              onShow={() => trayRef.current?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus()}
            />
          );
        }
        return orderCard(item);
      }
      case "check_order": {
        if (!("order" in r)) return null;
        const order = state.orders[r.order.id] ?? r.order;
        return <Receipt {...receiptProps(order)} tilt={0} className="mx-auto w-full max-w-[330px]" />;
      }
    }
  }

  const empty = state.feed.length === 0;

  return (
    <main
      ref={mainRef}
      className="ask-app fixed inset-x-0 mx-auto flex w-full max-w-[480px] flex-col bg-counter md:max-w-[640px] md:bg-transparent lg:max-w-[1600px]"
      style={{ top: "var(--ask-top, 0px)", height: "var(--ask-vh, 100dvh)" }}
    >
      <OrderReveal reveal={state.reveal} order={revealOrder} onChange={setReveal}>
        <div className="flex h-full flex-col">
          <header className="relative z-10 flex items-center gap-3 pb-3 pl-5 pr-3 pt-[max(env(safe-area-inset-top),14px)] lg:px-12 lg:pb-3 lg:pt-6">
            <div className="min-w-0 flex-1">
              {/* the avanti wordmark + who's talking: "avanti shopper" */}
              <h1 className="flex items-baseline gap-[0.3em] font-display text-[26px] font-normal leading-none tracking-[0.01em] lg:text-[30px]">
                <Wordmark className="text-[26px] lg:text-[30px]" />
                <span className="text-ink-muted">shopper</span>
              </h1>
              <p className="@container mt-1.5 text-[15px] leading-tight text-ink-muted lg:mt-2 lg:text-[16px]">
                near UW campus
                {/* phones: how avanti uses AI, in this line (a new tab, so the chat stays put);
                    the short label only when "New chat" leaves too little room */}
                <span aria-hidden className="lg:hidden"> · </span>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener"
                  className="relative whitespace-nowrap text-carbon underline decoration-transparent decoration-1 underline-offset-4 transition-colors after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover:decoration-current lg:hidden"
                >
                  <span className="hidden @min-[16.5rem]:inline">How avanti uses AI</span>
                  <span className="@min-[16.5rem]:hidden">How AI is used</span>
                </a>
              </p>
            </div>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener"
              className="hidden min-h-11 items-center px-2 text-[16px] text-ink-muted underline decoration-transparent decoration-1 underline-offset-[6px] transition-[color,text-decoration-color] duration-300 hover:text-ink hover:decoration-current lg:inline-flex"
            >
              How avanti uses AI
            </a>
            <SoundToggle compact />
            {state.feed.length ? (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setDraft("");
                }}
                aria-label="Start a new chat"
                className="group flex h-11 min-w-11 items-center justify-center gap-2 border border-transparent text-carbon transition-colors hover:border-ink/15 lg:px-3"
              >
                <RotateCcw aria-hidden className="size-[18px] transition-transform duration-500 group-hover:-rotate-90" strokeWidth={1.6} />
                <span aria-hidden className="hidden font-display text-[17px] tracking-[0.04em] lg:inline">
                  New chat
                </span>
              </button>
            ) : null}
          </header>

          <div className="flex min-h-0 flex-1">
            {/* The conversation: a reading column; on a laptop the scroll area spans the whole left side. */}
            <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
              <div
                ref={scrollRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
                }}
                className="ask-feed-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 lg:px-12"
              >
                <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
                  {empty ? <EmptyState chips={chips} mode={mode} onPick={submit} /> : null}
                  {/* Always mounted, so screen readers announce the first reply too. */}
                  <div aria-live="polite" aria-busy={state.busy} className={empty ? undefined : "space-y-6 pb-8 pt-5 lg:space-y-8 lg:pb-10 lg:pt-8"}>
                    {visible.map((item) => {
                      const tool = item.kind === "tool" ? renderTool(item) : null;
                      if (item.kind === "tool" && tool === null) return null; // nothing to show (no empty gap)
                      return (
                        // the AI's paper (shops, menus, orders) lines up under its words on a laptop
                        <div key={item.id} className={item.kind === "tool" ? "lg:max-w-[600px] lg:pl-[36px]" : undefined}>
                          {item.kind === "user" ? (
                            <UserBubble text={item.text} />
                          ) : item.kind === "ai" ? (
                            <AiBubble text={item.text} streaming={item.streaming} proactive={item.proactive} />
                          ) : item.kind === "notice" ? (
                            <Notice text={item.text} tone={item.tone} />
                          ) : (
                            tool
                          )}
                        </div>
                      );
                    })}
                    {state.busy && state.status ? <StatusLine text={state.status} /> : null}
                  </div>
                </div>
              </div>

              <footer className="relative z-10 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 lg:px-12 lg:pb-8">
                <div className="mx-auto w-full max-w-[720px]">
                  <Composer value={draft} onChange={setDraft} onSend={submit} busy={state.busy} />
                </div>
              </footer>
            </section>

            {/* Laptop: the order's tray, once the chat has started (hidden on phones, where
                the order stays in the conversation). Before that the welcome sits alone. */}
            {empty ? null : (
              <aside
                ref={trayRef}
                aria-label="Your order"
                className="ask-tray hidden w-[440px] shrink-0 overflow-y-auto px-9 pb-8 pt-3 lg:block xl:w-[480px] xl:px-12"
              >
                <OrderTray
                  view={wide && trayItem ? "order" : "idle"}
                  label={trayErrand ? "Your errand" : "Your order"}
                  dense={Boolean(trayErrand)}
                  cardKey={trayErrand ? trayErrand.responseId : (trayItem?.id ?? null)}
                  card={wide && trayItem ? (trayErrand ? errand(trayErrand) : orderCard(trayItem)) : null}
                />
              </aside>
            )}
          </div>
        </div>
      </OrderReveal>
    </main>
  );
}
