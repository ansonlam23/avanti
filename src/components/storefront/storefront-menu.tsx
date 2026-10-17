import { formatPriceShort } from "@/lib/format";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

// The public menu: the same printed slip the owner built in /open.
// Sold out = struck in the owner's pen; no price yet = "ask at the counter"
// (never a guess). Bigger type on laptops: it's the page's focal point.

/** A dietary tag printed on the slip: "contains-…" in ink, the rest faded. */
function TagChip({ tag }: { tag: string }) {
  const contains = tag.startsWith("contains-");
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-[2px] border-[1.5px] px-1.5 text-[15px] leading-none",
        contains ? "border-ink font-bold" : "border-ink/35 text-ink-muted",
      )}
    >
      {tag}
    </span>
  );
}

export function StorefrontMenu({ title, items, className }: { title: string; items: Item[]; className?: string }) {
  return (
    <section aria-label={`${title} menu`} className={cn("slip-drop", className)} style={{ rotate: "0.5deg" }}>
      <div className="paper edge-torn-y px-6 pb-10 pt-9 sm:px-9 lg:px-12 lg:pb-14 lg:pt-12">
        <h2 className="thermal text-center font-display text-[34px] font-extrabold uppercase leading-none lg:text-[44px]">{title}</h2>
        <div aria-hidden className="print-rule my-5 lg:my-7" />

        {items.length === 0 ? (
          <p className="py-4 text-center text-[16px] text-ink-muted">Nothing on the menu yet.</p>
        ) : (
          <ul className="space-y-5 lg:space-y-6">
            {items.map((item) => {
              const soldOut = item.sold_out || item.stock <= 0;
              return (
                <li key={item.id}>
                  <div className="relative flex items-baseline gap-2">
                    <span
                      className={cn(
                        "min-w-0 text-[16px] uppercase leading-snug [overflow-wrap:anywhere] lg:text-[19px]",
                        soldOut && "text-ink-muted",
                      )}
                    >
                      {item.name}
                    </span>
                    <span aria-hidden className="leader" />
                    <span className={cn("shrink-0 text-[16px] font-bold tabular-nums lg:text-[19px]", soldOut && "text-ink-muted")}>
                      {item.price_cents === null ? "—" : formatPriceShort(item.price_cents)}
                    </span>
                    {soldOut ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-[-4px] top-[0.75em] h-[2.5px] -rotate-[0.8deg] rounded-full bg-carbon/85"
                      />
                    ) : null}
                  </div>
                  {soldOut ? (
                    <p className="pen mt-0.5 w-fit rotate-[-2deg] text-[28px] lg:text-[32px]">sold out</p>
                  ) : (
                    <>
                      {item.name_en && item.name_en.toLowerCase() !== item.name.toLowerCase() ? (
                        <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">{item.name_en}</p>
                      ) : null}
                      {item.description ? (
                        <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-ink-muted lg:text-[16px]">{item.description}</p>
                      ) : null}
                      {item.price_cents === null ? <p className="text-[15px] text-ink-muted">Price: ask at the counter</p> : null}
                      {item.tags.length || item.stock <= 3 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {item.tags.map((t) => (
                            <TagChip key={t} tag={t} />
                          ))}
                          {item.stock <= 3 ? <span className="text-[15px] font-bold">{item.stock} left</span> : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
