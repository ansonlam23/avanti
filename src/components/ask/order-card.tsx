"use client";

import { AnimatePresence, motion } from "motion/react";
import { Receipt, SimulatedBadge, Stamp } from "@/components/brand";
import { Money } from "@/components/common/numbers";
import type { OrderProposal } from "@/lib/ai/shopper-types";
import { formatCents } from "@/lib/format";
import { EASE } from "@/lib/motion";
import type { PaymentMode, PublicOrder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { receiptProps } from "./order-reveal";
import type { ProposalState } from "./use-shopper";

// The order card: a receipt not printed yet, with ONE big action. Money
// decisions always land on paper. After the tap, a focus reveal plays
// VERIFIED → the receipt printing HELD (order-reveal.tsx); then the receipt
// waits here and follows the owner live (PAID / RELEASED over a faded HELD).

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
        <motion.div key="receipt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <PrintedReceipt order={order} heldMs={state.heldMs} />
        </motion.div>
      ) : view === "sold" || view === "replaced" ? (
        <motion.div key={view} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE.out }}>
          <StaleStrip proposal={proposal} reason={view} />
        </motion.div>
      ) : (
        <motion.div
          key="preview"
          initial={{ opacity: 0, y: 18, rotate: 1.4 }}
          animate={{ opacity: 1, y: 0, rotate: -0.5 }}
          exit={{ opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.18, ease: EASE.in } }}
          transition={{ duration: 0.55, ease: EASE.pop }}
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
  const amount = formatCents(proposal.amount_cents);
  const label = pending
    ? state.stage === "visa"
      ? "Asking Visa for a hold…"
      : "Signing your order…"
    : failed
      ? `Try again · hold ${amount}`
      : `Confirm & hold ${amount}`;
  const meta = [
    `Pickup ${proposal.pickup_label}`,
    proposal.walk_minutes !== null ? `${proposal.walk_minutes} min walk` : null,
    proposal.is_demo ? "demo shop" : null,
  ].filter(Boolean);

  return (
    <article
      aria-label={`Order preview: ${proposal.qty} ${proposal.item_name} from ${proposal.shop_name}, ${amount}`}
      className="slip-drop"
    >
      <div className="paper edge-torn-y px-6 pb-7 pt-7">
        <p className="label-print text-ink-muted">Not placed yet</p>
        <h3 className="mt-1.5 font-display text-[30px] font-extrabold uppercase leading-[0.95]">{proposal.shop_name}</h3>
        <p className="mt-1.5 text-[14px] text-ink-muted lg:text-[15px]">{meta.join(" · ")}</p>

        <div aria-hidden className="print-rule my-4" />
        <p className="flex items-baseline gap-2 text-[15px]">
          <span className="min-w-0">
            {proposal.qty}× {proposal.item_name}
          </span>
          <span aria-hidden className="leader" />
          <span className="shrink-0 tabular-nums">{amount}</span>
        </p>
        {proposal.item_name_en ? <p className="text-[14px] text-ink-muted lg:text-[15px]">{proposal.item_name_en}</p> : null}
        <div aria-hidden className="print-rule my-4" />

        <div className="flex items-end justify-between gap-2">
          <span className="flex flex-col items-start gap-1.5 pb-1">
            <span className="label-print">Hold</span>
            {mode === "simulated" ? <SimulatedBadge /> : null}
          </span>
          <Money cents={proposal.amount_cents} className="thermal font-display text-[52px] font-black leading-[0.82]" />
        </div>

        <label className="mt-6 block">
          <span className="label-print mb-1.5 block text-ink-muted">Name for pickup</span>
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Your name"
            maxLength={60}
            autoComplete="given-name"
            enterKeyHint="done"
            disabled={pending}
            className="field-print"
          />
        </label>

        {failed && state.error && !state.error.retry ? (
          // The shop finished this attempt; tapping again (same key) would only repeat it.
          <p role="alert" className="mt-4 rounded-[2px] border-2 border-dashed border-ink/30 px-4 py-3 text-center text-[15px] leading-snug">
            {state.error.message}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              aria-busy={pending}
              className={cn("btn-ink mt-4 w-full", pending && "disabled:cursor-progress disabled:opacity-80")}
            >
              {label}
            </button>
            {failed && state.error ? (
              <p role="alert" className="mt-2 text-center text-[15px] font-bold leading-snug text-stamp-deep">
                {state.error.message}
              </p>
            ) : null}
          </>
        )}

        <p className="mt-3 text-center text-[14px] leading-snug lg:text-[15px] text-ink-muted">Test card ···· 1111 · held, not charged, until pickup</p>
      </div>
    </article>
  );
}

/** A card that can't be confirmed anymore (sold out, or a newer card replaced it): small, struck through, honest. */
function StaleStrip({ proposal, reason }: { proposal: OrderProposal; reason: "sold" | "replaced" }) {
  return (
    <article className={cn("paper rounded-[2px] px-5 py-3.5 shadow-slip", reason === "replaced" && "opacity-80")} style={{ rotate: "-0.4deg" }}>
      <p className="relative flex items-baseline justify-between gap-3 text-[15px] text-ink-muted">
        <span>
          {proposal.qty}× {proposal.item_name} · {proposal.shop_name}
        </span>
        <span className="tabular-nums">{formatCents(proposal.amount_cents)}</span>
        <span aria-hidden className="absolute inset-x-[-3px] top-[0.7em] h-[2px] -rotate-[0.5deg] rounded-full bg-carbon/85" />
      </p>
      <p className="mt-1.5 text-[15px] leading-snug">
        {reason === "sold" ? (
          <>
            {proposal.shop_name} just sold out. <span className="text-ink-muted">Nothing was ordered or charged.</span>
          </>
        ) : (
          <span className="text-ink-muted">Replaced by the newer card below. Not ordered.</span>
        )}
      </p>
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
 * already out), with the shop's VERIFIED slip lying on it. Stamps keep
 * history: when the owner acts, PAID / RELEASED lands over a faded HELD, live.
 */
export function PrintedReceipt({ order }: { order: PublicOrder; heldMs?: number | null }) {
  const amount = formatCents(order.amount_cents);
  return (
    <div className="mx-auto w-full max-w-[330px] pb-2">
      <Receipt {...receiptProps(order)} className="w-full" />
      {order.status !== "failed" ? (
        <div className="paper relative z-10 -mt-5 ml-auto mr-[-8px] w-[236px] rounded-[2px] px-4 pb-3.5 pt-3 shadow-[var(--shadow-lift)]" style={{ rotate: "2.4deg" }}>
          <Stamp kind="VERIFIED" size="sm" sound={false} />
          <p className="mt-1.5 text-[14px] leading-snug lg:text-[15px] text-ink-muted">Signed by Open Sign Shopper, checked before Visa.</p>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {STATUS_LINE[order.status](amount, order.payment_mode === "simulated")}
      </p>
    </div>
  );
}
