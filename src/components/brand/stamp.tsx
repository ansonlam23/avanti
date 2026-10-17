"use client";

import { useAnimate } from "motion/react";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { DUR, EASE, REDUCED } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, sec } from "./motion-prefs";
import { sfx } from "./sfx";

// CONTRACT (props are frozen; optional props may be added).
export type StampKind = "HELD" | "PAID" | "RELEASED" | "FAILED" | "VERIFIED" | "BLOCKED";

export interface StampProps {
  kind: StampKind;
  /** Small line under the word, e.g. "Open Sign Shopper" or "$18.00". */
  label?: string;
  /** Play the slam-down animation when it appears. */
  animate?: boolean;
  /** "paper" = ink that sinks into paper; "dark" = the same ink, lit, over a dimmed scene. */
  surface?: "paper" | "dark";
  className?: string;
  /** sm for compact rows, md (default), lg for focus reveals. */
  size?: "sm" | "md" | "lg";
  /** An older impression under a newer stamp (stamps keep history). */
  faded?: boolean;
  /** Fires at the moment of impact (shake a container, sync a sound). */
  onSlam?: () => void;
  /** Thunk on impact when sound is globally on. Default true. */
  sound?: boolean;
  /** Override the word (e.g. "NEEDS A PRICE", "VOID"); `kind` still sets the angle. */
  text?: string;
}

/** Each stamp has its own rest angle, like real hand stamping (−11°…+7°). */
const REST: Record<StampKind, number> = {
  HELD: -7,
  PAID: 6,
  RELEASED: -4,
  FAILED: 5,
  VERIFIED: -5,
  BLOCKED: -9,
};

const SIZE = {
  sm: "text-[19px] [&_.stamp-label]:text-[14px]",
  md: "text-[26px] [&_.stamp-label]:text-[14px]",
  lg: "text-[44px] [&_.stamp-label]:text-[16px]",
} as const;

/**
 * A rubber stamp in the one red ink: heavy frame + an inner rule, worn ink,
 * multiplied into the paper. Slam script (DUR.stamp = 0.25 s): scale 1.6 →
 * 0.96 → 1 with blur → sharp, impact at 70% (thunk + onSlam), then a tiny shake.
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
    const d = sec(DUR.stamp);
    const impact = d * 0.7;
    const slam = run(
      ink,
      { scale: [1.6, 0.96, 1], opacity: [0, 1, 1], filter: ["blur(5px)", "blur(0px)", "blur(0px)"] },
      { duration: d, times: [0, 0.7, 1], ease: [EASE.in, EASE.out] },
    );
    const shake = run(scope.current, { x: [0, -2.5, 2, -1, 0], y: [0, 1.2, -0.6, 0.2, 0] }, { duration: sec(0.2), delay: impact });
    const t = setTimeout(() => {
      onSlamRef.current?.();
      if (sound) sfx.play("stamp", { gain: size === "sm" ? 0.5 : 1 });
    }, impact * 1000);
    return () => {
      clearTimeout(t);
      slam.stop();
      shake.stop();
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
    <svg aria-hidden viewBox="0 0 24 24" className="size-[0.86em] shrink-0" fill="none">
      <path d="M4.5 12.8l4.6 4.7L19.6 6.4" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[0.8em] shrink-0" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

/** Always shown wherever a payment ran in simulated mode. Never hide it. */
export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[2px] border-[1.5px] border-dashed border-ink px-1.5 py-px font-sans text-[14px] font-bold uppercase leading-tight tracking-[0.08em] text-ink",
        className,
      )}
      title="Visa sandbox keys aren't connected here yet, so this payment step is simulated."
    >
      Simulated
    </span>
  );
}
