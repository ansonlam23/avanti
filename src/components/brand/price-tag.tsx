"use client";

import { animate } from "motion/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatPriceShort } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Barcode } from "./barcode-svg";
import { prefersReducedMotion, spring } from "./motion-prefs";
import { hashSeed, rng, roughStrike } from "./rough";
import { Stamp } from "./stamp";

// CONTRACT (props are frozen; optional props may be added).
export interface PriceTagProps {
  price_cents: number | null;
  label?: string; // item name printed on the label
  variant?: "default" | "needs-price" | "sold-out";
  className?: string;
  /** Slap the label down when it appears; pass a number and bump it to do it again. */
  swing?: boolean | number;
  /** Rest angle in degrees (default −3). */
  tilt?: number;
}

/**
 * A deli-scale price label: a small thermal sticker with the item, the price
 * in heavy type and a real barcode of the price. It lands like a sticker being
 * slapped on (a drop + an overshooting turn, SPRING.tag). A missing price gets
 * the red NEEDS A PRICE stamp; sold out is struck through in the owner's pen.
 */
export function PriceTag({ price_cents, label, variant, className, swing, tilt = -3 }: PriceTagProps) {
  const v = variant ?? (price_cents === null ? "needs-price" : "default");
  const bodyRef = useRef<HTMLDivElement>(null);
  const [first] = useState(() => (swing ? { y: -26, r: tilt + 14, o: 0 } : { y: 0, r: tilt, o: 1 }));
  const strike = useMemo(() => roughStrike(120, 0, rng(hashSeed(label ?? "tag"))), [label]);
  const price = formatPriceShort(price_cents);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (!swing || prefersReducedMotion()) {
      body.style.transform = `rotate(${tilt}deg)`;
      body.style.opacity = "1";
      return;
    }
    const land = animate(body, { y: [-26, 0], rotate: [tilt + 14, tilt] }, spring(SPRING.tag));
    const show = animate(body, { opacity: [0, 1] }, { duration: 0.12 });
    return () => {
      land.stop();
      show.stop();
    };
    // Slap again whenever `swing` changes (true on mount, or a bumped number).
  }, [swing, tilt]);

  return (
    <div
      className={cn("relative inline-block w-[156px] align-top", className)}
      role="img"
      aria-label={`${label ? `${label}: ` : ""}${v === "needs-price" ? "needs a price" : v === "sold-out" ? "sold out" : price}`}
    >
      <div
        ref={bodyRef}
        className="paper relative rounded-[5px] px-3.5 pb-3 pt-3 shadow-slip"
        style={{ transform: `translateY(${first.y}px) rotate(${first.r}deg)`, opacity: first.o }}
      >
        {label ? <p className="line-clamp-2 text-[14px] font-bold uppercase leading-tight tracking-[0.04em]">{label}</p> : null}
        {v === "needs-price" ? (
          <div className="flex min-h-[54px] items-center justify-center">
            <Stamp kind="HELD" text="Needs a price" size="sm" sound={false} />
          </div>
        ) : (
          <div className="relative mt-1">
            <p className={cn("thermal font-display text-[44px] font-black leading-[0.95] tabular-nums", v === "sold-out" && "text-ink-muted")}>
              {price}
            </p>
            {v === "sold-out" ? (
              <>
                <svg aria-hidden viewBox="-6 -8 132 16" className="absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 overflow-visible" preserveAspectRatio="none">
                  <path d={strike} fill="none" stroke="var(--color-carbon)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="pen absolute -right-1 -top-2 rotate-[-8deg] text-[28px]">sold out</span>
              </>
            ) : null}
          </div>
        )}
        {price_cents !== null ? <Barcode value={price.replace("$", "")} height={18} moduleWidth={1} className="mt-1.5" label={`Barcode ${price}`} /> : null}
      </div>
    </div>
  );
}
