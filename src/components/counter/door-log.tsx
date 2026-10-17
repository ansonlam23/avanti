"use client";

import { BotWall, REASON_LABEL } from "@/components/brand";
import { formatCents, formatTime } from "@/lib/format";
import type { BlockReason, ShopEvent } from "@/lib/types";
import type { DashboardStats } from "@/lib/orders/dashboard";

function describe(e: ShopEvent): string {
  const d = e.detail as Record<string, unknown>;
  switch (e.type) {
    case "order_verified":
      return `Verified: ${String(d.agent_name ?? "Open Sign Shopper")}`;
    case "bot_blocked":
      return `Rejected: ${REASON_LABEL[(e.reason ?? "malformed") as BlockReason] ?? e.reason}`;
    case "order_held":
      return `Held ${typeof d.amount_cents === "number" ? formatCents(d.amount_cents) : ""}`.trim();
    case "order_failed":
      return `Payment failed${d.message ? `: ${String(d.message)}` : ""}`;
    case "paid":
      return `Charged ${typeof d.amount_cents === "number" ? formatCents(d.amount_cents) : ""}`.trim();
    case "released":
      return "Hold released (no-show)";
    case "sold_out":
      return `${String(d.item_name ?? "Item")} sold out`;
    case "restocked":
      return `${String(d.item_name ?? "Item")} back in stock`;
    case "shop_opened":
      return "Sign printed: shop open";
  }
}

const SHOWN = 8;

/**
 * The door: the Z-report (REACHED VISA 0 is the hero), one button to send
 * test bots, and the raw log folded away behind a tap.
 */
export function DoorLog({
  stats,
  events,
  onSimulate,
  simulating,
}: {
  stats: DashboardStats;
  events: ShopEvent[];
  onSimulate: () => void;
  simulating: boolean;
}) {
  return (
    <div className="space-y-8">
      {/* every number on it comes from the door log */}
      <BotWall blocked={stats.blocked} reasons={stats.blocked_by_reason} reachedVisa={stats.unverified_orders} verified={stats.verified} />

      <button type="button" onClick={onSimulate} disabled={simulating} className="btn-line w-full">
        {simulating ? "Bots knocking…" : "Send 50 test bots"}
      </button>

      {events.length ? (
        <details className="group">
          <summary className="btn-quiet mx-auto list-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show the log</span>
            <span className="hidden group-open:inline">Hide the log</span>
          </summary>
          <ol className="paper mt-4 space-y-2 rounded-[2px] px-5 py-4 text-[14px] shadow-slip lg:text-[15px]" aria-label="Door log">
            {events.slice(0, SHOWN).map((e) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className={e.type === "bot_blocked" ? "text-stamp-deep" : undefined}>{describe(e)}</span>
                <span aria-hidden className="leader" />
                <span className="shrink-0 tabular-nums text-ink-muted">{formatTime(e.created_at)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
