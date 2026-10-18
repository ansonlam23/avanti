"use client";

import { Check, DoorOpen, Share2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SimulatedBadge, Stamp, type StampKind } from "@/components/brand";
import { formatTime } from "@/lib/format";
import { readyLine, shortShop, ticketSteps, type TicketOrder } from "@/lib/orders/progress";
import { cn } from "@/lib/utils";
import type { HereState } from "./use-ticket";
import "./ticket.css";

// The pickup ticket (CONTRACTS §18): a clean paper claim ticket, the thing you
// hold up at the counter. Shop and order on top; a perforation; the 4-digit
// code, big; the money's state as a seal; a perforation; where the order is
// (Sent → saw it → Ready → Picked up) and "I'm here". Square, calm, no tilt.

const RISE = [0.22, 1, 0.36, 1] as const;
const LABEL = "text-[13px] font-semibold uppercase leading-tight tracking-[0.13em] text-ink-muted";

const SEAL: Partial<Record<TicketOrder["status"], StampKind>> = {
  held: "HELD",
  paid: "PAID",
  released: "RELEASED",
  failed: "FAILED",
};

function moneyLine(o: TicketOrder): string {
  const simulated = o.payment_mode === "simulated";
  switch (o.status) {
    case "held":
      return simulated ? "A simulated hold. Not charged until you pick up." : "On Visa. Not charged until you pick up.";
    case "paid":
      return "Charged at pickup. Enjoy!";
    case "released":
      return "Released. You weren't charged.";
    case "failed":
      return "The hold didn't go through. Nothing was charged.";
    default:
      return "Asking Visa for a hold…";
  }
}

export function Ticket({
  order,
  here,
  onHere,
  justReady,
  onShare,
  shareNote,
  className,
}: {
  order: TicketOrder;
  here: HereState;
  onHere: () => void;
  justReady?: boolean;
  onShare: () => void;
  shareNote?: string | null;
  className?: string;
}) {
  const held = order.status === "held";
  // Before migration 0007 the order carries no progress fields: the ticket keeps to the code.
  const live = "seen_at" in order || "ready_at" in order || "here_at" in order;
  const ready = held && Boolean(order.ready_at);
  const atDoor = held && Boolean(order.here_at);
  const seal = SEAL[order.status];
  const shop = shortShop(order.shop_name);
  const when = order.pickup_time ? `Pickup ${formatTime(order.pickup_time)}` : "Pickup today";

  return (
    <motion.article
      aria-label={`Pickup ticket: ${order.qty} × ${order.item_name} at ${shop}, code ${order.pickup_code}, ${order.status}`}
      className={cn("paper relative w-full max-w-[440px] shadow-[0_18px_36px_-26px_rgb(22_58_66/0.38)]", className)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: RISE }}
    >
      {/* Ready: a teal band across the top of the ticket */}
      <AnimatePresence initial={false}>
        {ready ? (
          <motion.div
            key="ready"
            className="overflow-hidden bg-carbon text-paper"
            initial={justReady ? { height: 0 } : false}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.7, ease: RISE }}
          >
            <div role="status" className="flex items-center gap-4 px-6 py-4 lg:px-8">
              <span className="grid size-9 shrink-0 place-items-center border border-paper/60">
                <Check className="size-5" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[26px] leading-none">Ready</p>
                <p className="mt-1.5 text-[16px] leading-snug text-paper/90">{readyLine(order)}</p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="px-6 pb-6 pt-6 lg:px-8 lg:pb-7 lg:pt-7">
        <div className="flex items-baseline justify-between gap-4">
          <p className={LABEL}>Pickup ticket</p>
          <p aria-hidden className="font-display text-[22px] leading-none text-carbon">
            avanti
          </p>
        </div>
        <h2 className="mt-4 font-display text-[34px] font-normal leading-[1.08] text-ink text-balance [overflow-wrap:anywhere] lg:text-[38px]">
          {shop}
        </h2>
        <p className="mt-2 text-[18px] leading-snug text-ink [overflow-wrap:anywhere] lg:text-[19px]">
          {order.qty} × {order.item_name}
        </p>
        <p className="mt-1 text-[16px] leading-snug text-ink-muted">
          {when}
          {order.shop_location ? ` · ${order.shop_location}` : ""}
        </p>
        {order.customer_name ? (
          <p className="mt-3 font-pen text-[34px] leading-none text-ink [overflow-wrap:anywhere]">for {order.customer_name}</p>
        ) : null}
      </div>

      <Perforation />

      <div className="px-6 pb-6 pt-6 lg:px-8">
        <p className={LABEL}>Your pickup code</p>
        <div
          aria-label={`Pickup code ${order.pickup_code.split("").join(" ")}`}
          className={cn("mt-3 flex gap-2.5", order.status !== "held" && "opacity-45")}
        >
          {order.pickup_code.split("").map((d, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="grid h-[84px] w-[68px] place-items-center border border-ink/25 bg-counter/40 font-figures text-[56px] leading-none text-ink lg:h-[92px] lg:w-[74px] lg:text-[60px]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: RISE, delay: 0.25 + i * 0.07 }}
            >
              {d}
            </motion.span>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          {seal ? <Stamp kind={seal} size="md" animate={false} sound={false} className="shrink-0" /> : null}
          <p className="min-w-0 text-[16px] leading-snug text-ink text-balance lg:text-[17px]">{moneyLine(order)}</p>
        </div>
        {order.payment_mode === "simulated" ? (
          <p className="mt-3">
            <SimulatedBadge />
          </p>
        ) : (
          <p className="mt-3 text-[15px] text-ink-muted">Visa sandbox · test card</p>
        )}
      </div>

      {(held || order.status === "paid") && live ? (
        <>
          <Perforation />
          <div className="px-6 pb-6 pt-6 lg:px-8">
            <Steps order={order} />
          </div>
        </>
      ) : null}

      {held ? (
        <div className={cn("px-6 pb-7 lg:px-8", !live && "pt-1")}>
          {live ? (
            atDoor ? (
              <p role="status" className="flex items-center gap-3 border border-carbon/40 bg-highlight/50 px-4 py-3.5 text-[17px] leading-snug text-ink text-balance">
                <DoorOpen className="size-5 shrink-0 text-carbon" strokeWidth={1.75} aria-hidden />
                {shop} knows you&apos;re here.
              </p>
            ) : (
              <button type="button" onClick={onHere} disabled={here.busy} className="btn-ink w-full justify-between!">
                {here.busy ? "Telling the shop…" : "I'm here"}
                <DoorOpen className="size-5" strokeWidth={1.6} aria-hidden />
              </button>
            )
          ) : (
            <p className="text-[16px] leading-snug text-ink-muted">Show this code at the counter.</p>
          )}
          {here.error ? <p className="mt-2 text-[15px] font-semibold text-stamp-deep">{here.error}</p> : null}

          <div className="mt-4 flex flex-col items-start gap-0.5">
            <button type="button" onClick={onShare} className="link-ink text-[19px]!">
              <Share2 className="size-[18px]" strokeWidth={1.6} aria-hidden /> Send to a friend
            </button>
            <p className="text-[15px] leading-snug text-ink-muted" aria-live="polite">
              {shareNote ?? "Anyone with this link can pick it up."}
            </p>
          </div>
        </div>
      ) : null}
    </motion.article>
  );
}

/** A tear line across the ticket, with a small square punch at each edge. */
function Perforation() {
  return (
    <div aria-hidden className="relative">
      <div className="mx-6 border-t-2 border-dashed border-ink/20 lg:mx-8" />
      <span className="absolute -left-px top-1/2 size-3.5 -translate-y-1/2 border-y border-r border-ink/16 bg-counter" />
      <span className="absolute -right-px top-1/2 size-3.5 -translate-y-1/2 border-y border-l border-ink/16 bg-counter" />
    </div>
  );
}

/** Sent → {shop} saw it → Ready → Picked up, as four squares on a line. */
function Steps({ order }: { order: TicketOrder }) {
  const steps = ticketSteps(order);
  return (
    <ol aria-label="Where your order is" className="grid grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex flex-col items-start gap-2.5">
          {i > 0 ? (
            <span
              aria-hidden
              className={cn("absolute right-full top-[11.5px] h-px w-[calc(100%-24px)]", s.done ? "bg-carbon" : "bg-ink/20")}
            />
          ) : null}
          <span
            aria-hidden
            className={cn(
              "relative grid size-6 place-items-center border",
              s.done ? "border-carbon bg-carbon text-paper" : s.current ? "border-carbon bg-paper" : "border-ink/25 bg-paper",
            )}
          >
            {s.done ? <Check className="size-4" strokeWidth={2.2} /> : null}
            {s.current ? <span className="ticket-pulse block size-2 bg-carbon" /> : null}
          </span>
          <span
            className={cn(
              "pr-2 text-[15px] leading-tight",
              s.done ? "text-ink" : s.current ? "font-semibold text-ink" : "text-ink-muted",
            )}
          >
            <span className="sr-only">{s.done ? "Done: " : s.current ? "Now: " : "Next: "}</span>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
