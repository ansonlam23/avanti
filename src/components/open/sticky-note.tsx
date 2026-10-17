"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { INK_EASE } from "./ink";

// "I couldn't tell: …" notes from the AI, on the shop's teal wash.

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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.7, ease: INK_EASE, delay: 0.15 + index * 0.08 }}
      className={cn("pad relative w-full px-5 pb-4 pt-4", className)}
    >
      <p className="pr-9 text-[15px] font-semibold leading-snug text-ink-muted">I couldn&apos;t tell</p>
      <p className="mt-1 pr-6 text-[16px] leading-snug">{text}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Got it"
          className="absolute right-1 top-1 grid size-11 place-items-center text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </motion.div>
  );
}
