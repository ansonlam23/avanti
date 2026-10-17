"use client";

import { motion, useReducedMotion } from "motion/react";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

// The printer's big PRINT key. One press prints the OPEN sign. It only
// reports intent; the caller decides when the sign really prints (after the
// server has created the shop).

export function SignSwitch({
  on,
  busy,
  onFlip,
  className,
}: {
  on: boolean;
  busy?: boolean;
  onFlip: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const disabled = on || busy;

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Printing your sign" : "Print your OPEN sign"}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onFlip();
      }}
      className={cn(
        "relative grid h-[124px] w-[220px] touch-none select-none place-items-center rounded-[10px] bg-machine p-2.5 disabled:cursor-default",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_3px_0_#141413,0_18px_30px_-14px_rgb(40_30_10/0.55)]",
        className,
      )}
    >
      {/* the key itself travels down when pressed */}
      <motion.span
        className="grid size-full place-items-center rounded-[6px] bg-[linear-gradient(180deg,#fbfbf7,#e6e4dc)] text-ink"
        initial={false}
        animate={on ? { y: 5, boxShadow: "0 0 0 #000" } : { y: 0, boxShadow: "0 6px 0 #a9a69c" }}
        whileTap={disabled ? undefined : { y: 4, boxShadow: "0 2px 0 #a9a69c" }}
        transition={reduce ? { duration: 0.01 } : { type: "spring", stiffness: 900, damping: 30 }}
      >
        <span className="flex items-center gap-3 font-display text-[34px] font-black uppercase leading-none tracking-[0.04em]">
          <Printer className="size-8" aria-hidden /> Print
        </span>
      </motion.span>
    </button>
  );
}
