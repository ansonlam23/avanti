"use client";

import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { TicketOrder } from "@/lib/orders/progress";
import { LiveTicket, TICKET_COLUMN } from "./live-ticket";

// After "Confirm & hold" the shopper is led to their ticket: it slides up over
// the chat (CONTRACTS §18). An errand's Confirm all brings every ticket, stacked.
// "Back to chat" (or Escape) returns to the conversation, which is still there.

const RISE = [0.22, 1, 0.36, 1] as const;

export function TicketSheet({
  ids,
  orders,
  onClose,
}: {
  /** The tickets to show (null = closed). */
  ids: string[] | null;
  /** What the chat already knows about each order (shown while the ticket re-reads it). */
  orders: Record<string, TicketOrder | undefined>;
  onClose: () => void;
}) {
  const open = Boolean(ids && ids.length);
  const back = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    back.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && ids ? (
        <motion.div
          key="ticket-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={ids.length > 1 ? "Your pickup tickets" : "Your pickup ticket"}
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-counter"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: 0.7, ease: RISE }}
        >
          {/* one centred column (the ticket's width), the way back above it */}
          <div className="flex min-h-full w-full flex-col items-center px-5 pb-[max(env(safe-area-inset-bottom),28px)] pt-[max(env(safe-area-inset-top),16px)] lg:pt-8">
            <div className={TICKET_COLUMN}>
              <button ref={back} type="button" onClick={onClose} className="btn-quiet -ml-3 text-[17px]! text-ink">
                <ArrowLeft className="size-5" strokeWidth={1.6} aria-hidden /> Back to chat
              </button>
              <h2 className="mt-4 font-display text-[34px] font-normal leading-[1.08] text-carbon lg:text-[44px]">
                {ids.length > 1 ? "Your tickets" : "Your ticket"}
              </h2>
            </div>
            <div className="mt-6 flex w-full flex-col items-center gap-12 lg:mt-8 lg:gap-16">
              {ids.map((id) => (
                <LiveTicket key={id} id={id} initial={orders[id] ?? null} />
              ))}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
