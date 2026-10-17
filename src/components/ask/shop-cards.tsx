"use client";

import { motion } from "motion/react";
import type { ItemSummary, SearchShop, SearchShopsResult } from "@/lib/ai/shopper-types";
import { formatClock, formatPriceShort } from "@/lib/format";
import { EASE, STAGGER } from "@/lib/motion";
import { cn } from "@/lib/utils";

const MAX_CARDS = 3;
const TILT = [-0.7, 0.5, -0.3];

export function SearchResults({
  result,
  gone,
  mine,
}: {
  result: SearchShopsResult;
  gone: Record<string, true>;
  mine: readonly string[];
}) {
  if (!result.shops.length) return null;
  const shown = result.shops.slice(0, MAX_CARDS);
  const more = result.shops.length - shown.length;
  return (
    <div className="space-y-4">
      {shown.map((shop, i) => (
        <motion.div
          key={shop.slug}
          initial={{ opacity: 0, y: 14, rotate: TILT[i % 3] * 3 }}
          animate={{ opacity: 1, y: 0, rotate: TILT[i % 3] }}
          transition={{ duration: 0.45, ease: EASE.out, delay: i * STAGGER.line * 1.5 }}
        >
          <ShopCard shop={shop} neededBy={result.needed_by} gone={gone} mine={mine.includes(shop.slug)} />
        </motion.div>
      ))}
      {more > 0 ? <p className="px-1 text-[14px] text-ink-muted lg:text-[15px]">+{more} more nearby</p> : null}
    </div>
  );
}

/** A shop as a printed slip: name, distance + pickup, and what matched, as receipt lines. */
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
  const when =
    neededBy && shop.ready_by_needed !== null
      ? shop.ready_by_needed
        ? `ready by ${neededBy}`
        : `can't make ${neededBy}`
      : shop.pickup_open_now
        ? `pickup till ${formatClock(shop.pickup_window.end)}`
        : shop.earliest_pickup
          ? `pickup from ${shop.earliest_pickup}`
          : null;
  const meta = [shop.walk_minutes !== null ? `${shop.walk_minutes} min walk` : shop.location_label, when].filter(Boolean);
  const extra = Math.max(0, shop.matches.length - 3) + shop.more_matches;

  return (
    <article className="paper rounded-[2px] px-5 pb-4 pt-4 shadow-slip">
      <div className="flex gap-3">
        <ShopPhoto url={shop.photo_url} name={shop.name} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[26px] font-extrabold uppercase leading-none">{shop.name}</h3>
          <p className="mt-1 truncate text-[14px] text-ink-muted lg:text-[15px]">{meta.join(" · ")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shop.accepts_ai_orders ? (
              <a
                href={`/s/${shop.slug}/agent.json`}
                target="_blank"
                rel="noreferrer"
                className="relative inline-flex h-7 items-center rounded-[2px] border-[1.5px] border-ink px-1.5 font-display text-[15px] font-extrabold uppercase leading-none after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']"
              >
                AI-ready ✓
              </a>
            ) : (
              <Chip>not taking AI orders</Chip>
            )}
            {shop.is_demo ? <Chip>demo shop</Chip> : null}
            {mine ? <Chip strong>your shop</Chip> : null}
          </div>
        </div>
      </div>
      {shop.matches.length ? (
        <ul className="mt-4 space-y-2 border-t-[1.5px] border-dashed border-ink/25 pt-3">
          {shop.matches.slice(0, 3).map((item) => (
            <MatchRow key={item.id} item={item} gone={Boolean(gone[item.id])} />
          ))}
          {extra > 0 ? <li className="text-[14px] text-ink-muted lg:text-[15px]">+{extra} more on the menu</li> : null}
        </ul>
      ) : null}
    </article>
  );
}

function MatchRow({ item, gone }: { item: ItemSummary; gone: boolean }) {
  const soldOut = gone || item.sold_out || item.stock <= 0;
  const note = [...item.tags.slice(0, 2), !soldOut && item.price_cents !== null && item.stock <= 3 ? `${item.stock} left` : null].filter(Boolean);
  return (
    <li>
      <div className={cn("relative flex items-baseline gap-2 text-[15px]", soldOut && "text-ink-muted")}>
        <span className="min-w-0 break-words uppercase">{item.name}</span>
        <span aria-hidden className="leader" />
        <span className={cn("shrink-0 font-bold tabular-nums", item.price_cents === null && "font-normal text-ink-muted")}>
          {item.price_cents === null ? "no price" : formatPriceShort(item.price_cents)}
        </span>
        {soldOut ? <span aria-hidden className="absolute inset-x-[-3px] top-[0.7em] h-[2px] -rotate-[0.6deg] rounded-full bg-carbon/85" /> : null}
      </div>
      {soldOut ? (
        <p className="pen mt-0.5 w-fit rotate-[-2deg] text-[24px]">{gone ? "sold out just now" : "sold out"}</p>
      ) : note.length || item.name_en ? (
        <p className="text-[14px] leading-snug lg:text-[15px] text-ink-muted">{[item.name_en, ...note].filter(Boolean).join(" · ")}</p>
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
        className="shrink-0 rounded-[2px] bg-paper object-cover p-1 shadow-slip"
        style={{ width: size, height: size, rotate: "-2deg" }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[2px] bg-ink text-paper"
      style={{ width: size, height: size }}
    >
      <span className="font-display text-[32px] font-black uppercase leading-none">{name.trim().charAt(0) || "?"}</span>
    </div>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-[2px] border-[1.5px] px-1.5 text-[14px] leading-none",
        strong ? "border-ink font-bold" : "border-ink/30 text-ink-muted",
      )}
    >
      {children}
    </span>
  );
}
