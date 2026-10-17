"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BlockReason } from "@/lib/types";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, sec } from "./motion-prefs";
import { sfx } from "./sfx";
import { Stamp } from "./stamp";

// CONTRACT (props are frozen; optional props may be added). The door sign
// became the receipt spindle, and in ink a neat stack of turned-away slips:
// every blocked request adds one REJECTED slip to the pile.
export interface ClosedSignProps {
  /** Increment to add one more REJECTED slip (one per blocked bot). */
  flips?: number;
  /** The reason written on the newest slip, e.g. "replayed". */
  reason?: BlockReason | null;
  className?: string;
  /**
   * "closed": rests with a slip already on the pile (a static illustration;
   * the default when there are no flips yet and a reason is given).
   * "open": an empty tray that collects a slip per bot.
   */
  face?: "open" | "closed";
  /** A soft paper slap per slip when sound is globally on. Default true. */
  sound?: boolean;
  /** Static illustration: slips already on the pile, oldest first. */
  pile?: BlockReason[];
}

const REASON_LABEL: Record<BlockReason, string> = {
  unsigned: "unsigned",
  malformed: "malformed signature",
  unknown_agent: "unknown agent",
  bad_signature: "bad signature",
  expired: "expired",
  not_yet_valid: "not yet valid",
  replayed: "replayed",
  digest_mismatch: "edited amount",
  wrong_target: "wrong shop",
};

// Geometry (px): a 228 × 196 box, the same footprint as the old spindle.
const W = 228;
const H = 196;
const STACK_Y = 104; // where the first slip's top edge rests
const LIFT = 6; // each slip sits this much higher on the pile
const MAX = 9; // slips drawn (older ones stay counted, just not drawn)
const DROP = 0.42; // s, a slip settling onto the pile

type Slip = { id: number; reason: BlockReason | null; dx: number; animate: boolean };

/** A tiny deterministic sideways offset per slip, so the pile reads as a pile. */
function lay(id: number): { dx: number } {
  const shifts = [-4, 3, -2, 5, -5, 2, -3, 4, 0, -1];
  return { dx: shifts[id % shifts.length] };
}

/**
 * The turned-away pile. Each `flips` increment writes a small REJECTED slip
 * (a little vermilion VOID seal and the reason) that settles onto the stack
 * with a soft slap. A 50-bot burst piles up fast; the newest slip's reason
 * is always on top. Slips lie square, drawn with the ink hairline.
 */
export function ClosedSign({ flips = 0, reason, className, face, sound = true, pile }: ClosedSignProps) {
  const [slips, setSlips] = useState<Slip[]>(() => {
    const start = pile?.length ? pile : (face ?? (flips === 0 && reason ? "closed" : "open")) === "closed" && reason ? [reason] : [];
    return start.map((r, i) => ({ id: i + 1, reason: r, ...lay(i + 1), animate: false }));
  });
  const nextId = useRef(slips.length + 1);
  const seen = useRef(flips);
  const reasonRef = useRef(reason);
  useLayoutEffect(() => {
    reasonRef.current = reason;
  });
  const lastSound = useRef(0);

  useEffect(() => {
    const delta = flips - seen.current;
    seen.current = flips;
    if (delta <= 0) return;
    const reduced = prefersReducedMotion();
    const add: Slip[] = Array.from({ length: Math.min(delta, MAX) }, () => {
      const id = nextId.current++;
      return { id, reason: reasonRef.current ?? null, ...lay(id), animate: !reduced };
    });
    setSlips((s) => [...s, ...add].slice(-MAX));
    if (sound && !reduced) {
      const now = performance.now();
      if (now - lastSound.current > 70) {
        lastSound.current = now;
        sfx.play("spike", { delay: sec(DROP) * 0.6, gain: 0.6 });
      }
    }
  }, [flips, sound]);

  const top = slips.at(-1);
  const label = top?.reason ? REASON_LABEL[top.reason] : null;

  return (
    <div
      role="img"
      aria-label={
        slips.length
          ? `Pile of rejected requests${label ? `; the newest was rejected for: ${label}` : ""}`
          : "Empty tray: no requests rejected yet"
      }
      className={cn("relative inline-block select-none align-middle", className)}
      style={{ width: W, height: H }}
    >
      {/* the tray the slips land in: one ink hairline */}
      <span aria-hidden className="absolute inset-x-3 h-px bg-ink/30" style={{ top: STACK_Y + 70 }} />
      {slips.length === 0 ? (
        <span
          aria-hidden
          className="absolute left-1/2 w-[200px] -translate-x-1/2 border border-dashed border-ink/25"
          style={{ top: STACK_Y, height: 64 }}
        />
      ) : null}
      {slips.map((s, i) => (
        <SlipOnPile key={s.id} slip={s} level={i} newest={i === slips.length - 1} />
      ))}
    </div>
  );
}

function SlipOnPile({ slip, level, newest }: { slip: Slip; level: number; newest: boolean }) {
  const y = STACK_Y - level * LIFT;
  return (
    <motion.div
      aria-hidden
      className="absolute left-1/2 w-[200px]"
      style={{ top: y, marginLeft: -100 + slip.dx, zIndex: 2 + level }}
      initial={slip.animate ? { y: -28, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={slip.animate ? { duration: sec(DROP), ease: [0.22, 1, 0.36, 1] } : { duration: 0 }}
    >
      <div className={cn("paper relative h-[64px] px-3.5 pt-2.5 shadow-slip", !newest && "[&_p]:opacity-80")}>
        <p className="font-display text-[20px] leading-none">Rejected</p>
        <p className="mt-1 truncate pr-[76px] text-[14px] leading-snug text-ink-muted">{slip.reason ? REASON_LABEL[slip.reason] : "unsigned"}</p>
        {newest ? <Stamp kind="FAILED" text="Void" size="sm" sound={false} className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px]" /> : null}
      </div>
    </motion.div>
  );
}

export { REASON_LABEL };
