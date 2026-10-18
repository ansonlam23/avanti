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
// code, big, and the money's state as a seal; a perforation; where the order is
// (Sent → Preparing → Ready → Picked up) and "I'm here". Square, calm, no tilt.
// One spacing scale: 24 px (phone) / 32 px (laptop) between blocks and inside
// every paper section.

const RISE = [0.22, 1, 0.36, 1] as const;
const LABEL = "text-[13px] font-semibold uppercase leading-tight tracking-[0.13em] text-ink-muted";
/** Padding of every paper section, and the gap between blocks. */
const SECTION = "px-6 py-6 lg:px-8 lg:py-8";
const GAP = "mt-6 lg:mt-8";

const SEAL: Partial<Record<TicketOrder["status"], StampKind>> = {
  held: "HELD",
  paid: "PAID",
  released: "RELEASED",
  failed: "FAILED",
};

const MONEY: Record<TicketOrder["status"], string> = {
  pending: "Asking Visa for a hold…",
  held: "Not charged until you pick up.",
  paid: "Charged at pickup.",
  released: "Released. Not charged.",
  failed: "The hold didn't go through. Not charged.",
};

export function Ticket({
  order,
  here,
  onHere,
  justReady,
  onShare,
  copied,
  fallbackLink,
  className,
}: {
  order: TicketOrder;
  here: HereState;
  onHere: () => void;
  justReady?: boolean;
  onShare: () => void;
  /** The share link was just copied (the key says so for a moment). */
  copied?: boolean;
  /** Neither share sheet nor clipboard: the link, to copy by hand. */
  fallbackLink?: string | null;
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
      className={cn("paper relative w-full shadow-[0_18px_36px_-26px_rgb(22_58_66/0.38)]", className)}
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
            <div role="status" className="flex items-center gap-4 px-6 py-5 lg:px-8">
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

      <div className={SECTION}>
        <h2 className="font-display text-[34px] font-normal leading-[1.08] text-ink text-balance [overflow-wrap:anywhere] lg:text-[40px]">
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
          <p className="mt-4 font-pen text-[34px] leading-none text-ink [overflow-wrap:anywhere]">for {order.customer_name}</p>
        ) : null}
      </div>

      <Perforation />

      <div className={SECTION}>
        <p className={LABEL}>Pickup code</p>
        <div
          aria-label={`Pickup code ${order.pickup_code.split("").join(" ")}`}
          className={cn("mt-3 flex gap-3", order.status !== "held" && "opacity-45")}
        >
          {order.pickup_code.split("").map((d, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="grid h-[84px] w-[68px] place-items-center border border-ink/25 bg-counter/40 font-figures text-[56px] leading-none text-ink lg:h-[96px] lg:w-[78px] lg:text-[62px]"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: RISE, delay: 0.25 + i * 0.07 }}
            >
              {d}
            </motion.span>
          ))}
        </div>

        <div className={cn(GAP, "flex items-center gap-4")}>
          {seal ? <Stamp kind={seal} size="md" animate={false} sound={false} className="shrink-0" /> : null}
          <div className="min-w-0">
            <p className="text-[17px] leading-snug text-ink text-balance">{MONEY[order.status]}</p>
            {order.payment_mode === "simulated" ? (
              <p className="mt-1.5">
                <SimulatedBadge />
              </p>
            ) : (
              <p className="mt-1 text-[15px] text-ink-muted">Visa sandbox</p>
            )}
          </div>
        </div>
      </div>

      {held || (order.status === "paid" && live) ? (
        <>
          <Perforation />
          <div className={SECTION}>
            {live ? <Steps order={order} /> : null}

            {held ? (
              <>
                {live ? (
                  atDoor ? (
                    <p role="status" className={cn(GAP, "flex items-center gap-3 border border-carbon/40 bg-highlight/50 px-4 py-3.5 text-[17px] leading-snug text-ink text-balance")}>
                      <DoorOpen className="size-5 shrink-0 text-carbon" strokeWidth={1.75} aria-hidden />
                      {shop} knows you&apos;re here.
                    </p>
                  ) : (
                    <button type="button" onClick={onHere} disabled={here.busy} className={cn(GAP, "btn-ink w-full justify-between!")}>
                      {here.busy ? "Telling the shop…" : "I'm here"}
                      <DoorOpen className="size-5" strokeWidth={1.6} aria-hidden />
                    </button>
                  )
                ) : (
                  <p className="text-[17px] leading-snug text-ink">Show this code at the counter.</p>
                )}
                {here.error ? <p className="mt-2 text-[15px] font-semibold text-stamp-deep">{here.error}</p> : null}

                <div className={cn(GAP, "flex flex-col items-start")}>
                  <button type="button" onClick={onShare} className="link-ink -ml-0.5 text-[19px]!">
                    <Share2 className="size-[18px]" strokeWidth={1.6} aria-hidden /> {copied ? "Link copied" : "Send to a friend"}
                  </button>
                  <p className="text-[15px] leading-snug text-ink-muted [overflow-wrap:anywhere]" aria-live="polite">
                    {fallbackLink ?? "Anyone with the link can pick it up."}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </>
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

/**
 * Sent → Preparing → Ready → Picked up across the full width: the first box
 * flush left, the last flush right, one line between them (teal as far as the
 * order has come). Labels sit under their boxes on one line: the first left-aligned,
 * the last right-aligned, the middle two centred.
 */
function Steps({ order }: { order: TicketOrder }) {
  const steps = ticketSteps(order);
  const reached = steps.reduce((at, s, i) => (s.done || s.current ? i : at), 0);
  const BOX = 24; // px; box centres sit at BOX/2 + i × (100% − BOX) / 3
  const centre = (i: number) => `calc(${BOX / 2}px + (100% - ${BOX}px) * ${i / 3})`;
  return (
    <div role="group" aria-label="Where your order is">
      <div className="relative h-6">
        {/* the line, box centre to box centre, teal up to where the order is */}
        <span aria-hidden className="absolute top-[11.5px] h-px bg-ink/20" style={{ left: BOX / 2, right: BOX / 2 }} />
        <span
          aria-hidden
          className="absolute top-[11.5px] h-px bg-carbon transition-[width] duration-700"
          style={{ left: BOX / 2, width: `calc((100% - ${BOX}px) * ${reached / 3})` }}
        />
        {steps.map((s, i) => (
          <span
            key={s.key}
            aria-hidden
            className={cn(
              "absolute top-0 grid size-6 -translate-x-1/2 place-items-center border",
              s.done ? "border-carbon bg-carbon text-paper" : s.current ? "border-carbon bg-paper" : "border-ink/25 bg-paper",
            )}
            style={{ left: centre(i) }}
          >
            {s.done ? <Check className="size-4" strokeWidth={2.2} /> : null}
            {s.current ? <span className="ticket-pulse block size-2 bg-carbon" /> : null}
          </span>
        ))}
      </div>
      <ol className="relative mt-2.5 h-5 text-[15px] leading-5">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              "absolute top-0 whitespace-nowrap",
              i === 0 ? "left-0" : i === steps.length - 1 ? "right-0" : "-translate-x-1/2",
              s.done ? "text-ink" : s.current ? "font-semibold text-ink" : "text-ink-muted",
            )}
            style={i > 0 && i < steps.length - 1 ? { left: centre(i) } : undefined}
          >
            <span className="sr-only">{s.done ? "Done: " : s.current ? "Now: " : "Next: "}</span>
            {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
