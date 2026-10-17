"use client";

import { cn } from "@/lib/utils";
import { Stamp } from "./stamp";

/**
 * The VERIFIED beat's paper: the agent's signed request, and the shop's red
 * VERIFIED stamp landing on it (pass `cue` from FocusReveal's object beat).
 */
export function SignedSlip({
  agent = "Open Sign Shopper",
  cue = true,
  sound = true,
  className,
}: {
  agent?: string;
  /** Land the stamp now (true) or hold it back (false). */
  cue?: boolean;
  sound?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("paper w-[272px] rounded-[2px] px-6 pb-7 pt-6 text-left shadow-[var(--shadow-lift)]", className)}>
      <p className="label-print text-ink-muted">Signed request</p>
      <p className="mt-1.5 font-display text-[30px] font-extrabold uppercase leading-[0.95]">{agent}</p>
      <div className="mt-5 flex min-h-[88px] items-center justify-center">
        {cue ? <Stamp kind="VERIFIED" size="lg" animate sound={sound} /> : null}
      </div>
    </div>
  );
}
