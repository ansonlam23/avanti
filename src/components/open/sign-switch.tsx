"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The go-live key: one press opens the shop (the sign goes up). It only
// reports intent; the caller decides when the sign really goes up (after the
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
  const disabled = on || busy;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onFlip();
      }}
      className={cn("btn-ink w-full justify-between! lg:w-auto lg:min-w-[320px]", className)}
    >
      {on || busy ? "Opening your shop…" : "Open my shop"}
      <ArrowRight className="size-5" aria-hidden />
    </button>
  );
}
