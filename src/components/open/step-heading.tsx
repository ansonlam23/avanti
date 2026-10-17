"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { INK_EASE } from "./ink";

/** A step's heading: Marcellus, sentence case, one calm line or two. */
export function StepHeading({
  title,
  sub,
  className,
  children,
}: {
  /** Kept for callers; the progress steps already say which step this is. */
  step?: number;
  title: string;
  sub?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-4", className)}>
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.h1
            key={title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
            transition={{ duration: 0.7, ease: INK_EASE }}
            className="font-display text-[40px] font-normal leading-[1.04] text-ink text-balance lg:text-[60px] lg:leading-[1.02]"
          >
            {title}
          </motion.h1>
        </AnimatePresence>
        {sub ? <p className="mt-3 text-[16px] leading-relaxed text-ink-muted lg:mt-5 lg:text-[19px]">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * "Reading your counter…" style status line: plain sentences, no spinners.
 * `lead`: on a laptop it is the step's heading (the left pane narrates while
 * the right pane shows the work).
 */
export function StatusLine({ text, lead, className }: { text: string; lead?: boolean; className?: string }) {
  return (
    <div aria-live="polite" className={cn("relative h-8 overflow-hidden", lead && "lg:h-[128px]", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: DUR.micro + 0.1, ease: EASE.out }}
          className={cn(
            "text-[17px] leading-8",
            lead && "lg:font-display lg:text-[56px] lg:leading-[1.05] lg:text-balance",
          )}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
