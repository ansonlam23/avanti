"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { SimulatedBadge, Stamp, type StampKind } from "@/components/brand";
import { spring } from "@/components/brand/motion-prefs";
import { Money } from "@/components/common/numbers";
import { formatCents, formatTime } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/types";
import type { DashboardOrder } from "@/lib/orders/dashboard";

const STATUS_STAMP: Partial<Record<OrderStatus, StampKind>> = {
  held: "HELD",
  paid: "PAID",
  released: "RELEASED",
  failed: "FAILED",
};

/** Small deterministic rest tilt per ticket so the rail looks hand-hung (−1.4°…+1.4°). */
function tilt(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 7) - 3) * 0.45;
}

function pickupLabel(order: DashboardOrder): string {
  return order.pickup_time ? `pick up ${formatTime(order.pickup_time).toLowerCase()}` : "pick up today";
}

/**
 * The shop's copy of an order: a yellow carbon order-pad ticket, torn off
 * along its perforation and clipped to the steel rail. The customer, the item
 * and the pickup time are in the owner's blue pen; the money is printed; the
 * decisions are red stamps (VERIFIED by the trust check, HELD → PAID /
 * RELEASED). A new ticket swings in on the rail (SPRING.swing).
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
  const rest = tilt(order.id);
  const [firstStatus] = useState(order.status);
  const changed = order.status !== firstStatus;
  const history = order.status === "paid" || order.status === "released";
  const amount = formatCents(order.amount_cents);

  return (
    <motion.article
      aria-label={`Order: ${order.qty} ${order.item_name} for ${order.customer_name || "a shopper"}, ${order.status} ${amount}`}
      className="relative mx-1"
      style={{ transformOrigin: "50% -14px" }}
      initial={{ rotate: -10, y: -34, opacity: 0 }}
      animate={{ rotate: rest, y: 0, opacity: 1 }}
      exit={{ opacity: 0, y: 30, rotate: rest + 3, transition: { duration: 0.22 } }}
      transition={{ rotate: spring(SPRING.swing), y: spring(SPRING.paper), opacity: { duration: 0.12 } }}
    >
      {/* the clip that holds it on the rail */}
      <span aria-hidden className="steel-clip absolute -top-[17px] left-1/2 z-10 -translate-x-1/2" />
      <div className="pad edge-perf-top relative px-6 pb-6 pt-9 shadow-slip">
        {order.agent_id ? (
          <Stamp kind="VERIFIED" size="sm" animate={fresh} sound={false} className="absolute right-4 top-6" />
        ) : null}

        <p className="pen pr-28 text-[40px] [overflow-wrap:anywhere]">{order.customer_name || "a shopper"}</p>
        <p className="pen mt-2 text-[32px] [overflow-wrap:anywhere]">
          {order.qty} × {order.item_name.toLowerCase()}
        </p>
        <p className="pen mt-1.5 text-[28px] opacity-90">{pickupLabel(order)}</p>

        <div aria-hidden className="mt-4 border-t-2 border-pad-line" />

        <div className="relative mt-4 flex min-h-[60px] items-end justify-end">
          {stamp ? (
            <span className="absolute -top-1 left-0">
              {history ? <Stamp kind="HELD" faded size="md" sound={false} className="absolute left-0 top-0" /> : null}
              <Stamp
                kind={stamp}
                size="md"
                animate={changed || (fresh && order.status === "held")}
                className={history ? "relative left-6 top-3" : "relative"}
              />
            </span>
          ) : null}
          <Money
            cents={order.amount_cents}
            className={cn(
              "thermal font-display text-[clamp(40px,13vw,52px)] font-black leading-[0.82]",
              order.status === "released" || order.status === "failed" ? "text-ink-muted" : "text-ink",
            )}
          />
        </div>
        <p className="mt-2.5 flex items-center justify-end gap-2 text-[14px] text-ink-muted lg:text-[15px]">
          {order.payment_mode === "simulated" ? <SimulatedBadge /> : <span>Visa sandbox · test card</span>}
        </p>

        {order.status === "held" ? (
          <div className="mt-5 grid gap-2.5">
            <button type="button" disabled={busy} onClick={onPickedUp} className="btn-ink w-full justify-between!">
              Picked up
              <span className="font-sans text-[15px] font-normal normal-case tracking-normal opacity-85 max-[359px]:hidden">charge {amount}</span>
            </button>
            <button type="button" disabled={busy} onClick={onNoShow} className="btn-line w-full justify-between!">
              No-show
              <span className="font-sans text-[15px] font-normal normal-case tracking-normal text-ink-muted max-[359px]:hidden">release hold</span>
            </button>
          </div>
        ) : null}
        {order.status === "failed" && order.failure_reason ? (
          <p className="mt-3 text-[14px] text-stamp-deep lg:text-[15px]">{order.failure_reason}</p>
        ) : null}
      </div>
    </motion.article>
  );
}

/** A compact strip for every other order (held ones can be brought to the front). */
export function OrderStrip({ order, onOpen }: { order: DashboardOrder; onOpen?: () => void }) {
  const stamp = STATUS_STAMP[order.status];
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="pen block truncate text-[26px]">{order.customer_name || "a shopper"}</span>
        <span className="mt-0.5 block truncate text-[14px] text-ink-muted lg:text-[15px]">
          {order.qty} × {order.item_name}
        </span>
      </span>
      <span
        className={cn(
          "font-display text-[26px] font-extrabold tabular-nums",
          order.status === "released" || order.status === "failed" ? "text-ink-muted" : "text-ink",
        )}
      >
        {formatCents(order.amount_cents)}
      </span>
      {stamp ? <Stamp kind={stamp} size="sm" sound={false} className="shrink-0" /> : null}
    </>
  );
  const shell = cn(
    "flex w-full items-center gap-3 rounded-[2px] px-4 py-3 text-left shadow-slip",
    order.status === "held" ? "pad" : "paper",
  );
  return (
    <li style={{ rotate: `${tilt(order.id) * 0.5}deg` }}>
      {onOpen ? (
        <button type="button" onClick={onOpen} className={cn(shell, "min-h-14 transition active:scale-[0.99]")} aria-label={`Show ${order.customer_name || "this"} order in front`}>
          {body}
        </button>
      ) : (
        <div className={cn(shell, order.status !== "held" && "opacity-90")}>{body}</div>
      )}
    </li>
  );
}
