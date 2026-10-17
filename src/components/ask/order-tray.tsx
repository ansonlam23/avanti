"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { PrinterMouth, Receipt } from "@/components/brand";
import type { OrderProposal } from "@/lib/ai/shopper-types";
import { formatCents } from "@/lib/format";
import { EASE } from "@/lib/motion";
import type { PaymentMode } from "@/lib/types";

// Laptop/desktop only: the tray on the right of the conversation, a shallow
// well in the counter where the order lives. Before a chat: a sample receipt
// (labelled). During it: an empty slot under the printer. Then the order card,
// then the real receipt with its pickup code. Phones keep all of this inline.

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
      <p className="label-print text-ink-muted">{view === "sample" ? "What you get" : "Your order"}</p>
      <div className="ask-tray-stage grid flex-1 place-items-center py-8">
        <AnimatePresence mode="wait" initial={false}>
          {view === "order" ? (
            <motion.div
              key={cardKey ?? "order"}
              className="w-full max-w-[380px]"
              exit={{ opacity: 0, y: -14, transition: { duration: 0.2, ease: EASE.in } }}
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
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, y: 16, rotate: 3 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, y: -10, transition: { duration: 0.2, ease: EASE.in } }}
      transition={{ duration: 0.7, ease: EASE.out, delay: 0.2 }}
    >
      <Receipt
        shopName="Mai's Bakery"
        lines={[{ label: "Chocolate cake", qty: 1, amount_cents: 1800 }]}
        total_cents={1800}
        status="held"
        mode={mode ?? "sandbox"}
        time="Pickup 5:30 PM"
        tilt={1.4}
        sound={false}
      />
      <figcaption className="text-[15px] text-ink-muted">Sample receipt</figcaption>
    </motion.figure>
  );
}

/** Mid-chat, nothing proposed yet: an empty slot under the printer. */
function IdleSlot() {
  return (
    <motion.div
      className="relative w-[280px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.4, ease: EASE.out }}
    >
      <PrinterMouth className="-inset-x-5 opacity-80" />
      <div className="grid h-[300px] place-items-center rounded-[2px] border-2 border-dashed border-ink/20 px-8 text-center">
        <p className="text-[16px] leading-relaxed text-ink-muted">Your order prints here.</p>
      </div>
    </motion.div>
  );
}

/**
 * Where the order card would have been in the conversation: a dashed
 * placeholder that points at the tray (and focuses it).
 */
export function TrayNote({ proposal, held, onShow }: { proposal: OrderProposal; held: boolean; onShow: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onShow}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE.out }}
      className="group flex w-full items-center gap-4 rounded-[3px] border-2 border-dashed border-ink/25 px-5 py-3.5 text-left transition-colors hover:border-ink/55 hover:bg-paper/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px]">
          {proposal.qty}× {proposal.item_name} · {proposal.shop_name}
        </span>
        <span className="mt-0.5 block text-[15px] text-ink-muted">{held ? "Your receipt is on the right" : "Your order card is on the right"}</span>
      </span>
      <span className="font-display text-[26px] font-extrabold leading-none tabular-nums">{formatCents(proposal.amount_cents)}</span>
      <ArrowRight aria-hidden className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}
