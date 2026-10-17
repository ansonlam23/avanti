"use client";

import { motion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatPriceShort } from "@/lib/format";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { PrinterMouth } from "./barcode-svg";
import { prefersReducedMotion, sec } from "./motion-prefs";
import { runFeed } from "./print-feed";
import { hashSeed, rng, roughStrike } from "./rough";
import { Stamp } from "./stamp";

// CONTRACT (props are frozen; optional props may be added). The chalkboard
// became a printed menu slip; the names stay so every caller keeps working.
export interface ChalkMenuItem {
  id: string;
  name: string;
  price_cents: number | null; // null → a red NEEDS A PRICE stamp
  tags?: string[];
  sold_out?: boolean;
  note?: string | null; // e.g. English name under a Vietnamese name
}

export interface ChalkMenuProps {
  title?: string;
  items: ChalkMenuItem[];
  highlightId?: string | null; // e.g. the item the shopper is asking about
  className?: string;
  /** Print the slip line by line out of the printer (a fixed script; remount to replay). */
  animateIn?: boolean;
  /** Printer chatter while printing, when sound is globally on. Default true. */
  sound?: boolean;
  /** Resting angle on the counter in degrees (default 0.5; paper is never square). */
  tilt?: number;
}
export type MenuSlipProps = ChalkMenuProps;

/**
 * The shop's menu, printed on a thermal slip with torn ends. Receipt lines
 * with dotted leaders; a missing price gets a red NEEDS A PRICE stamp; a
 * sold-out line is struck through in the owner's blue pen with "sold out"
 * written beside it; the item a shopper asks about gets a highlighter swipe.
 * animateIn: the slip feeds out of the printer one line at a time.
 */
export function ChalkMenu({ title = "Today", items, highlightId, className, animateIn, sound = true, tilt = 0.5 }: ChalkMenuProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(!!animateIn);

  // Print once per mount.
  useLayoutEffect(() => {
    if (!printing) return;
    const paper = paperRef.current;
    if (!paper) return;
    return runFeed(paper, {
      sound,
      from: 10,
      apply: (px) => {
        paper.style.clipPath = `inset(0 0 calc(100% - ${px.toFixed(1)}px) 0)`;
      },
      done: () => {
        paper.style.removeProperty("clip-path");
        setPrinting(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className={cn("relative w-full", className)} aria-label={`${title} menu`}>
      {animateIn ? <PrinterMouth gone={!printing} /> : null}
      <div
        className="slip-drop transition-[rotate] duration-500 ease-[cubic-bezier(0.19,1.51,0.29,0.99)]"
        style={{ rotate: `${printing ? 0 : tilt}deg` }}
      >
        <div
          ref={paperRef}
          className="paper edge-torn-y relative px-6 pb-8 pt-8"
          style={printing ? { clipPath: "inset(0 0 100% 0)" } : undefined}
        >
          <h3 data-row className="thermal text-center font-display text-[30px] font-extrabold uppercase leading-[0.95] text-balance">
            {title}
          </h3>
          <div aria-hidden className="print-rule mb-4 mt-4" />
          <ul className="space-y-3.5">
            {items.map((item) => (
              <MenuLine key={item.id} item={item} highlighted={highlightId === item.id} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Same component, its D-era name. */
export const MenuSlip = ChalkMenu;

function MenuLine({ item, highlighted }: { item: ChalkMenuItem; highlighted: boolean }) {
  // A strike drawn while you watch (not when the menu loads already sold out).
  const [strikeTake, setStrikeTake] = useState(0);
  const [prevSoldOut, setPrevSoldOut] = useState(!!item.sold_out);
  if (!!item.sold_out !== prevSoldOut) {
    setPrevSoldOut(!!item.sold_out);
    if (item.sold_out) setStrikeTake((t) => t + 1);
  }
  const soldOut = !!item.sold_out;
  const needsPrice = item.price_cents === null;
  const sub = item.note ?? (item.tags?.length ? item.tags.join(" · ") : null);

  return (
    <li data-row className="relative">
      <div className="relative flex items-baseline gap-2">
        <span className="relative min-w-0">
          {highlighted ? <Highlight /> : null}
          <span className={cn("relative text-[16px] uppercase leading-snug [overflow-wrap:anywhere]", soldOut && "text-ink-muted")}>
            {item.name}
          </span>
        </span>
        {needsPrice && !soldOut ? (
          <Stamp kind="HELD" text="Needs a price" size="sm" className="ml-auto shrink-0 self-center" sound={false} />
        ) : (
          <>
            <span aria-hidden className="leader" />
            <span className={cn("shrink-0 text-[16px] font-bold tabular-nums", soldOut && "text-ink-muted")}>
              {formatPriceShort(item.price_cents)}
            </span>
          </>
        )}
        {soldOut ? <Strike key={strikeTake} seed={hashSeed(item.id + ":strike")} draw={strikeTake > 0} /> : null}
      </div>
      {soldOut ? (
        <motion.p
          key={strikeTake}
          className="pen -mb-1 mt-0.5 w-fit origin-left rotate-[-2.5deg] text-[30px]"
          initial={strikeTake > 0 ? { opacity: 0, clipPath: "inset(0 100% 0 0)" } : false}
          animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: dur(0.45), delay: dur(0.3), ease: "linear" }}
        >
          sold out
        </motion.p>
      ) : sub ? (
        <p className="mt-0.5 text-[14px] leading-snug text-ink-muted">{sub}</p>
      ) : null}
    </li>
  );
}

/** The highlighter swipe behind the item a shopper is asking about. */
function Highlight() {
  return (
    <motion.span
      aria-hidden
      className="absolute -inset-x-1.5 inset-y-[-1px] origin-left -rotate-[0.6deg] rounded-[2px] bg-highlight mix-blend-multiply"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: dur(0.42), ease: EASE.out }}
    />
  );
}

/** Measures the parent box (for the pen strike drawn through it). */
function useParentWidth<T extends Element>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Sold out: the owner's blue pen strikes through the whole line. */
function Strike({ seed, draw }: { seed: number; draw: boolean }) {
  const [ref, w] = useParentWidth<SVGSVGElement>();
  const d = useMemo(() => (w ? roughStrike(w, 0, rng(seed)) : ""), [w, seed]);
  return (
    <svg ref={ref} aria-hidden className="pointer-events-none absolute inset-x-0 top-[55%] h-px overflow-visible">
      {d ? (
        <motion.path
          d={d}
          fill="none"
          stroke="var(--color-carbon)"
          strokeWidth="2.6"
          strokeLinecap="round"
          initial={draw ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: dur(0.35), ease: EASE.out }}
        />
      ) : null}
    </svg>
  );
}

/** A duration at retake speed, or 0 under reduced motion (markup never changes, only timing). */
function dur(seconds: number): number {
  return prefersReducedMotion() ? 0 : sec(seconds);
}
