"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { formatPriceShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/types";

/**
 * The owner's menu on a printed slip, one switch per line: flip an item to
 * sold out and the line is struck through in the owner's pen.
 */
export function MenuRows({
  items,
  busyId,
  onToggleSoldOut,
}: {
  items: Item[];
  busyId: string | null;
  onToggleSoldOut: (item: Item, soldOut: boolean) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="pt-6 text-center">
        <p className="font-display text-[30px] font-extrabold uppercase leading-none">Nothing on the menu</p>
        <p className="mt-3 text-[15px] text-ink-muted">Items you add when opening show up here.</p>
      </div>
    );
  }
  return (
    <div className="slip-drop" style={{ rotate: "0.4deg" }}>
      <ul className="paper edge-torn-y px-5 py-6" aria-label="Menu stock">
        {items.map((item) => {
          const out = item.sold_out || item.stock <= 0;
          return (
            <li key={item.id} className="flex min-h-[68px] items-center gap-4 border-b border-dashed border-ink/15 py-3 last:border-0">
              <div className="relative min-w-0 flex-1">
                <p className={cn("text-[16px] uppercase leading-snug [overflow-wrap:anywhere]", out && "text-ink-muted")}>{item.name}</p>
                <p className="text-[14px] text-ink-muted lg:text-[15px]">
                  {item.price_cents === null ? "needs a price" : formatPriceShort(item.price_cents)} ·{" "}
                  {item.sold_out ? "sold out" : `${item.stock} left`}
                </p>
                {out ? (
                  <span aria-hidden className="pointer-events-none absolute inset-x-[-4px] top-[0.8em] h-[2.5px] -rotate-[1.2deg] rounded-full bg-carbon/85" />
                ) : null}
              </div>
              <label className="flex shrink-0 cursor-pointer flex-col items-center gap-1">
                <SwitchPrimitive.Root
                  checked={item.sold_out}
                  disabled={busyId === item.id}
                  onCheckedChange={(v) => onToggleSoldOut(item, v)}
                  aria-label={`${item.name} sold out`}
                  className={cn(
                    "relative inline-flex h-9 w-[60px] items-center rounded-full border-2 border-ink transition-colors disabled:opacity-45",
                    item.sold_out ? "bg-ink" : "bg-paper",
                  )}
                >
                  <SwitchPrimitive.Thumb
                    className={cn(
                      "block size-6 rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.35)] transition-transform duration-200",
                      item.sold_out ? "translate-x-[28px] bg-paper" : "translate-x-[4px] bg-ink",
                    )}
                  />
                </SwitchPrimitive.Root>
                <span className="text-[14px] text-ink-muted lg:text-[15px]">Sold out</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
