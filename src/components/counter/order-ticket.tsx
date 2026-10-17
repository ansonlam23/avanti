"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { SimulatedBadge, Stamp, type StampKind } from "@/components/brand";
import { sec } from "@/components/brand/motion-prefs";
import { Money } from "@/components/common/numbers";
import { INK_EASE } from "@/components/open/ink";
import { formatCents, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";
import type { DashboardOrder } from "@/lib/orders/dashboard";

const STATUS_STAMP: Partial<Record<OrderStatus, StampKind>> = {
  held: "HELD",
  paid: "PAID",
  released: "RELEASED",
  failed: "FAILED",
};

function pickupLabel(order: DashboardOrder): string {
  return order.pickup_time ? `Pick up ${formatTime(order.pickup_time).toLowerCase()}` : "Pick up today";
}

/**
 * The shop's copy of an order: a clean slip on the shop's teal wash, hung
 * from the rail by a small clip. The customer's name is in the owner's brush;
 * the money is set large; the decisions are vermilion seals (VERIFIED by the
 * trust check, HELD → PAID / RELEASED, a faded HELD kept under the new one).
 * A new ticket rises into place (calm, 0.8 s).
 */
export function OrderTicket({
  order,
  fresh,
  busy,
  onPickedUp,
  onNoShow,
}: {
  order: DashboardOrder;
  fresh?: boolean;
  busy?: boolean;
  onPickedUp: () => void;
  onNoShow: () => void;
}) {
  const stamp = STATUS_STAMP[order.status];
  const [firstStatus] = useState(order.status);
  const changed = order.status !== firstStatus;
  const history = order.status === "paid" || order.status === "released";
  const amount = formatCents(order.amount_cents);
  const quiet = order.status === "released" || order.status === "failed";

  return (
    <motion.article
      aria-label={`Order: ${order.qty} ${order.item_name} for ${order.customer_name || "a shopper"}, ${order.status} ${amount}`}
      className="relative mx-1"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16, transition: { duration: 0.22 } }}
      transition={{ duration: sec(0.8), ease: INK_EASE }}
    >
      {/* the clip that holds it on the rail */}
      <span aria-hidden className="steel-clip absolute -top-[13px] left-1/2 z-10 -translate-x-1/2" />
      <div className="pad relative px-6 pb-6 pt-9 lg:px-7">
        {order.agent_id ? (
          <Stamp kind="VERIFIED" size="sm" animate={fresh} sound={false} className="absolute right-5 top-7" />
        ) : null}

        <p className="pr-32 font-pen text-[42px] leading-none text-ink [overflow-wrap:anywhere]">{order.customer_name || "a shopper"}</p>
        <p className="mt-4 text-[19px] leading-snug [overflow-wrap:anywhere]">
          {order.qty} × {order.item_name}
        </p>
        <p className="mt-1 text-[16px] text-ink-muted">{pickupLabel(order)}</p>

        <div aria-hidden className="print-rule mt-5" />

        {/* the decision and the money: one row when the slip is wide enough, otherwise the total
            drops under the seals (right-aligned) so a wide seal never crowds it */}
        <div className="mt-5 flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-3">
          {stamp ? (
            // seals keep history: the faded HELD impression, then the decision that followed it
            <span className="flex items-center">
              {history ? <Stamp kind="HELD" faded size="md" sound={false} className="-mr-3 mt-4" /> : null}
              <Stamp kind={stamp} size="md" animate={changed || (fresh && order.status === "held")} />
            </span>
          ) : null}
          <Money cents={order.amount_cents} className={cn("ml-auto font-figures text-[52px] leading-[0.9]", quiet ? "text-ink-muted" : "text-ink")} />
        </div>
        <p className="mt-3 flex items-center justify-end gap-2 text-[15px] text-ink-muted">
          {order.payment_mode === "simulated" ? <SimulatedBadge /> : <span>Visa sandbox · test card</span>}
        </p>

        {order.status === "held" ? (
          <div className="mt-6 flex flex-col items-center gap-1">
            <button type="button" disabled={busy} onClick={onPickedUp} className="btn-ink w-full justify-between!">
              Picked up
              <span className="font-sans text-[15px] tracking-normal opacity-85 max-[359px]:hidden">charge {amount}</span>
            </button>
            <button type="button" disabled={busy} onClick={onNoShow} className="link-ink text-[18px]!">
              No-show, release the hold <ArrowRight className="size-[17px]" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        ) : null}
        {order.status === "failed" && order.failure_reason ? (
          <p className="mt-3 text-[15px] text-stamp-deep">{order.failure_reason}</p>
        ) : null}
      </div>
    </motion.article>
  );
}

/** A compact strip for every other order (held ones can be brought to the front). */
export function OrderStrip({ order, onOpen }: { order: DashboardOrder; onOpen?: () => void }) {
  const stamp = STATUS_STAMP[order.status];
  const quiet = order.status === "released" || order.status === "failed";
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-pen text-[30px] leading-none text-ink">{order.customer_name || "a shopper"}</span>
        <span className="mt-1.5 block truncate text-[15px] text-ink-muted lg:text-[16px]">
          {order.qty} × {order.item_name}
        </span>
      </span>
      <span className={cn("font-mono text-[18px] font-medium tabular-nums", quiet ? "text-ink-muted" : "text-ink")}>
        {formatCents(order.amount_cents)}
      </span>
      {stamp ? <Stamp kind={stamp} size="sm" sound={false} className="shrink-0" /> : null}
    </>
  );
  const shell = cn("flex w-full items-center gap-4 px-5 py-3.5 text-left", order.status === "held" ? "pad" : "paper");
  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(shell, "min-h-14 transition-colors duration-300 hover:bg-highlight")}
          aria-label={`Show ${order.customer_name || "this"} order in front`}
        >
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
  );
}
