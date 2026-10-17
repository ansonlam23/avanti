"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";
import { TAG_H, TAG_W } from "./tag-geometry";

// A yellow price sticker (the shop's own label) stuck onto the printed menu.
// The price is a fact (spoken, on a tag, or typed by the owner); unknown
// prices show an em dash, never a guess.

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
    <div
      className={cn("pad relative grid select-none place-items-center rounded-[4px] shadow-slip", soldOut && "opacity-75", className)}
      style={{ width: TAG_W, height: TAG_H }}
    >
      {soldOut ? (
        <span className="text-[14px] font-bold uppercase tracking-[0.06em]">Sold out</span>
      ) : cents === null ? (
        <span aria-label="no price yet" className="font-display text-[26px] font-extrabold leading-none text-ink-muted">
          —
        </span>
      ) : (
        // Blank while the sticker is in the air; the price counts up once it lands.
        <NumberFlow
          value={counted ? cents / 100 : 0}
          format={priceFormat(cents)}
          locales="en-US"
          transformTiming={COUNT_TIMING}
          spinTiming={COUNT_TIMING}
          className={cn(
            "font-display text-[26px] font-black leading-none tabular-nums transition-opacity duration-150",
            counted ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}

/** A diet / allergen tag ("nut-free"), printed small. "contains-…" is set in bold. */
export function TagChip({ tag, className }: { tag: string; className?: string }) {
  const contains = tag.startsWith("contains-");
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-[2px] border-[1.5px] px-1.5 text-[14px] leading-none",
        contains ? "border-ink font-bold" : "border-ink/35 text-ink-muted",
        className,
      )}
    >
      {tag}
    </span>
  );
}
