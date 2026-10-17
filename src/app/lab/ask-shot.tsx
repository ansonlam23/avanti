"use client";

// Design lab ONLY: the real /ask pieces with sample data, so the chat's
// look can be checked and filmed without Gemini. Never used by the product.

import { useEffect, useRef, useState } from "react";
import { AiMark } from "@/components/ask/ai-mark";
import { AiBubble, StatusLine, UserBubble } from "@/components/ask/bubbles";
import { Composer } from "@/components/ask/composer";
import { MenuCard } from "@/components/ask/menu-card";
import { OrderCard } from "@/components/ask/order-card";
import { SearchResults } from "@/components/ask/shop-cards";
import { newProposal } from "@/components/ask/state";
import type { ItemSummary, MenuResult, OrderProposal, SearchShopsResult, ShopSummary } from "@/lib/ai/shopper-types";
import type { PublicOrder } from "@/lib/types";
import "@/components/ask/ask.css";

const SHOP: ShopSummary = {
  slug: "mais-bakery",
  name: "Mai's Bakery",
  tagline: null,
  is_demo: true,
  photo_url: null,
  location_label: "University Way NE",
  walk_minutes: 4,
  pickup_window: { start: "08:00", end: "18:00" },
  pickup_open_now: true,
  earliest_pickup: "3:40 PM",
  accepts_ai_orders: true,
  max_per_order: 2,
};

const item = (id: string, name: string, price: number | null, stock: number, tags: string[] = []): ItemSummary => ({
  id,
  name,
  name_en: null,
  description: null,
  price_cents: price,
  tags,
  stock,
  sold_out: false,
  available: price !== null && stock > 0,
});

const CAKE = item("cake", "Chocolate cake", 1800, 2, ["nut-free"]);

export const SEARCH: SearchShopsResult = {
  ok: true,
  query: "birthday cake",
  needed_by: "6 PM",
  shopper_location: "UW campus",
  shops: [{ ...SHOP, ready_by_needed: true, matches: [CAKE, item("tart", "Lemon tart", 650, 0)], more_matches: 1 }],
  other_open_shops: [],
};

export const MENU_RESULT: MenuResult = {
  ok: true,
  shop: { ...SHOP, open: true, notes: null },
  items: [CAKE, item("croissant", "Croissant", 450, 9, ["contains-dairy"]), item("loaf", "Round loaf", null, 3)],
};

export const PROPOSAL: OrderProposal = {
  shop_slug: SHOP.slug,
  shop_name: SHOP.name,
  is_demo: true,
  location_label: SHOP.location_label,
  walk_minutes: 4,
  item_id: "cake",
  item_name: "Chocolate cake",
  item_name_en: null,
  qty: 1,
  unit_price_cents: 1800,
  amount_cents: 1800,
  currency: "USD",
  pickup_time: "2026-10-17T00:30:00.000Z",
  pickup_label: "5:30 PM",
  stock_left: 2,
  max_per_order: 2,
};

export const HELD_ORDER: PublicOrder = {
  id: "7f3c9a1e-55b2-4d1a-9c0e-2b8f61d0a4c3",
  status: "held",
  qty: 1,
  amount_cents: 1800,
  currency: "USD",
  pickup_time: "2026-10-17T00:30:00.000Z",
  pickup_code: "4821",
  payment_mode: "sandbox",
  card_last4: "1111",
  created_at: "2026-10-16T23:50:00.000Z",
  item_name: "Chocolate cake",
  shop_name: "Mai's Bakery",
  shop_slug: "mais-bakery",
};

const noop = () => {};

/** A whole chat, as it reads after an order: the feed, then the composer. */
export function AskShot({ stage }: { stage: "results" | "order" | "held" }) {
  const [draft, setDraft] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);
  // like the real chat: follow the conversation to its newest item
  useEffect(() => {
    const t = setTimeout(() => {
      const el = feedRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 400);
    return () => clearTimeout(t);
  }, []);
  const state = { ...newProposal("lab"), status: stage === "held" ? ("held" as const) : ("ready" as const), orderId: stage === "held" ? HELD_ORDER.id : null };
  return (
    <main className="ask-app mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-counter">
      <header className="flex items-center gap-3 pb-3 pl-5 pr-3 pt-4">
        <AiMark size={26} state="listening" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-extrabold uppercase leading-none">Open Sign Shopper</h1>
          <p className="mt-0.5 text-[14px] leading-tight text-ink-muted">near UW campus</p>
        </div>
      </header>
      <div ref={feedRef} className="ask-feed-fade min-h-0 flex-1 overflow-y-auto px-5">
        <div className="space-y-5 pb-6 pt-5">
          <UserBubble text="Birthday cake near campus by 6, no nuts" />
          {stage === "results" ? (
            <>
              <SearchResults result={SEARCH} gone={{}} mine={[]} />
              <AiBubble
                text="Mai's Bakery (4 min walk) has a chocolate cake, nut-free per the shop. $18. Want me to hold one for 5:30?"
                streaming={false}
                proactive={false}
              />
              <StatusLine text="Reading Mai's Bakery's menu…" />
            </>
          ) : (
            <>
              <MenuCard result={MENU_RESULT} gone={{}} highlightId="cake" />
              <AiBubble text="Here's the order. Tap to hold it on your card; you pay at pickup." streaming={false} proactive={false} />
              <OrderCard
                proposal={PROPOSAL}
                state={state}
                order={stage === "held" ? HELD_ORDER : null}
                name="Jordan"
                onName={noop}
                onConfirm={noop}
                mode="sandbox"
              />
            </>
          )}
        </div>
      </div>
      <footer className="px-4 pb-3 pt-2">
        <Composer value={draft} onChange={setDraft} onSend={noop} busy={false} />
      </footer>
    </main>
  );
}
