"use client";

import { animate } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatPriceShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Barcode } from "./barcode-svg";
import { prefersReducedMotion, sec } from "./motion-prefs";
import { hashSeed, rng, roughStrike } from "./rough";
import { Stamp } from "./stamp";

// CONTRACT (props are frozen; optional props may be added).
export interface PriceTagProps {
  price_cents: number | null;
  label?: string; // item name on the label
  variant?: "default" | "needs-price" | "sold-out";
  className?: string;
  /** Rise the label in when it appears; pass a number and bump it to do it again. */
  swing?: boolean | number;
  /** Kept for callers. Ink labels lie square, so it's ignored. */
  tilt?: number;
}

/**
 * A small paper price label: the item, the price in Marcellus and a real
 * barcode of the price, drawn with the ink hairline. It rises in calmly
 * (0.6 s). A missing price gets the vermilion "Needs a price" seal; sold out
 * is struck through with the owner's brush.
 */
export function PriceTag({ price_cents, label, variant, className, swing }: PriceTagProps) {
  const v = variant ?? (price_cents === null ? "needs-price" : "default");
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hidden] = useState(() => !!swing);
  const strike = useMemo(() => roughStrike(120, 0, rng(hashSeed(label ?? "tag"))), [label]);
  const price = formatPriceShort(price_cents);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (!swing || prefersReducedMotion()) {
      body.style.opacity = "1";
      body.style.transform = "none";
      return;
    }
    const rise = animate(body, { y: [10, 0], opacity: [0, 1] }, { duration: sec(0.6), ease: [0.22, 1, 0.36, 1] });
    return () => rise.stop();
    // Rise again whenever `swing` changes (true on mount, or a bumped number).
  }, [swing]);

  return (
    <div
      className={cn("relative inline-block w-[156px] align-top", className)}
      role="img"
      aria-label={`${label ? `${label}: ` : ""}${v === "needs-price" ? "needs a price" : v === "sold-out" ? "sold out" : price}`}
    >
      <div ref={bodyRef} className="paper relative px-3.5 pb-3 pt-3 shadow-slip" style={hidden ? { opacity: 0 } : undefined}>
        {label ? <p className="line-clamp-2 text-[14px] font-semibold leading-tight">{label}</p> : null}
        {v === "needs-price" ? (
          <div className="flex min-h-[54px] items-center justify-center">
            <Stamp kind="HELD" text="Needs a price" size="sm" sound={false} className="text-[12px]" />
          </div>
        ) : (
          <div className="relative mt-1.5">
            <p className={cn("font-display text-[40px] leading-[1] tabular-nums", v === "sold-out" && "text-ink-muted")}>{price}</p>
            {v === "sold-out" ? (
              <>
                <svg aria-hidden viewBox="-6 -8 132 16" className="absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 overflow-visible" preserveAspectRatio="none">
                  <path d={strike} fill="none" stroke="var(--color-carbon)" strokeWidth="2.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="pen absolute -right-1 -top-3 text-[26px]">sold out</span>
              </>
            ) : null}
          </div>
        )}
        {price_cents !== null ? <Barcode value={price.replace("$", "")} height={18} moduleWidth={1} className="mt-2" label={`Barcode ${price}`} /> : null}
      </div>
    </div>
  );
}
