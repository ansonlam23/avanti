"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Count } from "@/components/common/numbers";
import type { ShopInsights } from "@/lib/insights/types";
import { useOwnerToken } from "./use-owner-token";

/** Slow refresh while the counter is open (AI searches send no pings). */
const REFRESH_MS = 30_000;

const FIGURES = [
  { key: "shown", label: "Shown", sr: "AI searches that showed your shop" },
  { key: "matched", label: "Matched", sr: "searches that matched your menu" },
  { key: "ordered", label: "Ordered", sr: "orders" },
] as const;

/** Today's insights for the shop (owner token required), or null when they can't be loaded. */
async function fetchInsights(slug: string, token: string): Promise<ShopInsights | null> {
  try {
    const res = await fetch(`/api/shops/${slug}/insights`, { headers: { "x-owner-token": token }, cache: "no-store" });
    return res.ok ? ((await res.json()) as ShopInsights) : null;
  } catch {
    return null;
  }
}

/**
 * "What AI shoppers asked" (CONTRACTS §16): today's AI searches that showed the
 * shop, matched its menu, and ordered, plus what people asked for nearby that
 * the menu doesn't have. It refreshes when the counter sees an order land or
 * change, every 30 s, and when the owner comes back to the tab.
 */
export function InsightsPanel({ slug, orders }: { slug: string; orders: readonly { id: string; status: string }[] }) {
  const token = useOwnerToken(slug);
  const [data, setData] = useState<ShopInsights | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const ordersKey = orders.map((o) => `${o.id}:${o.status}`).join("|");

  const refresh = useEffectEvent(() => {
    if (!token || busy.current) return;
    busy.current = true;
    void fetchInsights(slug, token).then((next) => {
      busy.current = false;
      if (next) setData(next);
      setFailed(next === null);
    });
  });

  // First load, and again whenever an order lands or changes on the counter.
  useEffect(() => {
    void refresh();
  }, [token, ordersKey]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const unmet = data?.unmet ?? [];
  const flagged = unmet.filter((u) => u.nobody_nearby).length;
  const allFlagged = unmet.length > 0 && flagged === unmet.length;
  const note = "text-[15px] leading-snug text-ink-muted lg:text-[16px]";

  return (
    <section aria-labelledby="counter-insights" className="mt-16">
      <h2 id="counter-insights" className="border-b border-ink/15 pb-3 font-display text-[24px] leading-none lg:text-[26px]">
        What AI shoppers asked
      </h2>

      <div className="paper mt-8 px-6 pb-7 pt-6 shadow-slip">
        <p className="label-print text-[13px] text-ink-muted">Today</p>
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {FIGURES.map((f) => (
            <div key={f.key} className="flex flex-col-reverse items-center text-center">
              <dt className="label-print mt-2.5 text-[13px] text-ink-muted">
                {f.label}
                <span className="sr-only">: {f.sr} today</span>
              </dt>
              <dd className="font-figures text-[44px] leading-none text-ink lg:text-[48px]">
                {data ? <Count value={data[f.key]} /> : <span className="text-ink-muted">—</span>}
              </dd>
            </div>
          ))}
        </dl>

        <div aria-hidden className="print-rule my-6" />

        {!data ? (
          <p className={note}>{failed ? "Couldn’t count today’s searches. Trying again soon." : "Counting today’s searches…"}</p>
        ) : unmet.length ? (
          <>
            <p className="label-print text-[13px] text-ink-muted">Not on your menu</p>
            <ol className="mt-3.5 space-y-2.5" aria-label="Asked for near you, not on your menu">
              {unmet.map((u, i) => (
                <li key={u.ask} className="ink-rise" style={{ "--rise-delay": `${i * 0.08}s` } as React.CSSProperties}>
                  <p className="flex items-baseline gap-2">
                    <span className="min-w-0 text-[16px] leading-snug text-ink [overflow-wrap:anywhere]">{u.ask}</span>
                    <span aria-hidden className="leader" />
                    <span className="sr-only">asked</span>
                    <Count value={u.count} className="shrink-0 font-mono text-[16px] text-ink" />
                    <span className="sr-only">{u.count === 1 ? "time" : "times"}</span>
                  </p>
                  {!allFlagged && u.nobody_nearby ? <p className={note}>No shop nearby had it</p> : null}
                </li>
              ))}
            </ol>
            {allFlagged ? (
              <p className={`mt-4 ${note}`}>{unmet.length === 1 ? "No shop nearby had it either." : "No shop nearby had these either."}</p>
            ) : null}
          </>
        ) : (
          <p className={note}>
            {data.shown ? "Every search that showed your shop matched your menu." : "No AI searches have shown your shop yet today."}
          </p>
        )}
      </div>

      <p className={`mt-4 ${note}`}>Counted anonymously. No shopper details.</p>
    </section>
  );
}
