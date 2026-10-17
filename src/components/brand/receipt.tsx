"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Money } from "@/components/common/numbers";
import { formatCents } from "@/lib/format";
import type { OrderStatus, PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Barcode } from "./barcode-svg";
import { ms, prefersReducedMotion } from "./motion-prefs";
import { runReveal } from "./print-feed";
import { sfx } from "./sfx";
import { SimulatedBadge, Stamp, type StampKind } from "./stamp";

// CONTRACT (props are frozen; optional props may be added).
export interface ReceiptLine {
  label: string;
  qty?: number;
  amount_cents: number;
}

export interface ReceiptProps {
  shopName: string;
  lines: ReceiptLine[];
  total_cents: number;
  status: OrderStatus;
  mode: PaymentMode;
  pickupCode?: string | null;
  orderId?: string | null;
  cardLast4?: string | null;
  time?: string | null; // preformatted, e.g. "Pickup 5:30 PM"
  /** Write the slip in, line by line (first appearance). */
  printing?: boolean;
  className?: string;
  /** Prints a scannable barcode of the pickup code next to it (any truthy value). */
  qrValue?: string | null;
  /** Fires once the script (lines → count → seal) has finished. */
  onPrinted?: () => void;
  /** Soft sounds (lines, seal) when sound is globally on. Default true. */
  sound?: boolean;
  /** Kept for callers. Ink slips lie square, so it's ignored. */
  tilt?: number;
}

/** Seals keep history: a paid receipt still shows the HELD it went through. */
const HISTORY: Record<OrderStatus, StampKind[]> = {
  pending: [],
  held: ["HELD"],
  paid: ["HELD", "PAID"],
  released: ["HELD", "RELEASED"],
  failed: ["FAILED"],
};

/** Money in plain words, one short line. */
const LINE: Record<OrderStatus, string> = {
  pending: "Placing the hold…",
  held: "Held, not charged.",
  paid: "Charged at pickup.",
  released: "Hold released. Not charged.",
  failed: "Didn't go through. Not charged.",
};

/** Where each seal in the history lands (older first): left of the total. */
const STAMP_SPOT = ["left-0 -top-2", "left-6 top-1"];

const COUNT_HOLD = 0.95; // NumberFlow's roll before the seal

type Phase = "feed" | "count" | "stamp" | "done";

/**
 * A receipt as a clean paper slip: square, a 1px ink hairline, the shop in
 * Marcellus, Red Hat Mono amounts on dotted leaders, the total large with
 * its vermilion seal beside it. Script (printing=true): the lines rise in one
 * after another → the total counts up from $0.00 → the seal is pressed.
 * When `status` changes while mounted (held → paid / released) the new seal
 * lands over the old one, which stays visible, faded. The honest footer is
 * always there.
 */
export function Receipt({
  shopName,
  lines,
  total_cents,
  status,
  mode,
  pickupCode,
  cardLast4,
  time,
  printing,
  className,
  qrValue,
  onPrinted,
  sound = true,
}: ReceiptProps) {
  const [phase, setPhase] = useState<Phase>(printing ? "feed" : "done");
  const [seen, setSeen] = useState(status);
  const [fresh, setFresh] = useState<StampKind | null>(printing ? (HISTORY[status].at(-1) ?? null) : null);
  if (status !== seen) {
    // Status changed while mounted: the newest seal lands over the old ones.
    setSeen(status);
    setFresh(HISTORY[status].at(-1) ?? null);
  }

  const paperRef = useRef<HTMLElement>(null);
  const onPrintedRef = useRef(onPrinted);
  useLayoutEffect(() => {
    onPrintedRef.current = onPrinted;
  });

  // 1 · the lines rise in, one after another.
  useLayoutEffect(() => {
    if (phase !== "feed") return;
    const paper = paperRef.current;
    if (!paper) return;
    const reduced = prefersReducedMotion();
    return runReveal(paper, {
      sound,
      done: () => {
        if (sound && !reduced) sfx.play("tear", { gain: 0.35 });
        setPhase(reduced ? "done" : "count");
      },
    });
  }, [phase, sound]);

  // 2 · count: the total rolls up from $0.00, then 3 · the seal is pressed.
  useEffect(() => {
    if (phase === "count") {
      const t = setTimeout(() => setPhase("stamp"), ms(COUNT_HOLD));
      return () => clearTimeout(t);
    }
    if (phase === "stamp" && !fresh) {
      const t = setTimeout(() => setPhase("done"), 0);
      return () => clearTimeout(t);
    }
  }, [phase, fresh]);

  useEffect(() => {
    if (phase === "done" && printing) onPrintedRef.current?.();
  }, [phase, printing]);

  // The seal has met the paper: the script is over once its ink settles.
  const landed = () => {
    if (phase === "stamp") setTimeout(() => setPhase("done"), ms(0.3));
  };

  const history = HISTORY[status];
  const showStamps = phase === "stamp" || phase === "done";
  const shownTotal = phase === "feed" ? 0 : total_cents;
  const simulated = mode === "simulated";
  const muted = status === "released" || status === "failed";

  return (
    <div className={cn("relative w-[312px] text-left", className)}>
      <article
        ref={paperRef}
        data-revealing={printing && phase === "feed" ? "true" : undefined}
        className="paper relative px-6 pb-6 pt-6 font-sans text-[16px] leading-[1.5] shadow-slip"
        aria-label={`Receipt from ${shopName}: ${status === "pending" ? "total" : status} ${formatCents(total_cents)}`}
      >
        <header data-row className="text-center">
          <p className="font-display text-[26px] leading-[1.1] text-balance">{shopName}</p>
          {time ? <p className="mt-1.5 text-[15px] text-ink-muted">{time}</p> : null}
        </header>

        <div data-row className="print-rule my-4" />

        {lines.map((l, i) => (
          <p key={i} data-row className="flex items-baseline gap-2">
            <span className="min-w-0">
              {l.qty && l.qty > 1 ? <span className="font-mono text-[15px]">{l.qty}× </span> : null}
              {l.label}
            </span>
            <span aria-hidden className="leader" />
            <span className="shrink-0 font-mono text-[15px] tabular-nums">{formatCents(l.amount_cents)}</span>
          </p>
        ))}

        <div data-row className="print-rule my-4" />

        {/* The total: the seal on the left, the money on the right. */}
        <div data-row className="relative flex min-h-[60px] items-end justify-end">
          <Money
            cents={shownTotal}
            className={cn("font-figures text-[46px] leading-[0.9]", muted ? "text-ink-muted" : "text-ink")}
          />
          {showStamps
            ? history.map((k, i) => {
                const top = i === history.length - 1;
                return (
                  <Stamp
                    key={k}
                    kind={k}
                    size={k === "RELEASED" ? "sm" : "md"}
                    faded={!top}
                    animate={top && fresh === k}
                    onSlam={top && fresh === k ? landed : undefined}
                    sound={sound}
                    className={cn("absolute z-10", STAMP_SPOT[i] ?? STAMP_SPOT[0])}
                  />
                );
              })
            : null}
        </div>
        <p data-row className="mt-2.5 text-right text-[15px] text-ink-muted">
          {LINE[status]}
        </p>

        {pickupCode ? (
          <div data-row className="mt-5 flex items-center justify-between gap-3 px-4 py-3 outline outline-1 -outline-offset-1 outline-ink/25">
            <p>
              <span className="label-print block text-[13px] text-ink-muted">Pickup code</span>
              <span className="dot mt-1.5 block text-[38px] text-ink">{pickupCode}</span>
            </p>
            {qrValue ? <Barcode value={pickupCode} height={42} moduleWidth={1.1} label={`Barcode for pickup code ${pickupCode}`} /> : null}
          </div>
        ) : null}

        {/* Honest footer: always there, never hidden. */}
        <p data-row className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-[14px] leading-snug text-ink-muted">
          {simulated ? (
            <>
              <SimulatedBadge />
              <span>No Visa call · no money moved</span>
            </>
          ) : (
            <span>Test card{cardLast4 ? ` ···· ${cardLast4}` : ""} · Visa sandbox · no money moved</span>
          )}
        </p>
      </article>
    </div>
  );
}
