"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { DUR, EASE, REDUCED } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { sec } from "./motion-prefs";

/** Kept for callers; in ink every reveal is the same calm paper veil. */
export type FocusTone = "neon" | "ai" | "verified" | "held" | "paid" | "blocked";

export interface FocusRevealProps {
  /** Show the reveal (the scene pushes in behind it). */
  open: boolean;
  /** Letterspaced line above the title, e.g. "ORDER VERIFIED". */
  eyebrow?: string;
  title?: ReactNode;
  /**
   * The hero object, shown large (a sealed slip, a receipt…).
   * Pass a function to know when its beat arrives, e.g.
   * `(cue) => <Stamp kind="VERIFIED" animate={cue} />` lands exactly at 0.9 s.
   */
  object?: ReactNode | ((cue: boolean) => ReactNode);
  /** Supporting slip under the object: one line of copy and/or a button. */
  card?: ReactNode;
  /** Kept for callers. Ink paper lies square, so it's ignored. */
  tilt?: number;
  tone?: FocusTone;
  /** Click on the veil / Escape. */
  onDismiss?: () => void;
  className?: string;
  /** The scene behind (pushed in, dimmed and blurred while open). */
  children?: ReactNode;
}

const INK = [0.22, 1, 0.36, 1] as const; // the landing's calm rise

// The fixed script (seconds from open).
const AT = { eyebrow: 0.4, title: 0.6, object: 0.9, card: 1.1 } as const;

/**
 * The one reusable focus pull for big moments (VERIFIED, HELD, the bot wall).
 * Script: the page behind softens under a veil of rice paper (blur, never
 * dark) → eyebrow at 0.4 s → title at 0.6 s → the paper object rises in at
 * 0.9 s → the supporting slip from 1.1 s, each a calm rise (0.7–0.9 s).
 * Closes in 0.3 s. Renders inside its own box (works inside a pane), not as
 * a portal.
 */
export function FocusReveal({
  open,
  eyebrow,
  title,
  object,
  card,
  onDismiss,
  className,
  children,
}: FocusRevealProps) {
  const reduced = !!useReducedMotion();
  const len = (s: number) => (reduced ? REDUCED.duration : sec(s));

  useEffect(() => {
    if (!open || !onDismiss) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <motion.div
        aria-hidden={open || undefined}
        animate={
          open
            ? { scale: reduced ? 1 : 1.015, filter: "blur(6px) saturate(0.85)" }
            : { scale: 1, filter: "blur(0px) saturate(1)" }
        }
        transition={{ duration: open ? len(DUR.scene) : len(0.5), ease: EASE.out }}
        className="h-full origin-center"
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {open ? (
          <FocusOverlay
            key="focus"
            eyebrow={eyebrow}
            title={title}
            object={object}
            card={card}
            reduced={reduced}
            onDismiss={onDismiss}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FocusOverlay({
  eyebrow,
  title,
  object,
  card,
  reduced,
  onDismiss,
}: Omit<FocusRevealProps, "open" | "className" | "children" | "tone" | "tilt"> & { reduced: boolean }) {
  const at = (s: number) => (reduced ? 0 : sec(s));
  const len = (s: number) => (reduced ? REDUCED.duration : sec(s));
  const [cue, setCue] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCue(true), at(AT.object) * 1000);
    return () => clearTimeout(t);
    // the beat is fixed per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-label={eyebrow ?? (typeof title === "string" ? title : "Focus")}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 py-8 text-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: len(0.3), ease: EASE.in } }}
    >
      <motion.button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onDismiss}
        className="absolute inset-0 cursor-default bg-counter/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: len(0.8), ease: EASE.out }}
      />
      {eyebrow ? (
        <motion.p
          className="label-print relative text-[13px] text-ink-muted"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(AT.eyebrow), duration: len(0.5), ease: EASE.out }}
        >
          {eyebrow}
        </motion.p>
      ) : null}
      {title ? (
        <motion.h2
          className="relative mt-3 max-w-[16ch] font-display text-[40px] leading-[1.05] text-balance text-ink"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(AT.title), duration: len(0.6), ease: EASE.out }}
        >
          {title}
        </motion.h2>
      ) : null}
      {object ? (
        <motion.div
          className="relative mt-7"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(AT.object), duration: len(0.8), ease: INK }}
        >
          {typeof object === "function" ? object(cue) : object}
        </motion.div>
      ) : null}
      {card ? (
        <motion.div
          className="paper relative mt-7 w-full max-w-[320px] px-5 py-4 text-left text-[16px] leading-snug shadow-lift"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(AT.card), duration: len(0.8), ease: INK }}
        >
          {card}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
