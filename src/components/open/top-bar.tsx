"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_BAR, AppLogo, SiteMenu } from "@/components/brand";
import { cn } from "@/lib/utils";
import { INK_EASE } from "./ink";

// The way through /open: the avanti logo home and three quiet steps.
// Phone: three short ink rules. Laptop: the steps by name, a teal rule under
// the one you're on (it glides to the next step).

const STEPS = ["Photo", "Menu", "Open"] as const;

export function StepBars({ done, current }: { done: number; current: number }) {
  const at = Math.min(current, STEPS.length - 1);
  return (
    <div
      role="progressbar"
      aria-label={`Step ${at + 1} of ${STEPS.length}: ${STEPS[at]}`}
      aria-valuemin={0}
      aria-valuemax={STEPS.length}
      aria-valuenow={done}
      className="flex items-center"
    >
      {/* phone */}
      <span aria-hidden className="flex items-center gap-1.5 lg:hidden">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={cn("block h-[2px] w-6 transition-colors duration-700", i <= current ? "bg-carbon" : "bg-ink/15")}
          />
        ))}
      </span>
      {/* laptop */}
      <span aria-hidden className="hidden items-center gap-4 lg:flex xl:gap-5">
        {STEPS.map((label, i) => {
          const finished = i < done;
          const active = i === current && i >= done;
          return (
            <span key={label} className="flex items-center gap-4 xl:gap-5">
              {i > 0 ? <span className={cn("block h-px w-8 xl:w-10", finished || active ? "bg-ink/35" : "bg-ink/15")} /> : null}
              <span
                className={cn(
                  "relative inline-flex items-center gap-1.5 py-2 text-[16px] leading-none",
                  active ? "font-semibold text-ink" : finished ? "text-ink" : "text-ink-muted",
                )}
              >
                {finished ? <Check className="size-4 text-carbon" strokeWidth={2} /> : null}
                {label}
                {active ? (
                  <motion.span
                    layoutId="open-step-rule"
                    className="absolute inset-x-0 -bottom-1 h-[2px] bg-carbon"
                    transition={{ duration: 0.7, ease: INK_EASE }}
                  />
                ) : null}
              </span>
            </span>
          );
        })}
      </span>
    </div>
  );
}

/** True once the page has scrolled (the phone header then gets its paper behind it). */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return scrolled;
}

export function TopBar({ done, current }: { done: number; current: number }) {
  const scrolled = useScrolled();
  return (
    <>
      {/* phones: only the logo + step marks stay pinned (paper behind them once the page scrolls);
          laptops: one row, not pinned, the steps centred and the menu in the third column */}
      <header
        className={cn(
          "sticky top-0 z-40 flex items-center justify-between gap-x-3",
          APP_BAR,
          scrolled ? "bg-counter shadow-[0_1px_0_rgb(22_58_66/0.1)]" : "bg-transparent",
          "lg:static lg:grid lg:grid-cols-[1fr_auto_1fr] lg:bg-transparent lg:pb-6 lg:shadow-none",
        )}
      >
        <AppLogo section="shop" className="justify-self-start" />
        <StepBars done={done} current={current} />
        <SiteMenu current="sell" className="hidden lg:flex lg:justify-self-end" />
      </header>
      {/* phones: the menu's own row under the pinned bar; it scrolls away with the page */}
      <div className="px-5 pb-3 sm:px-8 lg:hidden">
        <SiteMenu current="sell" />
      </div>
    </>
  );
}
