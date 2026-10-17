"use client";

import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand";
import { cn } from "@/lib/utils";
import { INK_EASE } from "./ink";

// The way through /open: the wordmark home, four quiet steps and a real
// stopwatch (Red Hat Mono) that runs from the first tap until the shop opens.
// Phone: four short ink rules. Laptop: the steps by name, a teal rule under
// the one you're on (it glides to the next step).

const STEPS = ["Photo", "Prices", "Menu", "Open"] as const;

export function StepBars({ done, current }: { done: number; current: number }) {
  const at = Math.min(current, 3);
  return (
    <div
      role="progressbar"
      aria-label={`Step ${at + 1} of 4: ${STEPS[at]}`}
      aria-valuemin={0}
      aria-valuemax={4}
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

export function StopwatchChip({ ms, running, started }: { ms: number; running: boolean; started: boolean }) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return (
    <div
      aria-label={`Stopwatch ${m} minutes ${s} seconds`}
      className={cn(
        "inline-flex items-center gap-2.5 font-mono text-[18px] font-medium leading-none tabular-nums lg:text-[20px]",
        started ? "text-ink" : "text-ink-muted",
      )}
    >
      <span aria-hidden className={cn("size-1.5 bg-carbon", running ? "open-pulse" : "opacity-0")} />
      <span className="inline-flex items-baseline">
        <NumberFlow value={m} locales="en-US" />
        <span>:</span>
        <NumberFlow value={s} locales="en-US" format={{ minimumIntegerDigits: 2 }} trend={1} />
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

export function TopBar({
  done,
  current,
  ms,
  running,
  started,
}: {
  done: number;
  current: number;
  ms: number;
  running: boolean;
  started: boolean;
}) {
  const scrolled = useScrolled();
  return (
    <header
      className={cn(
        "sticky top-0 z-40 -mx-5 grid grid-cols-[1fr_auto_1fr] items-center px-5 pb-3 pt-[max(env(safe-area-inset-top),12px)]",
        scrolled ? "bg-counter shadow-[0_1px_0_rgb(22_58_66/0.1)]" : "bg-transparent",
        "lg:static lg:-mx-10 lg:bg-transparent lg:px-10 lg:pb-6 lg:pt-8 lg:shadow-none",
      )}
    >
      <Link href="/" aria-label="avanti, home" className="justify-self-start py-2 pr-3 transition-opacity hover:opacity-70">
        <Wordmark className="text-[25px] lg:text-[30px]" />
      </Link>
      <StepBars done={done} current={current} />
      <div className="justify-self-end">
        <StopwatchChip ms={ms} running={running} started={started} />
      </div>
    </header>
  );
}
