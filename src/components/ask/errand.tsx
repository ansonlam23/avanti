"use client";

import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { SimulatedBadge, Stamp } from "@/components/brand";
import { Money } from "@/components/common/numbers";
import { SHOPPER_LOCATION } from "@/lib/ai/tools/geo";
import { planRoute, type Spot } from "@/lib/errand/route";
import { layoutSpots } from "@/lib/errand/schematic";
import { formatCents } from "@/lib/format";
import type { PaymentMode, PublicOrder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Arrow } from "./arrow";
import {
  confirmAllOf,
  confirmable,
  errandStops,
  errandTotals,
  errandView,
  type CardGroup,
  type CardRef,
  type ErrandStop,
} from "./errand-model";
import { RISE } from "./ink";
import type { Batch, ProposalState } from "./state";
import { useSpots } from "./use-spots";

// An errand: one reply that found each thing at a different small shop. A stack
// of compact order cards with ONE primary action, "Confirm all · $X held", which
// places every hold through the same signed path as each card's own button.
// Then the summary: each shop, what's waiting, its pickup code, the total held,
// and the walk from UW campus through the shops in a sensible order.

/** Small tracked caps, the slips' own labels (Red Hat Text 600, ≥ 13px). */
const LABEL = "text-[13px] font-semibold uppercase leading-tight tracking-[0.13em]";

export interface ErrandProps {
  group: CardGroup;
  proposals: Record<string, ProposalState>;
  orders: Record<string, PublicOrder>;
  batch: Batch | null;
  name: string;
  onName: (v: string) => void;
  onConfirm: (card: CardRef) => void;
  onConfirmAll: (ids: string[]) => void;
  mode: PaymentMode | null;
}

export function Errand(props: ErrandProps) {
  const { group, proposals, batch } = props;
  const running = batch?.responseId === group.responseId;
  const view = errandView(group, proposals, running);
  // The summary scrolls into view only when it takes over from the cards here, never on a remount.
  const [prevView, setPrevView] = useState(view);
  const [arrive, setArrive] = useState(false);
  if (prevView !== view) {
    setPrevView(view);
    setArrive(prevView === "cards" && view === "summary");
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      {view === "summary" ? (
        <motion.div key="summary" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: RISE }}>
          <ErrandSummary group={group} proposals={proposals} orders={props.orders} arrive={arrive} />
        </motion.div>
      ) : (
        <motion.div key="cards" exit={{ opacity: 0, y: -8, transition: { duration: 0.25 } }}>
          <ErrandStack {...props} running={running} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── The stack + Confirm all ─────────────────────────────────────────────

function ErrandStack({
  group,
  proposals,
  orders,
  batch,
  name,
  onName,
  onConfirm,
  onConfirmAll,
  mode,
  running,
}: ErrandProps & { running: boolean }) {
  const all = confirmAllOf(group, proposals);
  const open = all.ids.length;
  const queue = running && batch ? batch.cards : [];
  const step = running && batch?.current ? queue.indexOf(batch.current) + 1 : 0;
  // While Confirm all runs, the total stays what was tapped (the cards' own prices, from the DB).
  const totalCents = running
    ? group.cards.filter((c) => queue.includes(c.id)).reduce((sum, c) => sum + c.proposal.amount_cents, 0)
    : all.totalCents;
  const count = running ? queue.length : open;
  const shops = new Set(group.cards.map((c) => c.proposal.shop_slug)).size;

  // Keep the card being placed in view (on a laptop, above the footer that rides over the stack).
  const stackRef = useRef<HTMLElement>(null);
  const current = running ? (batch?.current ?? null) : null;
  useEffect(() => {
    if (!current) return;
    const el = stackRef.current?.querySelector<HTMLElement>(`[data-card="${current}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [current]);

  return (
    <section
      ref={stackRef}
      aria-label={`Errand: ${group.cards.length} things from ${shops} ${shops === 1 ? "shop" : "shops"}`}
      className="space-y-3"
    >
      {group.cards.map((card, i) => (
        <motion.div
          key={card.id}
          data-card={card.id}
          className="ask-errand-card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: RISE, delay: i * 0.08 }}
        >
          <ErrandCard
            card={card}
            state={proposals[card.id]}
            order={proposals[card.id]?.orderId ? (orders[proposals[card.id].orderId as string] ?? null) : null}
            locked={running}
            waiting={running && queue.includes(card.id) && batch?.current !== card.id && confirmable(proposals[card.id])}
            onConfirm={() => onConfirm(card)}
          />
        </motion.div>
      ))}

      {open >= 2 || running ? (
        // On a laptop the footer stays in view at the foot of the order column.
        <div className="ask-slip ask-errand-foot px-6 pb-5 pt-5 lg:px-7">
          <div className="flex items-end justify-between gap-3">
            <span className="flex flex-col items-start gap-2 pb-1">
              <span className={cn(LABEL, "text-ink-muted")}>Hold · {count} orders</span>
              {mode === "simulated" ? <SimulatedBadge /> : null}
            </span>
            <Money cents={totalCents} className="font-figures text-[46px] font-normal leading-[0.9] text-ink" />
          </div>
          <NameField name={name} onName={onName} disabled={running} />
          <button
            type="button"
            onClick={() => onConfirmAll(all.ids)}
            disabled={running}
            aria-busy={running}
            className="ask-btn mt-4 w-full lg:min-h-[60px] lg:text-[21px]"
          >
            {running ? `Holding ${Math.max(1, step)} of ${queue.length}…` : `Confirm all · ${formatCents(totalCents)} held`}
          </button>
          {running ? <div aria-hidden className="ask-working" /> : null}
          <p className="mt-3 text-center text-[15px] leading-snug text-ink-muted">Test card ···· 1111 · held, not charged, until pickup</p>
        </div>
      ) : open === 1 ? (
        // one card left: it has its own button; the name still goes with it
        <div className="px-1">
          <NameField name={name} onName={onName} disabled={false} />
        </div>
      ) : null}
    </section>
  );
}

/** "Name for pickup" on one row: the label, then the field. */
function NameField({ name, onName, disabled }: { name: string; onName: (v: string) => void; disabled: boolean }) {
  return (
    <label className="mt-4 flex items-center gap-4">
      <span className={cn(LABEL, "shrink-0 text-ink-muted")}>Name for pickup</span>
      <input
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="Your name"
        maxLength={60}
        autoComplete="given-name"
        enterKeyHint="done"
        disabled={disabled}
        className="ask-field min-w-0 flex-1"
      />
    </label>
  );
}

/** One thing on the errand: compact, with its own (secondary) Confirm & hold. */
function ErrandCard({
  card,
  state,
  order,
  locked,
  waiting,
  onConfirm,
}: {
  card: CardRef;
  state: ProposalState | undefined;
  order: PublicOrder | null;
  locked: boolean;
  waiting: boolean;
  onConfirm: () => void;
}) {
  const p = card.proposal;
  if (!state) return null;
  const amount = formatCents(p.amount_cents);
  const stale = state.status === "sold_out" || state.status === "replaced";
  const held = state.status === "held" && order !== null;
  const pending = state.status === "pending";
  const failed = state.status === "failed";
  const final = failed && state.error !== null && !state.error.retry;
  const meta = [
    p.walk_minutes !== null ? `${p.walk_minutes} min walk` : null,
    `pickup ${p.pickup_label}`,
    p.is_demo ? "demo shop" : null,
  ].filter(Boolean);

  return (
    <article
      aria-label={`${p.qty} ${p.item_name} from ${p.shop_name}, ${amount}`}
      className={cn("ask-slip px-5 pb-2 pt-4 lg:px-6", state.status === "replaced" && "opacity-75")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={cn("font-display text-[24px] font-normal leading-[1.1]", stale ? "text-ink-muted" : "text-ink")}>{p.shop_name}</h3>
          <p className="mt-1 text-[15px] text-ink-muted lg:text-[16px]">{meta.join(" · ")}</p>
        </div>
        {state.status === "sold_out" ? (
          <Stamp kind="RELEASED" text="Sold out" size="sm" sound={false} className="mt-1 shrink-0" />
        ) : null}
      </div>
      <p className={cn("mt-2.5 flex items-baseline gap-2 text-[16px] lg:text-[17px]", stale && "text-ink-muted")}>
        <span className={cn("min-w-0", stale && "line-through decoration-ink/50 decoration-1")}>
          {p.qty}× {p.item_name}
          {p.item_name_en ? <span className="text-ink-muted"> · {p.item_name_en}</span> : null}
        </span>
        <span aria-hidden className="leader min-w-0!" />
        <span className={cn("shrink-0 font-mono text-[15px] tabular-nums lg:text-[16px]", stale && "line-through decoration-ink/50 decoration-1")}>
          {amount}
        </span>
      </p>

      {stale ? (
        <p className="flex min-h-11 items-center pb-1 text-[15px] leading-snug lg:text-[16px]">
          {state.status === "sold_out" ? (
            <span>
              {p.shop_name} just sold out. <span className="text-ink-muted">Nothing was ordered or charged.</span>
            </span>
          ) : (
            <span className="text-ink-muted">Replaced by a newer card. Not ordered.</span>
          )}
        </p>
      ) : held && order ? (
        <div className="flex min-h-12 items-center justify-between gap-3 pb-1.5 pt-0.5">
          <Stamp kind="HELD" size="sm" animate className="shrink-0" />
          <p className="flex items-center gap-3">
            <span className={cn(LABEL, "text-ink-muted")}>Pickup code</span>
            <span className="font-mono text-[26px] leading-none tracking-[0.08em] text-ink">{order.pickup_code}</span>
          </p>
        </div>
      ) : final && state.error ? (
        <p role="alert" className="mb-2.5 mt-2.5 border-l-2 border-stamp py-1 pl-3.5 text-[15px] leading-snug text-ink lg:text-[16px]">
          {state.error.message}
        </p>
      ) : pending ? (
        <div className="pb-1">
          <p className="flex min-h-11 items-center text-[16px] text-ink-muted" role="status">
            {state.stage === "visa" ? "Asking Visa for a hold…" : "Signing your order…"}
          </p>
          <div aria-hidden className="ask-working" />
        </div>
      ) : waiting ? (
        <p className="flex min-h-11 items-center pb-1 text-[16px] text-ink-muted">Next in line…</p>
      ) : (
        <div>
          <button type="button" onClick={onConfirm} disabled={locked} className="ask-link disabled:opacity-45">
            {failed ? `Try again · hold ${amount}` : `Confirm & hold ${amount}`}
            <Arrow />
          </button>
          {failed && state.error ? (
            <p role="alert" className="pb-2 text-[15px] font-semibold leading-snug text-stamp-deep lg:text-[16px]">
              {state.error.message}
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

// ── The summary: shops, codes, total, the walk ───────────────────────────

const ORDER_WORD: Record<PublicOrder["status"], string> = {
  pending: "Placing…",
  held: "",
  paid: "Picked up",
  released: "Released",
  failed: "Not placed",
};

function ErrandSummary({
  group,
  proposals,
  orders,
  arrive,
}: {
  group: CardGroup;
  proposals: Record<string, ProposalState>;
  orders: Record<string, PublicOrder>;
  /** It just replaced the cards: bring its top into view (the order column, or the chat on a phone). */
  arrive: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!arrive) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    // only on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { stops, missed } = errandStops(group, proposals, orders);
  const spots = useSpots(stops.map((s) => s.id));
  const route = planRoute(stops.map((s) => ({ ...s, spot: spots?.[s.id] ?? null })));
  // Until the shops' spots arrive: nearest first by the walk the cards already showed.
  const shown = spots
    ? route
    : {
        stops: [...stops].sort((a, b) => (walkOf(a) ?? 999) - (walkOf(b) ?? 999)),
        legs: stops.map(() => null),
        totalMinutes: null,
      };
  const placed = stops.flatMap((s) => s.lines.map((l) => l.order));
  const totals = errandTotals(placed);
  const simulated = placed.some((o) => o.payment_mode === "simulated");
  const pickups = new Set(placed.length ? stops.flatMap((s) => s.lines.map((l) => l.proposal.pickup_label)) : []);
  const onePickup = pickups.size === 1 ? [...pickups][0] : null;
  const sub = [
    `${stops.length} ${stops.length === 1 ? "shop" : "shops"}`,
    shown.totalMinutes !== null ? `${shown.totalMinutes} min walk` : null,
    onePickup ? `pickup ${onePickup}` : null,
  ].filter(Boolean);
  const big =
    totals.heldCents > 0
      ? { cents: totals.heldCents, label: simulated ? "Held" : "Held on Visa", seal: "HELD" as const }
      : totals.paidCents > 0
        ? { cents: totals.paidCents, label: "Charged at pickup", seal: "PAID" as const }
        : { cents: totals.releasedCents, label: "Released · not charged", seal: "RELEASED" as const };

  return (
    <article ref={ref} aria-label="Your errand: holds and walking route" className="ask-slip ask-errand-summary px-6 pb-6 pt-6 lg:px-7">
      <h3 className="font-display text-[30px] font-normal leading-[1.08] text-ink">
        {placed.length >= 2 ? `${countWord(placed.length)} holds, one walk` : "Your errand"}
      </h3>
      <p className="mt-1.5 text-[15px] text-ink-muted lg:text-[16px]">{sub.join(" · ")}</p>

      <div aria-hidden className="ask-rule mb-3 mt-4" />
      {spots && shown.stops.some((s) => spots[s.id]) ? (
        <RouteSketch stops={shown.stops.map((s, i) => ({ n: i + 1, spot: spots[s.id] ?? null }))} />
      ) : null}

      <div className="flex items-baseline justify-between gap-3 pb-2">
        <span className={cn(LABEL, "text-ink-muted")}>Walk</span>
        <span className={cn(LABEL, "text-ink-muted")}>Pickup code</span>
      </div>
      <ol className="ask-walk" aria-label="Walking route">
        <li className="ask-walk-stop">
          <span aria-hidden className="ask-pin ask-pin-origin" />
          <span className="text-[16px] text-ink lg:text-[17px]">{SHOPPER_LOCATION.label}</span>
        </li>
        {shown.stops.map((stop, i) => (
          <Fragment key={stop.id}>
            <li className="ask-walk-leg">
              {shown.legs[i] !== null ? `${shown.legs[i]} min` : "—"}
              <span className="sr-only"> walk to {stop.shopName}</span>
            </li>
            <li className="ask-walk-stop">
              <span aria-hidden className="ask-pin">
                {i + 1}
              </span>
              <StopLines stop={stop} onePickup={onePickup !== null} />
            </li>
          </Fragment>
        ))}
      </ol>

      {missed.length ? (
        <ul className="mt-4 space-y-2 border-t border-dotted border-ink/35 pt-3.5">
          {missed.map((c) => (
            <li key={c.id} className="text-[15px] leading-snug lg:text-[16px]">
              <span className="block text-ink-muted line-through decoration-ink/50 decoration-1">
                {c.proposal.qty}× {c.proposal.item_name} · {c.proposal.shop_name}
              </span>
              <span className="block font-semibold text-stamp-deep">{missedWhy(proposals[c.id])}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div aria-hidden className="print-rule mb-4 mt-5" />
      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col items-start gap-2.5">
          <span className={cn(LABEL, "text-ink-muted")}>{big.label}</span>
          <span className="flex items-center gap-3">
            <Stamp kind={big.seal} size="md" animate sound={false} />
            {simulated ? <SimulatedBadge /> : null}
          </span>
        </span>
        <Money cents={big.cents} className="font-figures text-[50px] font-normal leading-[0.9] text-ink" />
      </div>

      <div className="mt-5 flex items-center gap-4 border-t border-ink/15 pt-4">
        <Stamp kind="VERIFIED" size="sm" sound={false} className="shrink-0" />
        <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">Signed by avanti shopper, each checked before Visa.</p>
      </div>
      <p className="mt-3 text-[15px] leading-snug text-ink-muted">
        {simulated ? "Test card ···· 1111 · no Visa call · no money moved" : "Test card ···· 1111 · Visa sandbox · no money moved"}
      </p>
      <p className="sr-only" aria-live="polite">
        {`${placed.length} ${placed.length === 1 ? "hold" : "holds"}: ${formatCents(big.cents)} ${big.label.toLowerCase()}.`}
      </p>
    </article>
  );
}

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
/** Small counts in words for the title ("Three holds"); Marcellus sets words better than figures. */
function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

function walkOf(stop: ErrandStop): number | null {
  return stop.lines[0]?.proposal.walk_minutes ?? null;
}

function StopLines({ stop, onePickup }: { stop: ErrandStop; onePickup: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <h4 className="font-display text-[22px] font-normal leading-[1.15] text-ink">
        {stop.shopName}
        {stop.isDemo ? <span className="sr-only"> (demo shop)</span> : null}
      </h4>
      {stop.lines.map((line) => {
        const o = line.order;
        const word = ORDER_WORD[o.status];
        return (
          <div key={line.cardId} className="mt-0.5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-[15px] leading-snug text-ink-muted lg:text-[16px]">
              {line.proposal.qty}× {line.proposal.item_name}
              {line.proposal.item_name_en ? ` (${line.proposal.item_name_en})` : ""} · {formatCents(o.amount_cents)}
              {onePickup ? "" : ` · ${line.proposal.pickup_label}`}
            </p>
            {o.status === "held" ? (
              <span className="shrink-0 font-mono text-[24px] leading-none tracking-[0.08em] text-ink">
                <span className="sr-only">pickup code </span>
                {o.pickup_code}
              </span>
            ) : (
              <span className="shrink-0 text-[15px] font-semibold text-ink lg:text-[16px]">{word}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function missedWhy(ps: ProposalState | undefined): string {
  if (!ps) return "Not ordered.";
  if (ps.status === "sold_out") return "Just sold out. Nothing held.";
  if (ps.status === "replaced") return "Replaced. Not ordered.";
  if (ps.status === "failed" && ps.error?.message) return ps.error.message;
  return "Not ordered.";
}

/** The walk as a small sketch: UW campus, then numbered pins in walking order. North is up; not to scale. */
function RouteSketch({ stops }: { stops: Array<{ n: number; spot: Spot | null }> }) {
  const W = 330;
  const H = 150;
  const placed = stops.filter((s): s is { n: number; spot: Spot } => s.spot !== null);
  const pts = layoutSpots([SHOPPER_LOCATION, ...placed.map((s) => s.spot)], { width: W, height: H, pad: 24 }, 34);
  const [origin, ...pins] = pts;
  if (!origin) return null;
  const labelBelow = origin.y < H / 2;
  const anchor = origin.x > W - 70 ? "end" : origin.x < 70 ? "start" : "middle";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ask-sketch mb-3 block h-auto w-full" role="img" aria-label={`Walking route: ${SHOPPER_LOCATION.label}, then shops 1 to ${placed.length}`}>
      <polyline
        points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--color-carbon)"
        strokeWidth="1.6"
        strokeDasharray="1 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x={origin.x - 8} y={origin.y - 8} width="16" height="16" fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="1.5" />
      <rect x={origin.x - 2.5} y={origin.y - 2.5} width="5" height="5" fill="var(--color-ink)" />
      <text
        x={anchor === "end" ? origin.x + 8 : anchor === "start" ? origin.x - 8 : origin.x}
        y={labelBelow ? origin.y + 28 : origin.y - 18}
        textAnchor={anchor}
        className="ask-sketch-label"
      >
        {SHOPPER_LOCATION.label}
      </text>
      {pins.map((p, i) => (
        <g key={placed[i].n}>
          <rect x={p.x - 12} y={p.y - 12} width="24" height="24" fill="var(--color-ink)" />
          <text x={p.x} y={p.y + 0.5} textAnchor="middle" dominantBaseline="central" className="ask-sketch-pin">
            {placed[i].n}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Laptop: the errand's line in the conversation (the errand sits on the right) ──

export function ErrandNote({
  group,
  proposals,
  onShow,
}: {
  group: CardGroup;
  proposals: Record<string, ProposalState>;
  onShow: () => void;
}) {
  const shops = [...new Set(group.cards.map((c) => c.proposal.shop_name))];
  const held = group.cards.filter((c) => proposals[c.id]?.status === "held");
  const total = group.cards.reduce((s, c) => s + c.proposal.amount_cents, 0);
  return (
    <motion.button
      type="button"
      onClick={onShow}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: RISE }}
      className="group flex w-full items-center gap-5 border-y border-ink/15 px-1 py-4 text-left transition-colors hover:border-ink/35"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] lg:text-[17px]">
          {group.cards.length} orders · {shops.join(", ")}
        </span>
        <span className="mt-0.5 block text-[15px] text-ink-muted lg:text-[16px]">
          {held.length ? `${held.length} of ${group.cards.length} held · your errand is on the right` : "Your errand is on the right"}
        </span>
      </span>
      <span className="font-figures text-[28px] font-normal leading-none text-ink">{formatCents(total)}</span>
      <Arrow className="text-carbon transition-transform duration-300 group-hover:translate-x-1" />
    </motion.button>
  );
}
