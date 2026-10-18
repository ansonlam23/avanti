"use client";

import { AnimatePresence, motion } from "motion/react";
import { Fragment, useMemo } from "react";
import { Receipt, SimulatedBadge, Stamp } from "@/components/brand";
import { Money } from "@/components/common/numbers";
import type { OrderProposal } from "@/lib/ai/shopper-types";
import { formatCents } from "@/lib/format";
import { EASE } from "@/lib/motion";
import type { PaymentMode, PublicOrder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RISE } from "./ink";
import { receiptProps } from "./order-reveal";
import type { ProposalState } from "./use-shopper";
import { factsFor, orderReasons } from "./why";
import { useWhySources } from "./why-store";

// The order card: a paper slip not placed yet, with ONE action. Money
// decisions always land on paper. After the tap, a focus reveal plays
// VERIFIED → the receipt printing HELD (order-reveal.tsx); then the receipt
// waits here and follows the owner live (PAID / RELEASED over a faded HELD).

/** Small tracked caps: the slip's own labels (Red Hat Text 600, ≥ 13px). */
const LABEL = "text-[13px] font-semibold uppercase leading-tight tracking-[0.13em]";

export function OrderCard({
  proposal,
  state,
  order,
  name,
  onName,
  onConfirm,
  mode,
}: {
  proposal: OrderProposal;
  state: ProposalState;
  order: PublicOrder | null;
  name: string;
  onName: (v: string) => void;
  onConfirm: () => void;
  mode: PaymentMode | null;
}) {
  const view =
    state.status === "held" && order
      ? "receipt"
      : state.status === "sold_out"
        ? "sold"
        : state.status === "replaced"
          ? "replaced"
          : "preview";
  return (
    <AnimatePresence mode="wait" initial={false}>
      {view === "receipt" && order ? (
        <motion.div key="receipt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: RISE }}>
          <PrintedReceipt order={order} heldMs={state.heldMs} />
        </motion.div>
      ) : view === "sold" || view === "replaced" ? (
        <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: RISE }}>
          <StaleStrip proposal={proposal} reason={view} />
        </motion.div>
      ) : (
        <motion.div
          key="preview"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.2, ease: EASE.in } }}
          transition={{ duration: 0.8, ease: RISE }}
        >
          <Preview proposal={proposal} state={state} name={name} onName={onName} onConfirm={onConfirm} mode={mode} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Preview({
  proposal,
  state,
  name,
  onName,
  onConfirm,
  mode,
}: {
  proposal: OrderProposal;
  state: ProposalState;
  name: string;
  onName: (v: string) => void;
  onConfirm: () => void;
  mode: PaymentMode | null;
}) {
  const pending = state.status === "pending";
  const failed = state.status === "failed";
  // The shop finished this attempt (refused, declined, menu changed…): nothing was held.
  const final = failed && state.error !== null && !state.error.retry;
  const amount = formatCents(proposal.amount_cents);
  const label = pending
    ? state.stage === "visa"
      ? "Asking Visa for a hold…"
      : "Signing your order…"
    : failed
      ? `Try again · hold ${amount}`
      : `Confirm & hold ${amount}`;
  // "Why this shop?": only facts the chat's own cards hold (why.ts); nothing guessed.
  const sources = useWhySources();
  const reasons = useMemo(() => orderReasons(proposal, factsFor(sources, proposal)), [sources, proposal]);
  const walkInWhy = reasons.some((r) => r.kind === "walk");
  const meta = [
    `Pickup ${proposal.pickup_label}`,
    proposal.walk_minutes !== null && !walkInWhy ? `${proposal.walk_minutes} min walk` : null,
    proposal.is_demo ? "demo shop" : null,
  ].filter(Boolean);

  return (
    <article
      aria-label={`Order preview: ${proposal.qty} ${proposal.item_name} from ${proposal.shop_name}, ${amount}`}
      className="ask-slip px-6 pb-6 pt-6 lg:px-7 lg:pb-7 lg:pt-7"
    >
      <p className={cn(LABEL, "text-ink-muted")}>Not placed yet</p>
      <h3 className="mt-2 font-display text-[30px] font-normal leading-[1.08] text-ink">{proposal.shop_name}</h3>
      <p className="mt-1.5 text-[15px] text-ink-muted lg:text-[16px]">{meta.join(" · ")}</p>
      {reasons.length ? (
        <p className="mt-1 text-[15px] leading-snug text-ink-muted lg:text-[16px]">
          <span className="font-semibold text-ink">Why:</span>
          {reasons.map((r, i) => (
            // each reason stays whole; the line only breaks between them
            <Fragment key={r.kind}>
              {i ? " · " : " "}
              <span className="whitespace-nowrap">{r.text}</span>
            </Fragment>
          ))}
        </p>
      ) : null}

      <div aria-hidden className="ask-rule my-4" />
      <p className="flex items-baseline gap-2 text-[16px] lg:text-[17px]">
        <span className="min-w-0">
          {proposal.qty}× {proposal.item_name}
        </span>
        <span aria-hidden className="leader min-w-0!" />
        <span className="shrink-0 font-mono text-[15px] tabular-nums lg:text-[16px]">{amount}</span>
      </p>
      {proposal.item_name_en ? <p className="text-[15px] text-ink-muted lg:text-[16px]">{proposal.item_name_en}</p> : null}
      <div aria-hidden className="ask-rule my-4" />

      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col items-start gap-2 pb-1.5">
          <span className={cn(LABEL, "text-ink-muted")}>Hold</span>
          {mode === "simulated" ? <SimulatedBadge /> : null}
        </span>
        <Money cents={proposal.amount_cents} className="font-figures text-[50px] font-normal leading-[0.9] text-ink" />
      </div>

      <label className="mt-6 block">
        <span className={cn(LABEL, "mb-2 block text-ink-muted")}>Name for pickup</span>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Your name"
          maxLength={60}
          autoComplete="given-name"
          enterKeyHint="done"
          disabled={pending}
          className="ask-field"
        />
      </label>

      {final && state.error ? (
        // The shop finished this attempt; tapping again (same key) would only repeat it.
        <p role="alert" className="mt-4 border-l-2 border-stamp py-1 pl-3.5 text-[15px] leading-snug text-ink lg:text-[16px]">
          {state.error.message}
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending}
            className="ask-btn mt-4 w-full lg:min-h-[60px] lg:text-[21px]"
          >
            {label}
          </button>
          {pending ? <div aria-hidden className="ask-working" /> : null}
          {failed && state.error ? (
            <p role="alert" className="mt-2.5 text-center text-[15px] font-semibold leading-snug text-stamp-deep lg:text-[16px]">
              {state.error.message}
            </p>
          ) : null}
        </>
      )}

      <p className="mt-3.5 text-center text-[15px] leading-snug text-ink-muted">
        {final ? "Test card ···· 1111 · nothing was held or charged" : "Test card ···· 1111 · held, not charged, until pickup"}
      </p>
    </article>
  );
}

/** A card that can't be confirmed anymore (sold out, or a newer card replaced it): small, struck through, honest. */
function StaleStrip({ proposal, reason }: { proposal: OrderProposal; reason: "sold" | "replaced" }) {
  return (
    <article className={cn("ask-slip flex items-center gap-4 px-5 py-4", reason === "replaced" && "opacity-75")}>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3 text-[15px] text-ink-muted lg:text-[16px]">
          <span className="min-w-0 line-through decoration-ink/50 decoration-1">
            {proposal.qty}× {proposal.item_name} · {proposal.shop_name}
          </span>
          <span className="shrink-0 font-mono tabular-nums line-through decoration-ink/50 decoration-1">{formatCents(proposal.amount_cents)}</span>
        </p>
        <p className="mt-1.5 text-[15px] leading-snug lg:text-[16px]">
          {reason === "sold" ? (
            <>
              {proposal.shop_name} just sold out. <span className="text-ink-muted">Nothing was ordered or charged.</span>
            </>
          ) : (
            <span className="text-ink-muted">Replaced by the newer card below. Not ordered.</span>
          )}
        </p>
      </div>
      {reason === "sold" ? <Stamp kind="RELEASED" text="Sold out" size="sm" sound={false} className="shrink-0" /> : null}
    </article>
  );
}

/** Money in plain words (DESIGN.md §6), for screen readers; the receipt says it visually. */
const STATUS_LINE: Record<PublicOrder["status"], (amount: string, simulated: boolean) => string> = {
  pending: () => "Asking Visa for a hold…",
  held: (a, sim) =>
    sim
      ? `A simulated ${a} hold (no Visa call yet). You're only charged when you pick it up.`
      : `We put a ${a} hold on your card. You're only charged when you pick it up.`,
  paid: (a, sim) => (sim ? `Picked up. ${a} charged (simulated).` : `Picked up. ${a} charged.`),
  released: (a, sim) =>
    sim ? `No-show: the simulated ${a} hold was released. You weren't charged.` : `No-show: the ${a} hold was released. You weren't charged.`,
  failed: () => "The hold didn't go through. Nothing was charged.",
};

/**
 * The real receipt in the chat (it printed in the focus reveal, so here it's
 * already out), with the shop's VERIFIED slip under it. Seals keep history:
 * when the owner acts, PAID / RELEASED lands over a faded HELD, live.
 */
export function PrintedReceipt({ order }: { order: PublicOrder; heldMs?: number | null }) {
  const amount = formatCents(order.amount_cents);
  return (
    <div className="mx-auto w-full max-w-[360px] pb-2">
      <Receipt {...receiptProps(order)} tilt={0} className="w-full" />
      {order.status !== "failed" ? (
        <div className="ask-slip mt-3 flex items-center justify-center gap-4 px-4 py-3.5">
          <Stamp kind="VERIFIED" size="sm" sound={false} className="shrink-0" />
          <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">Signed by avanti shopper.</p>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {STATUS_LINE[order.status](amount, order.payment_mode === "simulated")}
      </p>
    </div>
  );
}
