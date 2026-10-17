"use client";

import { useState } from "react";
import { parsePriceInput } from "@/components/open/menu-board";
import { formatPriceShort } from "@/lib/format";
import { aiOrderLimitCents } from "@/lib/orders/ai-rules";
import type { ShopRules } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS = [null, 2000, 4000, 8000] as const;

/**
 * The owner's cap on one AI order (CONTRACTS §13): No cap · $20 · $40 · $80,
 * or any amount typed into "Other". Square segments; the chosen one is teal.
 * The shop's door refuses a bigger AI order before Visa is ever asked.
 */
export function AiLimit({
  rules,
  busy,
  onChange,
  className,
}: {
  rules: ShopRules;
  busy?: boolean;
  onChange?: (cents: number | null) => Promise<boolean>;
  className?: string;
}) {
  const cents = aiOrderLimitCents(rules);
  const custom = cents !== null && !(PRESETS as readonly (number | null)[]).includes(cents);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const shown = text || (custom ? (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)) : "");

  const commit = async () => {
    if (!text.trim()) return;
    const parsed = parsePriceInput(text);
    if (parsed === "invalid" || parsed === null || parsed < 100) {
      setBad(true);
      return;
    }
    setBad(false);
    if (parsed === cents) return setText("");
    if (await onChange?.(parsed)) setText("");
  };

  const seg = "relative -ml-px inline-flex h-11 items-center justify-center border px-3 text-[15px] transition-colors duration-200 first:ml-0 lg:text-[16px]";
  return (
    <div className={className}>
      <p id="ai-limit-label" className="text-[16px]">
        AI orders up to
      </p>
      <div role="radiogroup" aria-labelledby="ai-limit-label" className="mt-2.5 flex flex-wrap">
        {PRESETS.map((p) => {
          const on = !custom && cents === p;
          return (
            <button
              key={p ?? "none"}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              onClick={() => {
                setText("");
                setBad(false);
                if (!on) void onChange?.(p);
              }}
              className={cn(
                seg,
                on ? "z-10 border-carbon bg-carbon text-paper" : "border-ink/25 bg-paper text-ink hover:z-10 hover:border-ink/55",
                "disabled:opacity-60",
              )}
            >
              {p === null ? "No cap" : formatPriceShort(p)}
            </button>
          );
        })}
        <label
          className={cn(
            seg,
            "w-[86px] cursor-text justify-start gap-1 px-2.5 focus-within:z-20 focus-within:border-carbon focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-carbon",
            bad ? "z-10 border-stamp-deep" : custom ? "z-10 border-carbon bg-highlight/50" : "border-ink/25 bg-paper",
          )}
        >
          <span className="font-mono text-ink-muted">$</span>
          <input
            inputMode="decimal"
            value={shown}
            placeholder="Other"
            aria-label="Other AI limit in dollars"
            aria-invalid={bad || undefined}
            disabled={busy}
            onChange={(e) => {
              setText(e.target.value.slice(0, 7));
              setBad(false);
            }}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              }
            }}
            className="w-full min-w-0 bg-transparent font-mono text-[16px] outline-none placeholder:font-sans placeholder:text-ink-muted"
          />
        </label>
      </div>
      {bad ? <p className="mt-2 text-[15px] font-semibold text-stamp-deep">Between $1 and $1,000.</p> : null}
    </div>
  );
}
