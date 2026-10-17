"use client";

import { ArrowRight } from "lucide-react";
import { BotWall, REASON_LABEL } from "@/components/brand";
import { Count } from "@/components/common/numbers";
import { formatCents, formatTime } from "@/lib/format";
import type { BlockReason, ShopEvent } from "@/lib/types";
import type { DashboardStats } from "@/lib/orders/dashboard";

/** The shopper's display name; older events still carry the pre-avanti name. */
function agentLabel(name: unknown): string {
  return String(name ?? "avanti shopper").replace(/open sign shopper/i, "avanti shopper");
}

function describe(e: ShopEvent): string {
  const d = e.detail as Record<string, unknown>;
  switch (e.type) {
    case "order_verified":
      return `Verified: ${agentLabel(d.agent_name)}`;
    case "bot_blocked":
      return `Rejected: ${REASON_LABEL[(e.reason ?? "malformed") as BlockReason] ?? e.reason}`;
    case "order_held":
      return `Held ${typeof d.amount_cents === "number" ? formatCents(d.amount_cents) : ""}`.trim();
    case "order_failed": {
      // the owner's own rules turned a verified AI order down (before Visa)
      const item = String(d.item_name ?? "An item");
      if (e.reason === "over_ai_limit") {
        const limit = typeof d.limit_cents === "number" ? ` ${formatCents(d.limit_cents)}` : "";
        return `Turned down by your rules: ${item}, over your${limit} AI limit`;
      }
      if (e.reason === "not_for_ai") return `Turned down by your rules: ${item} is in-person only`;
      return `Payment failed${d.message ? `: ${String(d.message)}` : ""}`;
    }
    case "paid":
      return `Charged ${typeof d.amount_cents === "number" ? formatCents(d.amount_cents) : ""}`.trim();
    case "released":
      return "Hold released (no-show)";
    case "sold_out":
      return `${String(d.item_name ?? "Item")} sold out`;
    case "restocked":
      return `${String(d.item_name ?? "Item")} back in stock`;
    case "shop_opened":
      return "Shop opened";
  }
}

const SHOWN = 8;

/**
 * The door: the report (REACHED VISA 0 is the hero), one way to send test
 * bots, and the raw log folded away behind a tap.
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
  const refused = stats.refused_by_rules ?? 0;
  return (
    <div className="space-y-6">
      <div>
        {/* every number on it comes from the door log */}
        <BotWall blocked={stats.blocked} reasons={stats.blocked_by_reason} reachedVisa={stats.unverified_orders} verified={stats.verified} />
        {/* verified AI orders the owner's own rules turned down (the report's last line) */}
        <p className="paper -mt-px flex items-baseline gap-2 px-6 pb-5 pt-4">
          <span className="shrink-0 text-[16px] text-ink-muted">Refused by your rules</span>
          <span aria-hidden className="leader" />
          <Count value={refused} className="dot shrink-0 text-[28px] leading-none text-ink" />
        </p>
      </div>

      <div className="flex justify-center">
        <button type="button" onClick={onSimulate} disabled={simulating} className="link-ink text-[19px]! disabled:opacity-60">
          {simulating ? "Bots knocking…" : "Send 50 test bots"}
          {simulating ? null : <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />}
        </button>
      </div>

      {events.length ? (
        <details className="group">
          <summary className="btn-quiet mx-auto w-fit list-none text-ink-muted [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show the log</span>
            <span className="hidden group-open:inline">Hide the log</span>
          </summary>
          <ol className="paper mt-3 space-y-2.5 px-5 py-5 text-[15px] lg:px-6 lg:text-[16px]" aria-label="Door log">
            {events.slice(0, SHOWN).map((e) => (
              <li key={e.id} className="flex items-baseline gap-2">
                <span className={e.type === "bot_blocked" ? "text-stamp-deep" : undefined}>{describe(e)}</span>
                <span aria-hidden className="leader" />
                <span className="shrink-0 font-mono text-[14px] tabular-nums text-ink-muted lg:text-[15px]">{formatTime(e.created_at)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
