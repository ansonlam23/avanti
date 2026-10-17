"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";

// "I couldn't tell: …" notes from the AI, torn off a yellow pad.

const TILT = [-2, 1.6, -1.1, 2.2];

export function StickyNote({
  text,
  index,
  onDismiss,
  className,
}: {
  text: string;
  index: number;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14, rotate: TILT[index % TILT.length] * 3 }}
      animate={{ opacity: 1, y: 0, rotate: TILT[index % TILT.length] }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
      transition={{ duration: 0.5, ease: EASE.pop, delay: 0.15 + index * 0.08 }}
      className={cn("pad edge-perf-top relative w-full rounded-b-[2px] px-4 pb-4 pt-5 shadow-slip", className)}
    >
      <p className="label-print pr-9 text-ink-muted">I couldn&apos;t tell</p>
      <p className="mt-1.5 pr-6 text-[15px] leading-snug">{text}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Got it"
          className="absolute right-1 top-2 grid size-11 place-items-center rounded-[3px] text-ink-muted transition active:bg-ink/5"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </motion.div>
  );
}
