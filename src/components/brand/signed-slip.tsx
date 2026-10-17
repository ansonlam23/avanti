"use client";

import { cn } from "@/lib/utils";
import { Stamp } from "./stamp";

/**
 * The VERIFIED beat's paper: the agent's signed request, and the shop's
 * vermilion VERIFIED seal pressed onto it (pass `cue` from FocusReveal's
 * object beat).
 */
export function SignedSlip({
  agent = "avanti shopper",
  cue = true,
  sound = true,
  className,
}: {
  agent?: string;
  /** Press the seal now (true) or hold it back (false). */
  cue?: boolean;
  sound?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("paper w-[272px] px-6 pb-7 pt-6 text-left shadow-lift", className)}>
      <p className="label-print text-[13px] text-ink-muted">Signed request</p>
      <p className="mt-2 font-display text-[28px] leading-[1.05]">{agent}</p>
      <div className="mt-5 flex min-h-[96px] items-center justify-center">
        {cue ? <Stamp kind="VERIFIED" size="lg" animate sound={sound} /> : null}
      </div>
    </div>
  );
}
