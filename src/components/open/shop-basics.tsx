"use client";

import { formatClock } from "@/lib/format";
import { AI_LIMIT_MAX_CENTS, AI_LIMIT_MIN_CENTS } from "@/lib/orders/ai-rules";
import { cn } from "@/lib/utils";
import { InkToggle } from "./ink-toggle";
import { parsePriceInput, Stepper } from "./menu-board";

// Shop basics on the review screen: name, today's pickup window, max per
// order (default 2), "Take AI orders" (on) and, optionally, the most one AI
// order may cost. A small paper form.

export interface Basics {
  name: string;
  start: string; // "HH:MM"
  end: string;
  maxPerOrder: number;
  acceptAi: boolean;
  /** "AI orders up to $___" as typed (empty = no limit). */
  aiMax: string;
}

export const DEFAULT_BASICS: Basics = { name: "", start: "08:00", end: "18:00", maxPerOrder: 2, acceptAi: true, aiMax: "" };

/** Empty (no cap) or a dollar amount the server accepts ($1–$1,000). */
export function aiCapValid(text: string): boolean {
  const p = parsePriceInput(text);
  return p === null || (p !== "invalid" && p >= AI_LIMIT_MIN_CENTS && p <= AI_LIMIT_MAX_CENTS);
}

export function ShopBasics({ value, onChange }: { value: Basics; onChange: (patch: Partial<Basics>) => void }) {
  const badWindow = value.start >= value.end;
  const badCap = !aiCapValid(value.aiMax);
  return (
    <section aria-label="Shop basics" className="paper px-5 py-6 lg:px-7 lg:py-7">
      <label className="block">
        <span className="label-print mb-2 block text-ink-muted">Shop name</span>
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value.slice(0, 80) })}
          placeholder="Mai's Bakery"
          autoComplete="organization"
          className="field-print h-14 font-display text-[24px]!"
        />
      </label>

      <div className="mt-6">
        <span className="label-print mb-2 block text-ink-muted">Pickup today</span>
        <div className="flex items-center gap-3">
          <TimeChip value={value.start} onChange={(start) => onChange({ start })} label="Pickup starts" />
          <span aria-hidden className="text-ink-muted">–</span>
          <TimeChip value={value.end} onChange={(end) => onChange({ end })} label="Pickup ends" />
        </div>
        {badWindow ? <p className="mt-2 text-[16px] font-semibold text-stamp-deep">Pickup has to end after it starts.</p> : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-ink/10 pt-5">
        <span className="text-[16px]">Max per order</span>
        <Stepper value={value.maxPerOrder} onChange={(v) => onChange({ maxPerOrder: v ?? 1 })} min={1} max={20} label="Max per order" />
      </div>

      <div className="mt-5 flex min-h-12 items-center justify-between gap-4">
        <label htmlFor="accept-ai" className="text-[16px]">
          Take AI orders
        </label>
        <InkToggle id="accept-ai" checked={value.acceptAi} onCheckedChange={(acceptAi) => onChange({ acceptAi })} className="mr-1" />
      </div>

      {value.acceptAi ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="ai-max" className="text-[16px]">
              AI orders up to
            </label>
            <span
              className={cn(
                "flex h-12 w-[136px] items-center border bg-paper px-3 transition-colors focus-within:border-carbon focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-carbon",
                badCap ? "border-stamp-deep" : "border-[rgb(22_58_66/0.34)] hover:border-[rgb(22_58_66/0.55)]",
              )}
            >
              <span className="font-mono text-[17px] text-ink-muted">$</span>
              <input
                id="ai-max"
                inputMode="decimal"
                placeholder="no limit"
                value={value.aiMax}
                aria-invalid={badCap || undefined}
                onChange={(e) => onChange({ aiMax: e.target.value.slice(0, 8) })}
                className="h-full w-full min-w-0 bg-transparent pl-1.5 font-mono text-[17px] outline-none placeholder:font-sans placeholder:text-ink-muted"
              />
            </span>
          </div>
          {badCap ? <p className="mt-2 text-[15px] font-semibold text-stamp-deep">Between $1 and $1,000, or leave it empty.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function TimeChip({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative inline-flex h-12 min-w-[118px] cursor-pointer items-center justify-center border border-[rgb(22_58_66/0.34)] bg-paper px-4 font-mono text-[17px] font-medium tabular-nums transition-colors hover:border-[rgb(22_58_66/0.55)] focus-within:border-carbon focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-carbon">
      {formatClock(value)}
      <input
        type="time"
        aria-label={label}
        value={value}
        step={900}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // not supported: focusing the input is enough
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}
