import { Stamp } from "@/components/brand";
import { formatPriceShort } from "@/lib/format";
import { isAiOrderable } from "@/lib/orders/ai-rules";
import type { Item, ShopRules } from "@/lib/types";
import { cn } from "@/lib/utils";

// The public menu: a clean paper slip, the same lines the owner built in /open.
// Names in Red Hat Text, prices in Red Hat Mono with dotted leaders. Sold out =
// struck through + the vermilion seal; no price yet = "ask at the counter"
// (never a guess); kept off-limits to AI by the owner = "in person only", quietly.
// Bigger type on laptops: it's the page's focal point.

/** A dietary tag on the slip: "contains-…" in ink, the rest quieter. */
function TagChip({ tag }: { tag: string }) {
  const contains = tag.startsWith("contains-");
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center border px-2 text-[15px] leading-none",
        contains ? "border-ink/55 font-semibold text-ink" : "border-ink/20 text-ink-muted",
      )}
    >
      {tag}
    </span>
  );
}

export function StorefrontMenu({
  title,
  items,
  rules,
  className,
}: {
  title: string;
  items: Item[];
  /** The shop's rules, for the owner's "AI can order this" switches. */
  rules?: ShopRules | null;
  className?: string;
}) {
  return (
    <section aria-label={`${title} menu`} className={cn("sf-slip px-6 pb-9 pt-8 sm:px-9 lg:px-12 lg:pb-12 lg:pt-11", className)}>
      <h2 className="text-center font-display text-[34px] font-normal leading-none text-ink lg:text-[42px]">{title}</h2>
      <div aria-hidden className="sf-rule my-6 lg:my-8" />

      {items.length === 0 ? (
        <p className="py-4 text-center text-[16px] text-ink-muted">Nothing on the menu yet.</p>
      ) : (
        <ul className="space-y-6 lg:space-y-7">
          {items.map((item) => {
            const soldOut = item.sold_out || item.stock <= 0;
            const inPersonOnly = !isAiOrderable(rules, item.id);
            return (
              <li key={item.id}>
                <div className={cn("flex items-baseline gap-2", soldOut && "text-ink-muted")}>
                  <span
                    className={cn(
                      "min-w-0 text-[17px] leading-snug [overflow-wrap:anywhere] lg:text-[19px]",
                      soldOut && "line-through decoration-ink/50 decoration-1",
                    )}
                  >
                    {item.name}
                  </span>
                  <span aria-hidden className="leader min-w-0!" />
                  <span className={cn("shrink-0 font-mono text-[16px] tabular-nums lg:text-[18px]", soldOut && "line-through decoration-ink/50 decoration-1")}>
                    {item.price_cents === null ? "—" : formatPriceShort(item.price_cents)}
                  </span>
                </div>
                {soldOut ? (
                  <Stamp kind="RELEASED" text="Sold out" size="sm" sound={false} className="mt-2" />
                ) : (
                  <>
                    {item.name_en && item.name_en.toLowerCase() !== item.name.toLowerCase() ? (
                      <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">{item.name_en}</p>
                    ) : null}
                    {item.description ? (
                      <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink-muted lg:text-[16px]">{item.description}</p>
                    ) : null}
                    {item.price_cents === null ? <p className="mt-0.5 text-[15px] text-ink-muted lg:text-[16px]">Price: ask at the counter</p> : null}
                    {item.tags.length || item.stock <= 3 || inPersonOnly ? (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {inPersonOnly ? <span className="mr-1.5 text-[15px] text-ink-muted lg:text-[16px]">in person only</span> : null}
                        {item.tags.map((t) => (
                          <TagChip key={t} tag={t} />
                        ))}
                        {item.stock <= 3 ? (
                          <span className={cn("text-[15px] font-semibold text-ink", (item.tags.length > 0 || inPersonOnly) && "ml-1.5")}>{item.stock} left</span>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
