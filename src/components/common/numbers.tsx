"use client";

import NumberFlow from "@number-flow/react";
import { EASE, motionSpeed } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Every changing number goes through NumberFlow (DESIGN.md §4), with one
// shared timing that follows ?speed= so retakes can slow the whole page down.
// The font comes from the caller: Barlow (font-display) for money, Doto
// (`dot`) for codes/counts; otherwise the inherited receipt mono.

const easing = `cubic-bezier(${EASE.out.join(",")})`;

function timings(seconds: number) {
  const duration = (seconds * 1000) / motionSpeed();
  return {
    transformTiming: { duration, easing },
    spinTiming: { duration, easing },
    opacityTiming: { duration: Math.min(duration, 400), easing: "ease-out" },
  };
}

export function Money({ cents, className, duration = 0.9 }: { cents: number; className?: string; duration?: number }) {
  return (
    <NumberFlow
      value={cents / 100}
      format={{ style: "currency", currency: "USD" }}
      className={cn("tabular-nums", className)}
      {...timings(duration)}
    />
  );
}

export function Count({ value, className, duration = 0.9 }: { value: number; className?: string; duration?: number }) {
  return <NumberFlow value={value} className={cn("tabular-nums", className)} {...timings(duration)} />;
}
