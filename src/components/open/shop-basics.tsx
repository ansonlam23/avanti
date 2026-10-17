"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Stepper } from "./menu-board";

// Shop basics on the review screen: name, today's pickup window, max per
// order (default 2) and "Take AI orders" (on). A small printed form.

export interface Basics {
  name: string;
  start: string; // "HH:MM"
  end: string;
  maxPerOrder: number;
  acceptAi: boolean;
}

export const DEFAULT_BASICS: Basics = { name: "", start: "08:00", end: "18:00", maxPerOrder: 2, acceptAi: true };

export function ShopBasics({ value, onChange }: { value: Basics; onChange: (patch: Partial<Basics>) => void }) {
  const badWindow = value.start >= value.end;
  return (
    <section aria-label="Shop basics" className="paper rounded-[3px] px-5 py-6 shadow-slip" style={{ rotate: "-0.4deg" }}>
      <label className="block">
        <span className="label-print mb-1.5 block text-ink-muted">Shop name</span>
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value.slice(0, 80) })}
          placeholder="Mai's Bakery"
          autoComplete="organization"
          className="field-print h-14 font-display text-[24px]! font-extrabold uppercase placeholder:normal-case"
        />
      </label>

      <div className="mt-6">
        <span className="label-print mb-1.5 block text-ink-muted">Pickup today</span>
        <div className="flex items-center gap-3">
          <TimeChip value={value.start} onChange={(start) => onChange({ start })} label="Pickup starts" />
          <span aria-hidden className="text-ink-muted">–</span>
          <TimeChip value={value.end} onChange={(end) => onChange({ end })} label="Pickup ends" />
        </div>
        {badWindow ? <p className="mt-2 text-[15px] font-bold text-stamp-deep">Pickup has to end after it starts.</p> : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <span className="text-[16px]">Max per order</span>
        <Stepper value={value.maxPerOrder} onChange={(v) => onChange({ maxPerOrder: v ?? 1 })} min={1} max={20} label="Max per order" />
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <label htmlFor="accept-ai" className="text-[16px]">
          Take AI orders
        </label>
        <SwitchPrimitive.Root
          id="accept-ai"
          checked={value.acceptAi}
          onCheckedChange={(acceptAi) => onChange({ acceptAi })}
          className={cn(
            "relative inline-flex h-11 w-[72px] shrink-0 items-center rounded-full border-2 border-ink transition-colors",
            value.acceptAi ? "bg-ink" : "bg-paper",
          )}
        >
          <SwitchPrimitive.Thumb
            className={cn(
              "block size-8 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.35)] transition-transform duration-200",
              value.acceptAi ? "translate-x-[33px] bg-paper" : "translate-x-[3px] bg-ink",
            )}
          />
        </SwitchPrimitive.Root>
      </div>
    </section>
  );
}

function TimeChip({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="relative inline-flex h-12 min-w-[118px] cursor-pointer items-center justify-center rounded-[3px] border-2 border-ink/75 bg-white/55 px-4 text-[17px] font-bold tabular-nums focus-within:outline-3 focus-within:outline-offset-1 focus-within:outline-carbon">
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
