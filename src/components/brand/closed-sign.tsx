"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BlockReason } from "@/lib/types";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, sec } from "./motion-prefs";
import { sfx } from "./sfx";
import { Stamp } from "./stamp";

// CONTRACT (props are frozen; optional props may be added). The door sign
// became the receipt spindle: every blocked request is a REJECTED slip.
export interface ClosedSignProps {
  /** Increment to spike one more REJECTED slip (one per blocked bot). */
  flips?: number;
  /** The reason printed on the newest slip, e.g. "replayed". */
  reason?: BlockReason | null;
  className?: string;
  /**
   * "closed": rests with a slip already on the spike (a static illustration;
   * the default when there are no flips yet and a reason is given).
   * "open": an empty spindle that collects a slip per bot.
   */
  face?: "open" | "closed";
  /** A soft slap + steel tick per slip when sound is globally on. Default true. */
  sound?: boolean;
  /** Static illustration: slips already on the spike, oldest first. */
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

// Geometry (px): a 228 × 196 spindle on the counter.
const W = 228;
const H = 196;
const BASE_Y = 172; // top of the base disc
const STACK_Y = 102; // where the first slip's top edge rests (its foot sits on the base)
const LIFT = 5; // each slip sits this much higher on the pile
const MAX = 9; // slips drawn (older ones stay counted, just not drawn)
const DROP = 0.42; // s, a slip sliding down the spike

type Slip = { id: number; reason: BlockReason | null; rot: number; dx: number; animate: boolean };

/** Deterministic little angle/offset per slip so the pile looks hand-spiked. */
function lay(id: number): { rot: number; dx: number } {
  const angles = [-7, 5, -3, 8, -9, 3, -5, 6, -2, 9];
  const shifts = [-4, 3, -2, 5, -5, 2, -3, 4, 0, -1];
  return { rot: angles[id % angles.length], dx: shifts[id % shifts.length] };
}

/**
 * A receipt spindle. Each `flips` increment prints a small REJECTED slip
 * (with a red VOID stamp and the reason) that drops down the steel spike and
 * lands on the pile with a slap. A 50-bot burst piles up fast; the newest
 * slip's reason is always on top.
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
        sfx.play("spike", { delay: sec(DROP) * 0.8, gain: 0.8 });
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
          ? `Spindle of rejected requests${label ? `; the newest was rejected for: ${label}` : ""}`
          : "Empty spindle: no requests rejected yet"
      }
      className={cn("relative inline-block select-none align-middle", className)}
      style={{ width: W, height: H }}
    >
      {/* the spike */}
      <span
        aria-hidden
        className="absolute left-1/2 w-[5px] -translate-x-1/2 rounded-t-full bg-[linear-gradient(90deg,#8d918b,#eef0ec_45%,#a5a9a3_70%,#6f736d)] shadow-[1px_0_1px_rgb(40_35_25/0.25)]"
        style={{ top: 8, height: BASE_Y - 4 }}
      />
      <span
        aria-hidden
        className="absolute left-1/2 size-0 -translate-x-1/2 border-x-[2.5px] border-b-[8px] border-x-transparent border-b-[#c9ccc7]"
        style={{ top: 1 }}
      />
      {/* the weighted base */}
      <span
        aria-hidden
        className="absolute left-1/2 h-[20px] w-[118px] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(60%_80%_at_45%_30%,#f3f4f1,#bfc2bd_55%,#8c908a)] shadow-[0_6px_10px_-3px_rgb(40_35_25/0.45),inset_0_-3px_4px_rgb(0_0_0/0.15)]"
        style={{ top: BASE_Y }}
      />

      {slips.map((s, i) => (
        <SlipOnSpike key={s.id} slip={s} level={i} newest={i === slips.length - 1} />
      ))}
    </div>
  );
}

function SlipOnSpike({ slip, level, newest }: { slip: Slip; level: number; newest: boolean }) {
  const y = STACK_Y - level * LIFT;
  return (
    <motion.div
      aria-hidden
      className="absolute left-1/2 w-[184px] drop-shadow-[0_2px_2px_rgb(60_50_30/0.22)]"
      style={{ top: y, marginLeft: -92 + slip.dx, zIndex: 2 + level }}
      initial={slip.animate ? { y: -(y + 40), rotate: slip.rot * 2.6, opacity: 0 } : false}
      animate={{ y: 0, rotate: slip.rot, opacity: 1 }}
      transition={
        slip.animate
          ? {
              y: { duration: sec(DROP), ease: [0.55, 0, 0.9, 0.6] },
              rotate: { duration: sec(DROP + 0.25), ease: [0.2, 1.4, 0.4, 1] },
              opacity: { duration: sec(0.08) },
            }
          : { duration: 0 }
      }
    >
      <div className={cn("paper edge-torn-bottom relative rounded-t-[2px] px-3 pt-2.5", !newest && "[&_p]:opacity-90")}>
        {/* the hole the spike goes through */}
        <span className="absolute left-1/2 top-[7px] size-[7px] -translate-x-1/2 rounded-full bg-[#b9bcb7] shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)]" />
        <p className="mt-2 font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.03em]">Rejected</p>
        <p className="mt-0.5 truncate text-[14px] leading-snug text-ink-muted">{slip.reason ? REASON_LABEL[slip.reason] : "unsigned"}</p>
        <Stamp kind="BLOCKED" text="Void" size="sm" sound={false} className="absolute right-2.5 top-3" />
      </div>
    </motion.div>
  );
}

export { REASON_LABEL };
