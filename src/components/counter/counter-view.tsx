"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { SoundToggle, Wordmark } from "@/components/brand";
import { Money } from "@/components/common/numbers";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Item, LoyaltyRule } from "@/lib/types";
import type { Dashboard, DashboardOrder } from "@/lib/orders/dashboard";
import { AiLimit } from "./ai-limit";
import { CodePad } from "./code-pad";
import { DoorLog } from "./door-log";
import { InsightsPanel } from "./insights-panel";
import { LoyaltySetting } from "./loyalty-setting";
import { MenuRows } from "./menu-rows";
import { OrderStrip, OrderTicket } from "./order-ticket";
import { useWide } from "./use-wide";

export interface CounterViewProps {
  data: Dashboard;
  fresh: Set<string>;
  busy: string | null;
  simulating: boolean;
  padFor: DashboardOrder | null;
  onPickedUp: (order: DashboardOrder) => void;
  onPadClose: () => void;
  onPadSubmit: (code: string) => Promise<boolean>;
  onNoShow: (order: DashboardOrder) => void;
  onToggleSoldOut: (item: Item, soldOut: boolean) => void;
  /** The owner's per-item "AI can order" switch (absent: shown, read-only). */
  onToggleAiOrderable?: (item: Item, orderable: boolean) => void;
  /** The owner's cap on one AI order, in cents (null = no cap). */
  onAiLimit?: (cents: number | null) => Promise<boolean>;
  /** The stamp card for regulars (null = off; absent: shown read-only). CONTRACTS §17. */
  onLoyalty?: (rule: LoyaltyRule | null) => Promise<boolean>;
  onSimulate: () => void;
  /** Pause or resume all AI orders (absent: the paused state shows without a way back here). */
  onAcceptAi?: (accept: boolean) => void;
  /** The Talk key (voice commands), set beside the sound key. */
  talk?: React.ReactNode;
  /** Which tab opens first (the lab uses it for shots). */
  initialTab?: "orders" | "menu" | "door";
}

const STICKY_MS = 5000; // an order that just changed stays in front long enough to see its seal land

/**
 * Behind the counter (pure view; CounterApp owns the data). One focal point
 * per tab: the newest ticket on the rail · the menu and its switches ·
 * REACHED VISA 0. Laptop: the same three, side by side (orders lead).
 */
export function CounterView({
  data,
  fresh,
  busy,
  simulating,
  padFor,
  onPickedUp,
  onPadClose,
  onPadSubmit,
  onNoShow,
  onToggleSoldOut,
  onToggleAiOrderable,
  onAiLimit,
  onLoyalty,
  onSimulate,
  onAcceptAi,
  talk,
  initialTab = "orders",
}: CounterViewProps) {
  const { shop, items, orders, events, stats } = data;
  const wide = useWide();
  const held = orders.filter((o) => o.status === "held");
  const done = orders.filter((o) => o.status !== "held" && o.status !== "pending");
  const focusId = useFocusedOrder(held, done);
  const [picked, setPicked] = useState<string | null>(null);
  const front = orders.find((o) => o.id === (picked && held.some((h) => h.id === picked) ? picked : focusId)) ?? null;
  const rest = [...held, ...done].filter((o) => o.id !== front?.id);
  const soldOut = items.filter((i) => i.sold_out || i.stock <= 0).length;
  const aiPaused = shop.rules?.accept_ai_orders === false;
  // The shop's printable window sign opens in a new tab.
  const signLink = (
    <a
      href={`/s/${shop.slug}/sign`}
      target="_blank"
      rel="noreferrer"
      className={cn("link-ink", wide ? "text-[19px]!" : "-ml-[0.2rem] text-[17px]!")}
    >
      Print window sign <ArrowRight aria-hidden className={wide ? "size-[18px]" : "size-4"} strokeWidth={1.5} />
    </a>
  );

  const rail = (
    <>
      {/* the rail the tickets hang from: one ink line */}
      <div aria-hidden className="steel-rail -mx-1" />
      <div aria-live="polite" className="lg:mx-auto lg:max-w-[440px]">
        <AnimatePresence initial={false} mode="popLayout">
          {front ? (
            <OrderTicket
              key={front.id}
              order={front}
              fresh={fresh.has(front.id)}
              busy={busy === front.id}
              onPickedUp={() => onPickedUp(front)}
              onNoShow={() => onNoShow(front)}
            />
          ) : null}
        </AnimatePresence>
      </div>
      {front === null ? <EmptyRail /> : null}

      {rest.length ? (
        <section className="mt-12 lg:mx-auto lg:max-w-[440px]" aria-label="Other orders">
          <p className="label-print text-ink-muted">{held.length > 1 ? "Also waiting" : "Earlier"}</p>
          <ul className="mt-4 space-y-3">
            {rest.map((o) => (
              <OrderStrip key={o.id} order={o} onOpen={o.status === "held" ? () => setPicked(o.id) : undefined} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
  const menu = (
    <div className="flex flex-col gap-6">
      <AiLimit rules={shop.rules} busy={busy === "ai-limit"} onChange={onAiLimit} />
      <LoyaltySetting rules={shop.rules} onChange={onLoyalty} />
      <MenuRows items={items} rules={shop.rules} busyId={busy} onToggleSoldOut={onToggleSoldOut} onToggleAiOrderable={onToggleAiOrderable} />
    </div>
  );
  // The door log, then what AI shoppers asked for today (under it on laptop; after it in the phone's tab).
  const door = (
    <>
      <DoorLog stats={stats} events={events} onSimulate={onSimulate} simulating={simulating} />
      <InsightsPanel slug={shop.slug} orders={orders} />
    </>
  );

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-[max(env(safe-area-inset-top),14px)] md:max-w-xl lg:max-w-page lg:px-10 lg:pb-24 lg:pt-7">
      {/* the wordmark home; talk, sound and the shop's pages on the right (the voice slip drops from here) */}
      <div className="relative flex items-center justify-between gap-4">
        <Link href="/" aria-label="avanti, home" className="py-2 pr-3 transition-opacity hover:opacity-70">
          <Wordmark className="text-[25px] lg:text-[30px]" />
        </Link>
        <div className="flex items-center gap-2 lg:gap-7">
          {wide ? (
            <>
              <a href={`/s/${shop.slug}`} target="_blank" rel="noreferrer" className="link-ink text-[19px]!">
                Shop page <ArrowUpRight aria-hidden className="size-[18px]" strokeWidth={1.5} />
              </a>
              {signLink}
            </>
          ) : null}
          {/* the keys sit at the far right, clear of the top-centre toasts */}
          <div className="flex items-center gap-2">
            {talk}
            <SoundToggle
              compact={!wide}
              className="rounded-none border border-ink/15 font-sans text-[13px] font-semibold tracking-[0.12em] hover:border-ink/35 aria-pressed:border-carbon aria-pressed:bg-carbon"
            />
          </div>
        </div>
      </div>

      <header className="mt-6 flex flex-col gap-4 lg:mt-10 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className={cn("label-print inline-flex items-center gap-2", shop.open ? "text-carbon" : "text-ink-muted")}>
              <span aria-hidden className={cn("size-2", shop.open ? "bg-carbon" : "border border-ink-muted")} />
              {shop.open ? "Open" : "Closed"}
            </span>
            {shop.is_demo ? <span className="label-print text-ink-muted">Demo shop</span> : null}
            {aiPaused ? (
              <span className="inline-flex items-center gap-3">
                <span className="label-print text-ink">AI orders paused</span>
                {onAcceptAi ? (
                  <button
                    type="button"
                    onClick={() => onAcceptAi(true)}
                    className="-my-3 min-h-11 px-1 text-[15px] font-semibold text-carbon underline decoration-1 underline-offset-4 transition-opacity hover:opacity-75"
                  >
                    Resume
                  </button>
                ) : null}
              </span>
            ) : null}
          </p>
          <h1 className="mt-2 line-clamp-2 font-display text-[38px] leading-[1.06] text-balance lg:mt-3 lg:text-[58px] lg:leading-[1.02]">
            {shop.name}
          </h1>
        </div>
        {wide ? (
          <Totals held={stats.held_cents} paid={stats.paid_cents} />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <p className="text-[16px] text-ink-muted">
              <Money cents={stats.held_cents} className="font-mono font-medium text-ink" /> on hold ·{" "}
              <Money cents={stats.paid_cents} className="font-mono font-medium text-ink" /> charged
            </p>
            {signLink}
          </div>
        )}
      </header>

      {wide ? (
        // Laptop: a dashboard. Orders lead; menu stock and the door log beside them
        // (stacked on the right below 1280 px, three columns from there).
        <div className="mt-12 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-x-14 gap-y-16 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] xl:gap-x-12">
          <section aria-labelledby="counter-orders" className="row-span-2 xl:row-span-1">
            <ColumnHead id="counter-orders" title="Orders" note={held.length ? `${held.length} waiting` : "none waiting"} />
            <div className="mt-10">{rail}</div>
          </section>
          <section aria-labelledby="counter-menu">
            <ColumnHead
              id="counter-menu"
              title="Menu"
              note={items.length ? `${items.length} ${items.length === 1 ? "item" : "items"}${soldOut ? ` · ${soldOut} sold out` : ""}` : null}
            />
            <div className="mt-8">{menu}</div>
          </section>
          <section aria-labelledby="counter-door">
            <ColumnHead id="counter-door" title="Door log" />
            <div className="mt-8">{door}</div>
          </section>
        </div>
      ) : (
        <TabsPrimitive.Root defaultValue={initialTab} className="mt-7">
          <TabsPrimitive.List aria-label="Counter" className="grid grid-cols-3 border-b border-ink/15">
            <CounterTab value="orders">Orders{held.length ? ` · ${held.length}` : ""}</CounterTab>
            <CounterTab value="menu">Menu</CounterTab>
            <CounterTab value="door">Door log</CounterTab>
          </TabsPrimitive.List>

          <TabsPrimitive.Content value="orders" className="mt-9 outline-none">
            {rail}
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="menu" className="mt-8 outline-none">
            {menu}
          </TabsPrimitive.Content>

          <TabsPrimitive.Content value="door" className="mt-8 outline-none">
            {door}
          </TabsPrimitive.Content>
        </TabsPrimitive.Root>
      )}

      <CodePad
        open={padFor !== null}
        onOpenChange={(o) => !o && onPadClose()}
        title={padFor ? `${padFor.qty > 1 ? `${padFor.qty}× ` : ""}${padFor.item_name} · ${formatCents(padFor.amount_cents)}` : ""}
        onSubmit={onPadSubmit}
      />
    </main>
  );
}

/** Laptop: the day's totals, set large in the header (the phone has them as one line). */
function Totals({ held, paid }: { held: number; paid: number }) {
  return (
    <dl className="flex shrink-0 items-end gap-12 pb-1.5">
      <div>
        <dt className="label-print text-ink-muted">On hold</dt>
        <dd className="mt-2">
          <Money cents={held} className="font-figures text-[40px] leading-none" />
        </dd>
      </div>
      <div>
        <dt className="label-print text-ink-muted">Charged</dt>
        <dd className="mt-2">
          <Money cents={paid} className="font-figures text-[40px] leading-none" />
        </dd>
      </div>
    </dl>
  );
}

/** Laptop: each dashboard column is headed like the phone's tab, over one hairline. */
function ColumnHead({ id, title, note }: { id: string; title: string; note?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink/15 pb-3">
      <h2 id={id} className="font-display text-[26px] leading-none">
        {title}
      </h2>
      {note ? <span className="text-[16px] text-ink-muted">{note}</span> : null}
    </div>
  );
}

/** A tab: the active one is set in ink with a teal rule under it. */
function CounterTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="relative -mb-px h-12 border-b-2 border-transparent px-1 font-display text-[19px] text-ink-muted transition-colors duration-300 hover:text-ink data-[state=active]:border-carbon data-[state=active]:text-ink"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

/**
 * Which ticket hangs in front: the newest held order, unless an order just
 * changed status (its PAID / RELEASED seal should land where you're looking).
 */
function useFocusedOrder(held: DashboardOrder[], done: DashboardOrder[]): string | null {
  const all = [...held, ...done];
  const key = all.map((o) => `${o.id}:${o.status}`).join("|");
  const statuses = useRef(new Map<string, string>());
  const [sticky, setSticky] = useState<string | null>(null);

  useEffect(() => {
    const prev = statuses.current;
    const now = key ? key.split("|").map((s) => s.split(":") as [string, string]) : [];
    const changed = prev.size ? now.find(([id, status]) => prev.has(id) && prev.get(id) !== status) : undefined;
    statuses.current = new Map(now);
    // A status change is an event the owner just caused: keep that ticket in front.
    if (changed) setSticky(changed[0]);
  }, [key]);

  useEffect(() => {
    if (!sticky) return;
    const t = setTimeout(() => setSticky(null), STICKY_MS);
    return () => clearTimeout(t);
  }, [sticky]);

  if (sticky && all.some((o) => o.id === sticky)) return sticky;
  return held[0]?.id ?? done[0]?.id ?? null;
}

/** Nothing on the rail yet: a blank slip waits in the clip. */
function EmptyRail() {
  return (
    <div className="relative mx-1 lg:mx-auto lg:max-w-[440px]">
      <span aria-hidden className="steel-clip absolute -top-[13px] left-1/2 z-10 -translate-x-1/2" />
      <div className="paper px-7 pb-11 pt-12 text-center">
        <p className="font-display text-[30px] leading-[1.1]">No orders yet</p>
        <p className="mx-auto mt-3 max-w-[30ch] text-[16px] leading-relaxed text-ink-muted">
          When an AI shopper orders, the ticket clips on here.
        </p>
      </div>
    </div>
  );
}
