"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Count } from "@/components/common/numbers";
import type { BlockReason } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClosedSign, REASON_LABEL } from "./closed-sign";
import { ms, prefersReducedMotion } from "./motion-prefs";

export interface BotWallProps {
  /** Total requests turned away (from the door log; never invented). */
  blocked: number;
  /** Totals per reason (optional): the Z-report lines, and the reason each slip carries. */
  reasons?: Partial<Record<BlockReason, number>>;
  /** Used for new slips when `reasons` isn't given. */
  lastReason?: BlockReason | null;
  /** Blocked requests that reached the payment step. The trust check runs first, so this is 0 by design; pass the real number. */
  reachedVisa?: number;
  /** Verified agents let in (optional third line). */
  verified?: number;
  className?: string;
  /** Slaps on the spindle when sound is globally on. Default true. */
  sound?: boolean;
}

const BURST = 2.2; // s to show a whole burst, however big
const MAX_LINES = 4; // reasons printed on the Z-report (the rest are summed)

/**
 * The bot-attack moment, as the door log's report. Each new blocked request
 * adds a REJECTED slip to the pile; the "turned away" count ticks up
 * (Count/NumberFlow) and the reason lines update. The hero number, in
 * Marcellus, is REACHED VISA: 0. A burst of 50 plays in ≈2.2 s. Counts start at
 * the current totals (history isn't replayed) and always settle on the real data.
 */
export function BotWall({ blocked, reasons, lastReason, reachedVisa = 0, verified, className, sound = true }: BotWallProps) {
  const [shown, setShown] = useState(blocked);
  const [byReason, setByReason] = useState<Partial<Record<BlockReason, number>>>(() => ({ ...(reasons ?? {}) }));
  const [hits, setHits] = useState(0);
  const [lastHitReason, setLastHitReason] = useState<BlockReason | null>(lastReason ?? null);
  const [busy, setBusy] = useState(false);

  const seen = useRef({ blocked, reasons: { ...(reasons ?? {}) } });
  const latest = useRef({ blocked, reasons });
  useLayoutEffect(() => {
    latest.current = { blocked, reasons };
  });
  const queue = useRef<BlockReason[]>([]);
  const pumping = useRef(false);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const ts = timers.current;
    return () => ts.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const prev = seen.current;
    const delta = blocked - prev.blocked;
    const nextReasons = { ...(reasons ?? {}) };
    seen.current = { blocked, reasons: nextReasons };
    if (delta < 0) {
      // The log was reset: show the real numbers, no replay.
      queue.current = [];
      later(settle, 0);
      return;
    }
    if (delta === 0) return;

    // Which reasons the new slips carry: the per-reason increase, interleaved.
    const pools: BlockReason[][] = [];
    for (const [r, n] of Object.entries(nextReasons) as [BlockReason, number][]) {
      const add = n - (prev.reasons[r] ?? 0);
      if (add > 0) pools.push(Array.from({ length: add }, () => r));
    }
    const incoming: BlockReason[] = [];
    while (incoming.length < delta && pools.some((p) => p.length)) {
      for (const p of pools) if (p.length && incoming.length < delta) incoming.push(p.pop()!);
    }
    while (incoming.length < delta) incoming.push(lastReason ?? "unsigned");

    if (prefersReducedMotion()) {
      later(() => {
        setLastHitReason(incoming[incoming.length - 1]);
        setHits((h) => h + 1);
        settle();
      }, 0);
      return;
    }
    queue.current.push(...incoming);
    pump(incoming.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // Reasons may arrive a render after the count: keep the baseline current.
  useEffect(() => {
    seen.current = { ...seen.current, reasons: { ...(reasons ?? {}) } };
  }, [reasons]);

  /** Snap the counters to the real data (end of a burst, resets, reduced motion). */
  function settle() {
    const { blocked: b, reasons: r } = latest.current;
    setShown(b);
    if (r) setByReason({ ...r });
  }

  function later(fn: () => void, wait: number) {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, wait);
    timers.current.add(t);
  }

  function pump(burst: number) {
    if (pumping.current) return;
    pumping.current = true;
    setBusy(true);
    const gap = Math.max(40, Math.min(380, ms(BURST) / Math.max(1, burst)));
    const step = () => {
      const reason = queue.current.shift();
      if (!reason) {
        pumping.current = false;
        later(() => {
          setBusy(false);
          settle(); // the final numbers are always the real ones
        }, ms(0.6));
        return;
      }
      setLastHitReason(reason);
      setHits((h) => h + 1);
      later(() => {
        setShown((s) => s + 1);
        setByReason((b) => ({ ...b, [reason]: (b[reason] ?? 0) + 1 }));
      }, ms(0.36)); // the count ticks as the slip lands
      later(step, gap);
    };
    step();
  }

  const rows = (Object.entries(byReason) as [BlockReason, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const lines = rows.slice(0, MAX_LINES);
  const rest = rows.slice(MAX_LINES).reduce((s, [, n]) => s + n, 0);

  return (
    <section className={cn("w-full text-left", className)} aria-label="Bots at the door">
      <div className="flex justify-center">
        <ClosedSign flips={hits} reason={lastHitReason} face="open" sound={sound} />
      </div>

      {/* The report: the hero number first. */}
      <div className="paper relative mt-2 px-6 pb-7 pt-7 shadow-slip">
        <div className="text-center">
          <Count value={reachedVisa} className="block font-display text-[104px] leading-[0.82] text-ink" />
          <p className="label-print mt-3 text-[14px] text-ink">Reached Visa</p>
        </div>
        <div aria-hidden className="print-rule my-5" />
        <p className="flex items-baseline gap-2">
          <span className="shrink-0 text-[16px] text-ink-muted">Turned away</span>
          <span aria-hidden className="leader" />
          <Count value={shown} className="dot shrink-0 text-[28px] leading-none text-ink" />
        </p>
        {verified !== undefined ? (
          <p className="mt-2.5 flex items-baseline gap-2">
            <span className="shrink-0 text-[16px] text-ink-muted">Verified, let in</span>
            <span aria-hidden className="leader" />
            <Count value={verified} className="dot shrink-0 text-[28px] leading-none text-ink" />
          </p>
        ) : null}

        {lines.length ? (
          <>
            <div aria-hidden className="print-rule my-4" />
            <ul className="space-y-1.5 text-[15px]" aria-label="Why they were turned away">
              {lines.map(([r, n]) => (
                <li key={r} className="flex items-baseline gap-2">
                  <span className="shrink-0">{REASON_LABEL[r]}</span>
                  <span aria-hidden className="leader" />
                  <Count value={n} className="shrink-0 font-mono" />
                </li>
              ))}
              {rest > 0 ? (
                <li className="flex items-baseline gap-2 text-ink-muted">
                  <span className="shrink-0">other</span>
                  <span aria-hidden className="leader" />
                  <Count value={rest} className="shrink-0 font-mono" />
                </li>
              ) : null}
            </ul>
          </>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {busy ? "Turning bots away" : `${shown} turned away, ${reachedVisa} reached Visa`}
      </p>
    </section>
  );
}
