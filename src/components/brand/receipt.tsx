"use client";

import { useAnimate } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Money } from "@/components/common/numbers";
import { formatCents } from "@/lib/format";
import type { OrderStatus, PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Barcode, PrinterMouth } from "./barcode-svg";
import { ms, prefersReducedMotion, sec } from "./motion-prefs";
import { runFeed } from "./print-feed";
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
  /** Animate the receipt printing line by line (first appearance). */
  printing?: boolean;
  className?: string;
  /** Prints a scannable barcode of the pickup code next to it (any truthy value). */
  qrValue?: string | null;
  /** Fires once the print script (feed → count → stamp) has finished. */
  onPrinted?: () => void;
  /** Printer chatter + tear + stamp thunk when sound is globally on. Default true. */
  sound?: boolean;
  /** Resting angle on the counter in degrees (default −0.6; paper is never square). */
  tilt?: number;
}

/** Stamps keep history: a paid receipt still shows the HELD it went through. */
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

/** Where each stamp in the history lands (older first): left of the total. */
const STAMP_SPOT = ["left-0 -top-3", "left-7 top-1"];

const COUNT_HOLD = 0.95; // NumberFlow's roll before the stamp

type Phase = "feed" | "count" | "stamp" | "done";

/**
 * A thermal receipt. Print script (printing=true): the paper feeds out of the
 * printer's mouth row by row (≈75 ms each, tiny print-head jitter) and is torn
 * off → the total counts up from $0.00 → the stamp thunks down → the receipt
 * shakes. When `status` changes while mounted (held → paid / released) the new
 * stamp lands over the old one, which stays visible, faded. The honest footer
 * is always printed.
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
  tilt = -0.6,
}: ReceiptProps) {
  const [phase, setPhase] = useState<Phase>(printing ? "feed" : "done");
  const [seen, setSeen] = useState(status);
  const [fresh, setFresh] = useState<StampKind | null>(printing ? (HISTORY[status].at(-1) ?? null) : null);
  if (status !== seen) {
    // Status changed while mounted: the newest stamp lands over the old ones.
    setSeen(status);
    setFresh(HISTORY[status].at(-1) ?? null);
  }

  const [scope, run] = useAnimate<HTMLDivElement>();
  const paperRef = useRef<HTMLElement>(null);
  const onPrintedRef = useRef(onPrinted);
  useLayoutEffect(() => {
    onPrintedRef.current = onPrinted;
  });

  // 1 · feed: the paper comes out row by row (JS-driven so it works on iOS Safari).
  useLayoutEffect(() => {
    if (phase !== "feed") return;
    const paper = paperRef.current;
    if (!paper) return;
    const reduced = prefersReducedMotion();
    return runFeed(paper, {
      sound,
      from: 14,
      apply: (px) => paper.style.setProperty("--feed", `${px}px`),
      done: () => {
        paper.style.removeProperty("--feed");
        if (sound && !reduced) sfx.play("tear", { gain: 0.7 });
        setPhase(reduced ? "done" : "count");
      },
    });
  }, [phase, sound]);

  // 2 · count: the total rolls up from $0.00, then 3 · the stamp lands.
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

  const shake = () => {
    if (!scope.current || prefersReducedMotion()) return;
    run(scope.current, { x: [0, -3, 3, -2, 1, 0], rotate: [0, -0.5, 0.4, -0.2, 0] }, { duration: sec(0.3) });
    if (phase === "stamp") setTimeout(() => setPhase("done"), ms(0.3));
  };

  const history = HISTORY[status];
  const showStamps = phase === "stamp" || phase === "done";
  const shownTotal = phase === "feed" ? 0 : total_cents;
  const simulated = mode === "simulated";

  return (
    <div ref={scope} className={cn("relative w-[312px] text-left", className)}>
      {printing ? <PrinterMouth gone={phase !== "feed"} /> : null}
      {/* straight while it's in the printer; settles to its angle once torn off */}
      <div
        className="slip-drop transition-[rotate] duration-500 ease-[cubic-bezier(0.19,1.51,0.29,0.99)]"
        style={{ rotate: `${printing && phase === "feed" ? 0 : tilt}deg` }}
      >
        <article
          ref={paperRef}
          className="receipt-paper paper px-6 pb-7 pt-7 font-sans text-[15px] leading-[1.5]"
          style={printing && phase === "feed" ? ({ "--feed": "14px" } as CSSProperties) : undefined}
          aria-label={`Receipt from ${shopName}: ${status === "pending" ? "total" : status} ${formatCents(total_cents)}`}
        >
          <header data-row className="text-center">
            <p className="thermal font-display text-[30px] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-balance">
              {shopName}
            </p>
            {time ? <p className="mt-1.5 text-[14px] text-ink-muted">{time}</p> : null}
          </header>

          <div className="print-rule my-4" />

          {lines.map((l, i) => (
            <p key={i} data-row className="flex items-baseline gap-2">
              <span className="min-w-0">
                {l.qty && l.qty > 1 ? `${l.qty}× ` : ""}
                {l.label}
              </span>
              <span aria-hidden className="leader" />
              <span className="shrink-0 tabular-nums">{formatCents(l.amount_cents)}</span>
            </p>
          ))}

          <div className="print-rule my-4" />

          {/* The total: the stamp on the left, the money on the right. */}
          <div data-row className="relative flex min-h-[64px] items-end justify-end">
            <Money
              cents={shownTotal}
              className={cn(
                "thermal font-display text-[clamp(44px,14vw,56px)] font-black leading-[0.82] tracking-[-0.005em]",
                status === "released" || status === "failed" ? "text-ink-muted" : "text-ink",
              )}
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
                      onSlam={top && fresh === k ? shake : undefined}
                      sound={sound}
                      className={cn("absolute z-10", STAMP_SPOT[i] ?? STAMP_SPOT[0])}
                    />
                  );
                })
              : null}
          </div>
          <p data-row className="mt-2.5 text-right text-[14px] text-ink-muted">
            {LINE[status]}
          </p>

          {pickupCode ? (
            <div data-row className="mt-5 flex items-center justify-between gap-3 rounded-[2px] border-2 border-ink px-3.5 py-2.5">
              <p>
                <span className="label-print block text-ink-muted">Pickup code</span>
                <span className="dot mt-1 block text-[44px] text-ink">{pickupCode}</span>
              </p>
              {qrValue ? <Barcode value={pickupCode} height={44} moduleWidth={1.12} label={`Barcode for pickup code ${pickupCode}`} /> : null}
            </div>
          ) : null}

          {/* Honest footer: always printed, never hidden. */}
          <p data-row className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[14px] leading-snug text-ink-muted">
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
    </div>
  );
}
