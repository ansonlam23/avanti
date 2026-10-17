"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { DUR, EASE, REDUCED } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { sec } from "./motion-prefs";

/** Kept for callers; in print everything is ink on a dimmed counter, so tones only tint the eyebrow rule. */
export type FocusTone = "neon" | "ai" | "verified" | "held" | "paid" | "blocked";

export interface FocusRevealProps {
  /** Show the reveal (the scene pushes in behind it). */
  open: boolean;
  /** Letterspaced line above the title, e.g. "ORDER VERIFIED". */
  eyebrow?: string;
  title?: ReactNode;
  /**
   * The hero object, shown large and tilted (a stamped slip, a receipt…).
   * Pass a function to know when its beat arrives, e.g.
   * `(cue) => <Stamp kind="VERIFIED" animate={cue} />` lands exactly at 0.9 s.
   */
  object?: ReactNode | ((cue: boolean) => ReactNode);
  /** Supporting slip under the object: one line of copy and/or a button. */
  card?: ReactNode;
  /** Rest tilt of the object in degrees (default −3). */
  tilt?: number;
  tone?: FocusTone;
  /** Click on the veil / Escape. */
  onDismiss?: () => void;
  className?: string;
  /** The scene behind (pushed in, dimmed and blurred while open). */
  children?: ReactNode;
}

// The fixed script (seconds from open).
const AT = { eyebrow: 0.4, title: 0.6, object: 0.9, card: 1.1 } as const;

/**
 * The one reusable focus pull for big moments (VERIFIED, HELD, the bot wall).
 * Script: the counter pushes in (scale 1.04) while the room dims and blurs
 * (DUR.scene) → eyebrow at 0.4 s → title at 0.6 s → the tilted paper object
 * lands at 0.9 s (EASE.pop) → the supporting slip from 1.1 s. Closes in 0.3 s.
 * Renders inside its own box (works inside a phone frame), not as a portal.
 */
export function FocusReveal({
  open,
  eyebrow,
  title,
  object,
  card,
  tilt = -3,
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
            ? { scale: reduced ? 1 : 1.04, filter: "blur(5px) brightness(0.62) saturate(0.85)" }
            : { scale: 1, filter: "blur(0px) brightness(1) saturate(1)" }
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
            tilt={tilt}
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
  tilt,
  reduced,
  onDismiss,
}: Omit<FocusRevealProps, "open" | "className" | "children" | "tone"> & { tilt: number; reduced: boolean }) {
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
        className="absolute inset-0 cursor-default bg-[radial-gradient(90%_70%_at_50%_45%,rgb(26_24_20/0.42),rgb(26_24_20/0.7))]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: len(0.8), ease: EASE.out }}
      />
      {eyebrow ? (
        <motion.p
          className="label-print relative text-paper/85"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(AT.eyebrow), duration: len(0.5), ease: EASE.out }}
        >
          {eyebrow}
        </motion.p>
      ) : null}
      {title ? (
        <motion.h2
          className="relative mt-2 max-w-[16ch] font-display text-[40px] font-extrabold uppercase leading-[0.95] text-balance text-paper"
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
          initial={{ opacity: 0, scale: 0.94, rotate: tilt * 2.4, y: 18 }}
          animate={{ opacity: 1, scale: 1, rotate: tilt, y: 0 }}
          transition={{ delay: at(AT.object), duration: len(0.7), ease: EASE.pop }}
        >
          {typeof object === "function" ? object(cue) : object}
        </motion.div>
      ) : null}
      {card ? (
        <motion.div
          className="paper relative mt-7 w-full max-w-[320px] rotate-[0.8deg] rounded-[2px] px-5 py-4 text-left text-[15px] leading-snug shadow-[var(--shadow-lift)]"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(AT.card), duration: len(0.7), ease: EASE.out }}
        >
          {card}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
