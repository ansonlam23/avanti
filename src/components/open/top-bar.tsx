"use client";

import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import Link from "next/link";
import { Wordmark } from "@/components/landing/wordmark";
import { cn } from "@/lib/utils";

// Progress = four short printed bars (filled when done) and a real stopwatch
// in dot-matrix digits that runs from the first tap until the sign prints.
// Laptop: the bars carry their names and the wordmark leads home.

const STEPS = ["Photo", "Voice", "Menu", "Sign"] as const;

export function StepBars({ done, current }: { done: number; current: number }) {
  return (
    <div
      role="progressbar"
      aria-label={`Step ${Math.min(current + 1, 4)} of 4: ${STEPS[Math.min(current, 3)]}`}
      aria-valuemin={0}
      aria-valuemax={4}
      aria-valuenow={done}
      className="flex items-center gap-1.5 lg:gap-6"
    >
      {STEPS.map((label, i) => {
        const filled = i < done;
        const active = i === current && i >= done;
        return (
          <span key={label} className="flex items-center gap-2.5">
            <span className="relative h-2.5 w-9 overflow-hidden rounded-[1px] border-2 border-ink/70 lg:h-2 lg:w-10 lg:border-[1.5px]">
              <motion.span
                className="absolute inset-0 origin-left bg-ink"
                initial={false}
                animate={{ scaleX: filled ? 1 : 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              />
              {active ? <span className="absolute inset-y-0 left-0 w-1/3 bg-ink/35" /> : null}
            </span>
            <span aria-hidden className={cn("label-print hidden lg:inline", filled || active ? "text-ink" : "text-ink-muted")}>
              {label}
            </span>
          </span>
        );
      })}
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
      className={cn("dot inline-flex items-baseline text-[30px] lg:text-[34px]", started ? "text-ink" : "text-ink-muted")}
    >
      {running ? <span aria-hidden className="mr-2 size-2 self-center rounded-full bg-ink [animation:printhead-blink_1s_steps(2,start)_infinite]" /> : null}
      <NumberFlow value={m} locales="en-US" />
      <span>:</span>
      <NumberFlow value={s} locales="en-US" format={{ minimumIntegerDigits: 2 }} trend={1} />
    </div>
  );
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
  return (
    <header className="sticky top-0 z-40 -mx-5 flex items-center justify-between bg-[linear-gradient(180deg,var(--color-counter)_70%,transparent)] px-5 pb-5 pt-[max(env(safe-area-inset-top),14px)] lg:static lg:-mx-10 lg:bg-none lg:px-10 lg:pb-6 lg:pt-7">
      <div className="flex items-center gap-10">
        <Link href="/" aria-label="Open Sign, home" className="hidden rounded-[3px] py-2 pr-2 transition-opacity hover:opacity-75 lg:inline-flex">
          <Wordmark className="text-[22px]" />
        </Link>
        <StepBars done={done} current={current} />
      </div>
      <StopwatchChip ms={ms} running={running} started={started} />
    </header>
  );
}
