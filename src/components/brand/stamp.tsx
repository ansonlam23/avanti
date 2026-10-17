"use client";

import { useAnimate } from "motion/react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { REDUCED } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, sec } from "./motion-prefs";
import { sfx } from "./sfx";

// CONTRACT (props are frozen; optional props may be added).
export type StampKind = "HELD" | "PAID" | "RELEASED" | "FAILED" | "VERIFIED" | "BLOCKED";

export interface StampProps {
  kind: StampKind;
  /** Small line under the word, e.g. "avanti shopper" or "$18.00" (kept in its own case). */
  label?: string;
  /** Press the seal down when it appears. */
  animate?: boolean;
  /** "paper" = ink that sinks into paper (multiply); "dark" = kept for callers, same ink. */
  surface?: "paper" | "dark";
  className?: string;
  /** sm for compact rows, md (default), lg for focus reveals. */
  size?: "sm" | "md" | "lg";
  /** An older impression under a newer seal (seals keep history). */
  faded?: boolean;
  /** Fires the moment the seal meets the paper (sync a sound, a beat). */
  onSlam?: () => void;
  /** A soft thunk on impact when sound is globally on. Default true. */
  sound?: boolean;
  /** Override the word (e.g. "Needs a price", "Void"); `kind` still sets the angle. */
  text?: string;
}

/** A hand-pressed seal is never quite square to the page: a degree or two. */
const REST: Record<StampKind, number> = {
  HELD: -2,
  PAID: 1.5,
  RELEASED: -1.5,
  FAILED: 2,
  VERIFIED: -2.5,
  BLOCKED: 2,
};

const SIZE = {
  sm: "text-[16px] [&_.stamp-label]:text-[13px]",
  md: "text-[22px] [&_.stamp-label]:text-[14px]",
  lg: "text-[30px] [&_.stamp-label]:text-[15px]",
} as const;

const PRESS = 0.6; // s: the seal pressed into the paper
const IMPACT = 0.38; // of PRESS: the moment it meets the paper

/**
 * The vermilion seal: a square, double-ruled hanko in #b5392b with a slight
 * ink texture, multiplied into the paper. It marks every decision (HELD,
 * PAID, RELEASED, VERIFIED, BLOCKED…) and is the one strong colour on a
 * screen. Press (0.6 s, calm): it settles from 1.08× as the ink fades in;
 * onSlam + a soft thunk at the moment of contact.
 */
export function Stamp({
  kind,
  label,
  animate,
  surface = "paper",
  className,
  size = "md",
  faded,
  onSlam,
  sound = true,
  text,
}: StampProps) {
  const [scope, run] = useAnimate<HTMLDivElement>();
  const inkRef = useRef<HTMLSpanElement>(null);
  const onSlamRef = useRef(onSlam);
  useLayoutEffect(() => {
    onSlamRef.current = onSlam;
  });

  useLayoutEffect(() => {
    const ink = inkRef.current;
    if (!animate || !ink || !scope.current) return;
    if (prefersReducedMotion()) {
      const c = run(ink, { opacity: [0, 1] }, { duration: REDUCED.duration, ease: "linear" });
      onSlamRef.current?.();
      return () => c.stop();
    }
    const d = sec(PRESS);
    const press = run(
      ink,
      { scale: [1.08, 1], opacity: [0, 1], filter: ["blur(1.5px)", "blur(0px)"] },
      { duration: d, ease: [0.22, 1, 0.36, 1] },
    );
    const t = setTimeout(() => {
      onSlamRef.current?.();
      if (sound) sfx.play("stamp", { gain: size === "sm" ? 0.4 : 0.8 });
    }, d * IMPACT * 1000);
    return () => {
      clearTimeout(t);
      press.stop();
    };
    // Play once per appearance (remount or toggle `animate` to replay).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  const word = text ?? kind;
  return (
    <div
      ref={scope}
      role="img"
      aria-label={label ? `${word}: ${label}` : word}
      data-kind={kind}
      data-surface={surface}
      data-faded={faded ? "true" : undefined}
      className={cn("stamp", SIZE[size], className)}
      style={{ "--stamp-rest": `${REST[kind]}deg` } as CSSProperties}
    >
      <span ref={inkRef} className="stamp-ink" style={animate ? { opacity: 0 } : undefined}>
        <span className="stamp-word">
          {word}
          {kind === "VERIFIED" ? <Check /> : kind === "BLOCKED" ? <Cross /> : null}
        </span>
        {label ? <span className="stamp-label">{label}</span> : null}
      </span>
    </div>
  );
}

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[0.78em] shrink-0" fill="none">
      <path d="M4.5 12.8l4.6 4.7L19.6 6.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

function Cross() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[0.72em] shrink-0" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  );
}

/** Always shown wherever a payment ran in simulated mode. Never hide it. */
export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-dashed border-ink bg-paper px-2 py-[3px] font-sans text-[13px] font-bold uppercase leading-tight tracking-[0.12em] text-ink",
        className,
      )}
      title="Visa sandbox keys aren't connected here yet, so this payment step is simulated."
    >
      Simulated
    </span>
  );
}
