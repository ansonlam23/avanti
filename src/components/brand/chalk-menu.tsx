"use client";

import { motion } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatPriceShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, sec } from "./motion-prefs";
import { runReveal } from "./print-feed";
import { hashSeed, rng, roughStrike } from "./rough";
import { Stamp } from "./stamp";

// CONTRACT (props are frozen; optional props may be added). The chalkboard
// became a printed slip and then an ink menu card; the names stay so every
// caller keeps working.
export interface ChalkMenuItem {
  id: string;
  name: string;
  price_cents: number | null; // null → a small vermilion "Needs a price" seal
  tags?: string[];
  sold_out?: boolean;
  note?: string | null; // e.g. English name under a Vietnamese name
}

export interface ChalkMenuProps {
  title?: string;
  items: ChalkMenuItem[];
  highlightId?: string | null; // e.g. the item the shopper is asking about
  className?: string;
  /** Write the menu in line by line (a fixed script; remount to replay). */
  animateIn?: boolean;
  /** Soft sound while the lines arrive, when sound is globally on. Default true. */
  sound?: boolean;
  /** Kept for callers. Ink cards lie square, so it's ignored. */
  tilt?: number;
}
export type MenuSlipProps = ChalkMenuProps;

const EASE_INK = [0.22, 1, 0.36, 1] as const;

/**
 * The shop's menu on a paper card: the title in Marcellus, one line per item
 * with a dotted leader and a Red Hat Mono price. A missing price gets a small
 * vermilion "Needs a price" seal; a sold-out line is struck through with the
 * owner's brush and "sold out" brushed beside it; the item a shopper asks
 * about gets a teal wash. animateIn: the lines rise in one after another.
 */
export function ChalkMenu({ title = "Today", items, highlightId, className, animateIn, sound = true }: ChalkMenuProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [writing, setWriting] = useState(!!animateIn);

  // Write once per mount.
  useLayoutEffect(() => {
    if (!writing) return;
    const paper = paperRef.current;
    if (!paper) return;
    return runReveal(paper, { sound, step: 0.08, done: () => setWriting(false) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className={cn("relative w-full", className)} aria-label={`${title} menu`}>
      <div ref={paperRef} data-revealing={writing ? "true" : undefined} className="paper relative px-6 pb-7 pt-6 shadow-slip">
        <h3 data-row className="text-center font-display text-[26px] leading-[1.1] text-balance">
          {title}
        </h3>
        <div aria-hidden data-row className="print-rule mb-4 mt-4" />
        <ul className="space-y-3.5">
          {items.map((item) => (
            <MenuLine key={item.id} item={item} highlighted={highlightId === item.id} />
          ))}
        </ul>
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
          <span className={cn("relative text-[16px] leading-snug [overflow-wrap:anywhere]", soldOut && "text-ink-muted")}>
            {item.name}
          </span>
        </span>
        {needsPrice && !soldOut ? (
          <Stamp kind="HELD" text="Needs a price" size="sm" className="ml-auto shrink-0 self-center text-[14px]" sound={false} />
        ) : (
          <>
            <span aria-hidden className="leader" />
            <span className={cn("shrink-0 font-mono text-[15px] tabular-nums", soldOut && "text-ink-muted")}>
              {formatPriceShort(item.price_cents)}
            </span>
          </>
        )}
        {soldOut ? <Strike key={strikeTake} seed={hashSeed(item.id + ":strike")} draw={strikeTake > 0} /> : null}
      </div>
      {soldOut ? (
        <motion.p
          key={strikeTake}
          className="pen -mb-1 mt-1 w-fit text-[26px]"
          initial={strikeTake > 0 ? { opacity: 0, clipPath: "inset(0 100% 0 0)" } : false}
          animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: dur(0.5), delay: dur(0.3), ease: "linear" }}
        >
          sold out
        </motion.p>
      ) : sub ? (
        <p className="mt-0.5 text-[15px] leading-snug text-ink-muted">{sub}</p>
      ) : null}
    </li>
  );
}

/** The teal wash behind the item a shopper is asking about. */
function Highlight() {
  return (
    <motion.span
      aria-hidden
      className="absolute -inset-x-1.5 inset-y-[-1px] origin-left bg-highlight mix-blend-multiply"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: dur(0.6), ease: EASE_INK }}
    />
  );
}

/** Measures the parent box (for the brush strike drawn through it). */
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

/** Sold out: the owner's brush strikes through the whole line. */
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
          strokeWidth="2.4"
          strokeLinecap="round"
          initial={draw ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={{ duration: dur(0.45), ease: EASE_INK }}
        />
      ) : null}
    </svg>
  );
}

/** A duration at retake speed, or 0 under reduced motion (markup never changes, only timing). */
function dur(seconds: number): number {
  return prefersReducedMotion() ? 0 : sec(seconds);
}
