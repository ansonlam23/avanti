"use client";

import { motion } from "motion/react";
import { Fragment, useMemo } from "react";
import { Stamp } from "@/components/brand";
import type { ItemSummary, SearchShop, SearchShopsResult } from "@/lib/ai/shopper-types";
import { formatPriceShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RISE, RISE_S } from "./ink";
import { askedNeeds, shopLine } from "./why";
import { useShareWhy, useWhySources } from "./why-store";

const MAX_CARDS = 3;

export function SearchResults({
  result,
  gone,
  mine,
}: {
  result: SearchShopsResult;
  gone: Record<string, true>;
  mine: readonly string[];
}) {
  // what this search found (tags, deadline, the owner's AI cap) backs the order card's "Why" line
  useShareWhy(useMemo(() => ({ kind: "search" as const, result }), [result]));
  if (!result.shops.length) return null;
  const shown = result.shops.slice(0, MAX_CARDS);
  const more = result.shops.length - shown.length;
  return (
    <div className="space-y-3.5">
      {shown.map((shop, i) => (
        <motion.div
          key={shop.slug}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: RISE_S, ease: RISE, delay: i * 0.12 }}
        >
          <ShopCard shop={shop} neededBy={result.needed_by} gone={gone} mine={mine.includes(shop.slug)} />
        </motion.div>
      ))}
      {more > 0 ? <p className="px-1 text-[15px] text-ink-muted lg:text-[16px]">+{more} more nearby</p> : null}
    </div>
  );
}

/** A shop as a paper slip: name, why it fits (the need it meets, distance, pickup), and what matched. */
export function ShopCard({
  shop,
  neededBy,
  gone,
  mine,
}: {
  shop: SearchShop;
  neededBy: string | null;
  gone: Record<string, true>;
  mine: boolean;
}) {
  // reasons first, said short: "nut-free · 11 min walk · ready by 6 PM" (only what the shop's data says)
  const sources = useWhySources();
  const asked = useMemo(() => askedNeeds(sources), [sources]);
  const meta = shopLine(shop, neededBy, asked, gone);
  const extra = Math.max(0, shop.matches.length - 3) + shop.more_matches;

  return (
    <article className="ask-slip px-5 pb-4 pt-4 lg:px-6 lg:pb-5 lg:pt-5">
      <div className="flex gap-4">
        <ShopPhoto url={shop.photo_url} name={shop.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[25px] font-normal leading-[1.1] text-ink lg:text-[27px]">{shop.name}</h3>
          <p className="mt-1 text-[15px] leading-snug text-ink-muted lg:text-[16px]">
            {meta.map((part, i) => (
              <Fragment key={part}>
                {i ? " · " : null}
                {/* short parts stay whole; a long street name may still wrap */}
                <span className={part.length <= 24 ? "whitespace-nowrap" : undefined}>{part}</span>
              </Fragment>
            ))}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1.5">
            {shop.accepts_ai_orders ? (
              <a
                href={`/s/${shop.slug}/agent.json`}
                target="_blank"
                rel="noreferrer"
                className="relative inline-flex h-7 items-center gap-1 border border-carbon/45 px-2 text-[15px] font-semibold leading-none text-carbon transition-colors hover:border-carbon after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
              >
                AI-ready ✓
              </a>
            ) : (
              <Chip>not taking AI orders</Chip>
            )}
            {shop.is_demo ? <Chip>demo shop</Chip> : null}
            {mine ? <Chip strong>your shop</Chip> : null}
            {/* the owner's spending cap for AI orders, said quietly */}
            {shop.accepts_ai_orders && shop.ai_order_limit_cents ? (
              <span className="inline-flex h-7 items-center text-[15px] text-ink-muted">AI orders up to {formatPriceShort(shop.ai_order_limit_cents)}</span>
            ) : null}
          </div>
        </div>
      </div>
      {shop.matches.length ? (
        <ul className="mt-4 space-y-2.5 border-t border-dotted border-ink/35 pt-3.5">
          {shop.matches.slice(0, 3).map((item) => (
            <MatchRow key={item.id} item={item} gone={Boolean(gone[item.id])} />
          ))}
          {extra > 0 ? <li className="text-[15px] text-ink-muted lg:text-[16px]">+{extra} more on the menu</li> : null}
        </ul>
      ) : null}
    </article>
  );
}

function MatchRow({ item, gone }: { item: ItemSummary; gone: boolean }) {
  const soldOut = gone || item.sold_out || item.stock <= 0;
  // the owner sells this one over the counter only: quiet, muted, never looks orderable
  const inPersonOnly = item.ai_orderable === false;
  const note = [
    inPersonOnly ? "in person only" : null,
    ...item.tags.slice(0, 2),
    !soldOut && !inPersonOnly && item.price_cents !== null && item.stock <= 3 ? `${item.stock} left` : null,
  ].filter(Boolean);
  return (
    <li>
      <div className={cn("flex items-baseline gap-2 text-[16px] lg:text-[17px]", (soldOut || inPersonOnly) && "text-ink-muted")}>
        <span className={cn("min-w-0 break-words", soldOut && "line-through decoration-ink/50 decoration-1")}>{item.name}</span>
        <span aria-hidden className="leader min-w-0!" />
        <span className={cn("shrink-0 font-mono text-[15px] tabular-nums lg:text-[16px]", item.price_cents === null && "font-sans text-ink-muted")}>
          {item.price_cents === null ? "needs a price" : formatPriceShort(item.price_cents)}
        </span>
      </div>
      {soldOut ? (
        <div className="mt-1.5 flex items-center gap-2.5">
          <Stamp kind="RELEASED" text="Sold out" size="sm" sound={false} />
          {gone ? <span className="text-[15px] text-ink-muted">just now</span> : null}
        </div>
      ) : note.length || item.name_en ? (
        <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">{[item.name_en, ...note].filter(Boolean).join(" · ")}</p>
      ) : null}
    </li>
  );
}

export function ShopPhoto({ url, name, size = 64 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      // Shop photos live in Supabase storage; a plain img keeps next.config untouched.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 border border-ink/15 bg-paper object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div aria-hidden className="ask-wash flex shrink-0 items-center justify-center text-carbon" style={{ width: size, height: size }}>
      <span className="pb-1 font-display text-[34px] font-normal leading-none">{name.trim().charAt(0) || "?"}</span>
    </div>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center border px-2 text-[15px] leading-none",
        strong ? "border-ink/60 font-semibold text-ink" : "border-ink/20 text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
