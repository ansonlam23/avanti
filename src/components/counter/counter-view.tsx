"use client";

import { ArrowUpRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { OpenSign, SoundToggle } from "@/components/brand";
import { Money } from "@/components/common/numbers";
import { formatCents } from "@/lib/format";
import type { Item } from "@/lib/types";
import type { Dashboard, DashboardOrder } from "@/lib/orders/dashboard";
import { CodePad } from "./code-pad";
import { DoorLog } from "./door-log";
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
  onSimulate: () => void;
  /** Which tab opens first (the lab uses it for shots). */
  initialTab?: "orders" | "menu" | "door";
}

const STICKY_MS = 5000; // an order that just changed stays in front long enough to see its stamp land

/**
 * Behind the counter (pure view; CounterApp owns the data). One focal point
 * per tab: the newest ticket on the rail · the menu slip · REACHED VISA 0.
 * Laptop: the same three, side by side as a dashboard (orders lead).
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
  onSimulate,
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

  const rail = (
    <>
      {/* the rail the tickets hang from */}
      <div aria-hidden className="steel-rail -mx-2" />
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
  const menu = <MenuRows items={items} busyId={busy} onToggleSoldOut={onToggleSoldOut} />;
  const door = <DoorLog stats={stats} events={events} onSimulate={onSimulate} simulating={simulating} />;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-[max(env(safe-area-inset-top),20px)] md:max-w-xl lg:max-w-page lg:px-10 lg:pb-24 lg:pt-8">
      <header className="flex items-center gap-3 lg:gap-5">
        <OpenSign size="sm" mount="bare" state={shop.open ? "on" : "off"} sound={false} />
        <h1 className="thermal line-clamp-2 min-w-0 flex-1 font-display text-[30px] font-extrabold uppercase leading-[0.95] text-balance lg:flex-none lg:text-[46px] lg:leading-[0.92]">
          {shop.name}
        </h1>
        {shop.is_demo ? <span className="label-print rounded-[2px] border-[1.5px] border-ink/60 px-1.5 text-ink-muted">Demo</span> : null}
        {wide ? <Totals held={stats.held_cents} paid={stats.paid_cents} /> : null}
        <SoundToggle compact />
        {wide ? (
          <a href={`/s/${shop.slug}`} target="_blank" rel="noreferrer" className="btn-quiet -mr-3">
            Shop page <ArrowUpRight aria-hidden className="size-4" />
          </a>
        ) : null}
      </header>
      {wide ? null : (
        <p className="mt-3 text-[14px] text-ink-muted">
          <Money cents={stats.held_cents} className="font-bold text-ink" /> on hold ·{" "}
          <Money cents={stats.paid_cents} className="font-bold text-ink" /> charged
        </p>
      )}

      {wide ? (
        // Laptop: a dashboard. Orders lead; menu stock and the door log beside them
        // (stacked on the right below 1280 px, three columns from there).
        <div className="mt-12 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-x-14 gap-y-16 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] xl:gap-x-12">
          <section aria-labelledby="counter-orders" className="row-span-2 xl:row-span-1">
            <ColumnHead id="counter-orders" title="Orders" note={held.length ? `${held.length} waiting` : "none waiting"} />
            <div className="mt-12">{rail}</div>
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
        <TabsPrimitive.Root defaultValue={initialTab} className="mt-6">
          <TabsPrimitive.List aria-label="Counter" className="grid grid-cols-3 border-b-2 border-ink/80">
            <CounterTab value="orders">Orders{held.length ? ` · ${held.length}` : ""}</CounterTab>
            <CounterTab value="menu">Menu</CounterTab>
            <CounterTab value="door">Door log</CounterTab>
          </TabsPrimitive.List>

          <TabsPrimitive.Content value="orders" className="mt-8 outline-none">
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

/** Laptop: the day's totals, printed big in the header (the phone has them as one line). */
function Totals({ held, paid }: { held: number; paid: number }) {
  return (
    <dl className="ml-auto flex items-end gap-9 pr-2">
      <div>
        <dt className="label-print text-ink-muted">On hold</dt>
        <dd className="mt-1">
          <Money cents={held} className="font-display text-[34px] font-extrabold leading-none" />
        </dd>
      </div>
      <div>
        <dt className="label-print text-ink-muted">Charged</dt>
        <dd className="mt-1">
          <Money cents={paid} className="font-display text-[34px] font-extrabold leading-none" />
        </dd>
      </div>
    </dl>
  );
}

/** Laptop: each dashboard column is headed like the phone's tab, over a printed dashed rule. */
function ColumnHead({ id, title, note }: { id: string; title: string; note?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pb-3 [border-bottom:1.5px_dashed_rgb(22_22_22/0.3)]">
      <h2 id={id} className="font-display text-[24px] font-extrabold uppercase leading-none tracking-[0.03em]">
        {title}
      </h2>
      {note ? <span className="text-[15px] text-ink-muted">{note}</span> : null}
    </div>
  );
}

/** A printed tab: the active one is inked and underlined with a heavy rule. */
function CounterTab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="relative -mb-[2px] h-12 border-b-4 border-transparent px-1 font-display text-[19px] font-extrabold uppercase tracking-[0.03em] text-ink-muted transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

/**
 * Which ticket hangs in front: the newest held order, unless an order just
 * changed status (its PAID / RELEASED stamp should land where you're looking).
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

/** Nothing on the rail yet: a blank page of the order pad waits in the clip. */
function EmptyRail() {
  return (
    <div className="relative mx-1 lg:mx-auto lg:max-w-[440px]">
      <span aria-hidden className="steel-clip absolute -top-[17px] left-1/2 z-10 -translate-x-1/2" />
      <div className="pad edge-perf-top px-6 pb-10 pt-12 text-center shadow-slip" style={{ rotate: "-0.6deg" }}>
        <p className="font-display text-[30px] font-extrabold uppercase leading-none">No orders yet</p>
        <p className="mx-auto mt-3 max-w-[28ch] text-[15px] leading-relaxed text-ink-muted lg:text-[16px]">
          When an AI shopper orders, the ticket clips on here.
        </p>
        {/* the blank pad's printed rules */}
        <div aria-hidden className="mx-auto mt-8 max-w-[300px] space-y-5">
          <div className="border-t-2 border-pad-line" />
          <div className="border-t-2 border-pad-line" />
          <div className="border-t-2 border-pad-line" />
        </div>
      </div>
    </div>
  );
}
