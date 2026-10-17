"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";
import { TAG_H, TAG_W } from "./tag-geometry";

// A price label on the menu slip: a square of the shop's teal wash with a
// hairline, the price set in Red Hat Mono. The price is a fact (spoken, on a
// tag, or typed by the owner); unknown prices show an em dash, never a guess.

const COUNT_TIMING = { duration: 900, easing: `cubic-bezier(${EASE.out.join(",")})` };

function priceFormat(cents: number): Format {
  const whole = cents % 100 === 0;
  return {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  };
}

export interface HangTagFaceProps {
  cents: number | null;
  /** Show `cents` (true) or 0 (false); flipping it makes the price count up. */
  counted?: boolean;
  soldOut?: boolean;
  className?: string;
}

export function HangTagFace({ cents, counted = true, soldOut, className }: HangTagFaceProps) {
  return (
    <div className={cn("pad relative grid select-none place-items-center", soldOut && "opacity-75", className)} style={{ width: TAG_W, height: TAG_H }}>
      {soldOut ? (
        <span className="label-print text-[13px]">Sold out</span>
      ) : cents === null ? (
        <span aria-label="no price yet" className="font-mono text-[19px] leading-none text-ink-muted">
          —
        </span>
      ) : (
        // Blank while the label is in the air; the price counts up once it lands.
        <NumberFlow
          value={counted ? cents / 100 : 0}
          format={priceFormat(cents)}
          locales="en-US"
          transformTiming={COUNT_TIMING}
          spinTiming={COUNT_TIMING}
          className={cn(
            "font-mono text-[19px] font-medium leading-none tabular-nums transition-opacity duration-150",
            counted ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}

/** A diet / allergen tag ("nut-free"), set small and square. "contains-…" is set in ink. */
export function TagChip({ tag, className }: { tag: string; className?: string }) {
  const contains = tag.startsWith("contains-");
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center border px-2 text-[15px] leading-none",
        contains ? "border-ink/60 font-semibold text-ink" : "border-ink/20 text-ink-muted",
        className,
      )}
    >
      {tag}
    </span>
  );
}
