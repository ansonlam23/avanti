"use client";

import { Stamp } from "@/components/brand";
import { InkToggle } from "@/components/open/ink-toggle";
import { formatPriceShort } from "@/lib/format";
import { isAiOrderable } from "@/lib/orders/ai-rules";
import { cn } from "@/lib/utils";
import type { Item, ShopRules } from "@/lib/types";

/**
 * The owner's menu on a paper slip. Each line has two square switches: "AI
 * can order" (off = in person only; the shop's door refuses it before Visa)
 * and "Sold out" (on = the vermilion SOLD OUT seal lands on the line).
 */
export function MenuRows({
  items,
  rules,
  busyId,
  onToggleSoldOut,
  onToggleAiOrderable,
}: {
  items: Item[];
  rules?: ShopRules;
  busyId: string | null;
  onToggleSoldOut: (item: Item, soldOut: boolean) => void;
  onToggleAiOrderable?: (item: Item, orderable: boolean) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="pt-6 text-center">
        <p className="font-display text-[30px] leading-[1.1]">Nothing on the menu</p>
        <p className="mt-3 text-[16px] text-ink-muted">Items you add when opening show up here.</p>
      </div>
    );
  }
  return (
    <div className="slip-drop">
      <ul className="paper px-5 py-1 lg:px-6" aria-label="Menu stock">
        {items.map((item) => {
          const out = item.sold_out || item.stock <= 0;
          const ai = isAiOrderable(rules, item.id);
          const busy = busyId === item.id;
          return (
            <li key={item.id} className="border-b border-ink/10 py-4 last:border-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[17px] leading-snug [overflow-wrap:anywhere] lg:text-[18px]", out && "text-ink-muted")}>{item.name}</p>
                  <p className="mt-1 font-mono text-[15px] text-ink-muted">
                    {item.price_cents === null ? "needs a price" : formatPriceShort(item.price_cents)}
                    {item.sold_out ? null : ` · ${item.stock} left`}
                  </p>
                </div>
                {out ? <Stamp kind="FAILED" text="Sold out" size="sm" sound={false} className="mt-0.5 shrink-0" /> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 lg:gap-x-6">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <InkToggle
                    checked={ai}
                    disabled={busy}
                    onCheckedChange={(v) => onToggleAiOrderable?.(item, v)}
                    aria-label={`AI can order ${item.name}`}
                  />
                  <span className={cn("text-[15px] lg:text-[16px]", ai ? "text-ink" : "text-ink-muted")}>AI can order</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <InkToggle
                    checked={item.sold_out}
                    disabled={busy}
                    onCheckedChange={(v) => onToggleSoldOut(item, v)}
                    aria-label={`${item.name} sold out`}
                  />
                  <span className={cn("text-[15px] lg:text-[16px]", item.sold_out ? "text-ink" : "text-ink-muted")}>Sold out</span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
