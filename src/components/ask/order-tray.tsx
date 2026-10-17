"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Receipt } from "@/components/brand";
import type { OrderProposal } from "@/lib/ai/shopper-types";
import { formatCents } from "@/lib/format";
import { EASE } from "@/lib/motion";
import type { PaymentMode } from "@/lib/types";
import { Arrow } from "./arrow";
import { RISE } from "./ink";

// Laptop/desktop only: the column to the right of the conversation, set off by
// one hairline, where the order lives. Before a chat: a sample receipt
// (labelled). During it: an empty slip outline. Then the order card, then the
// real receipt with its pickup code. Phones keep all of this inline.

export type TrayView = "sample" | "idle" | "order";

export function OrderTray({
  view,
  mode,
  cardKey,
  card,
}: {
  view: TrayView;
  mode: PaymentMode | null;
  /** Changes when a newer order card replaces the one on the tray. */
  cardKey: string | null;
  card: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{view === "sample" ? "What you get" : "Your order"}</p>
      <div className="ask-tray-stage grid flex-1 place-items-center py-8">
        <AnimatePresence mode="wait" initial={false}>
          {view === "order" ? (
            <motion.div
              key={cardKey ?? "order"}
              className="w-full max-w-[380px]"
              exit={{ opacity: 0, y: -12, transition: { duration: 0.2, ease: EASE.in } }}
            >
              {card}
            </motion.div>
          ) : view === "idle" ? (
            <IdleSlot key="idle" />
          ) : (
            <SampleReceipt key="sample" mode={mode} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A glimpse of the end of the story, clearly labelled (like the landing's). */
function SampleReceipt({ mode }: { mode: PaymentMode | null }) {
  return (
    <motion.figure
      className="flex flex-col items-center gap-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.2, ease: EASE.in } }}
      transition={{ duration: 0.9, ease: RISE, delay: 0.25 }}
    >
      <Receipt
        shopName="Mai's Bakery"
        lines={[{ label: "Chocolate cake", qty: 1, amount_cents: 1800 }]}
        total_cents={1800}
        status="held"
        mode={mode ?? "sandbox"}
        time="Pickup 5:30 PM"
        tilt={0}
        sound={false}
      />
      <figcaption className="text-[15px] text-ink-muted lg:text-[16px]">Sample receipt</figcaption>
    </motion.figure>
  );
}

/** Mid-chat, nothing proposed yet: the outline of the slip your order will be. */
function IdleSlot() {
  return (
    <motion.div
      className="w-[300px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.7, ease: RISE }}
    >
      <div className="grid h-[320px] place-items-center border border-dashed border-ink/25 px-10 text-center">
        <p className="text-[16px] leading-relaxed text-ink-muted">Your order appears here.</p>
      </div>
    </motion.div>
  );
}

/**
 * Where the order card would have been in the conversation: a quiet line that
 * points at the order column (and focuses it).
 */
export function TrayNote({ proposal, held, onShow }: { proposal: OrderProposal; held: boolean; onShow: () => void }) {
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
          {proposal.qty}× {proposal.item_name} · {proposal.shop_name}
        </span>
        <span className="mt-0.5 block text-[15px] text-ink-muted lg:text-[16px]">{held ? "Your receipt is on the right" : "Your order card is on the right"}</span>
      </span>
      <span className="font-display text-[28px] font-normal leading-none tabular-nums text-ink">{formatCents(proposal.amount_cents)}</span>
      <Arrow className="text-carbon transition-transform duration-300 group-hover:translate-x-1" />
    </motion.button>
  );
}
