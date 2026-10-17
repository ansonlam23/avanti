"use client";

import { motion } from "motion/react";
import { ChalkMenu } from "@/components/brand";
import type { AskShopResult, MenuResult } from "@/lib/ai/shopper-types";
import { formatClock } from "@/lib/format";
import { EASE } from "@/lib/motion";

/** get_menu → the shop's live menu slip (sold-out lines struck in the owner's pen). */
export function MenuCard({
  result,
  gone,
  highlightId,
}: {
  result: MenuResult;
  gone: Record<string, true>;
  highlightId?: string | null;
}) {
  const { shop } = result;
  const items = result.items.slice(0, 8).map((i) => ({
    id: i.id,
    name: i.name,
    price_cents: i.price_cents,
    tags: i.tags,
    // unavailable because of no price ≠ sold out: the slip stamps NEEDS A PRICE for those
    sold_out: Boolean(gone[i.id]) || i.sold_out || i.stock <= 0,
    note: i.name_en ?? (i.tags.length ? i.tags.slice(0, 3).join(" · ") : null),
  }));
  const more = result.items.length - items.length;
  return (
    <motion.figure initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE.out }}>
      <ChalkMenu title={shop.name} items={items} highlightId={highlightId} tilt={-0.5} />
      <figcaption className="mt-3 px-1 text-[14px] text-ink-muted lg:text-[15px]">
        Live from the shop
        {shop.walk_minutes !== null ? ` · ${shop.walk_minutes} min walk` : ""}
        {` · pickup ${formatClock(shop.pickup_window.start)}–${formatClock(shop.pickup_window.end)}`}
        {shop.is_demo ? " · demo shop" : ""}
        {more > 0 ? ` · +${more} more` : ""}
      </figcaption>
    </motion.figure>
  );
}

/**
 * ask_shop → what the shop itself said about the question (tags, descriptions,
 * notes), so the AI's answer has visible receipts. "didn't say" when it didn't.
 * The shop's own words: a yellow note from its pad.
 */
export function ShopSaysCard({ result }: { result: AskShopResult }) {
  if (!result.topics.length) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 10, rotate: 1.2 }}
      animate={{ opacity: 1, y: 0, rotate: 0.5 }}
      transition={{ duration: 0.4, ease: EASE.out }}
      className="pad rounded-[2px] px-5 py-4 shadow-slip"
      aria-label={`What ${result.shop.name} says`}
    >
      <p className="label-print text-ink-muted">In {result.shop.name}&apos;s own words</p>
      <div className="mt-2 space-y-3">
        {result.topics.slice(0, 2).map((t) => {
          const withSays = t.items.filter((i) => i.says.length);
          const rows = [...withSays, ...t.items.filter((i) => !i.says.length)].slice(0, 4);
          return (
            <div key={t.topic}>
              {result.topics.length > 1 ? <p className="text-[14px] font-bold capitalize">{t.topic}</p> : null}
              {t.shop_says.map((s) => (
                <p key={s} className="text-[15px] leading-snug">
                  {quoteOf(s)}
                </p>
              ))}
              <ul className="mt-1 space-y-1">
                {rows.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px]">
                    <span className="uppercase">{i.name}</span>
                    {i.says.length ? i.says.map((s) => <Said key={s} text={s} />) : <span className="text-ink-muted">didn&apos;t say</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function Said({ text }: { text: string }) {
  if (text.startsWith("tag: ")) {
    return (
      <span className="inline-flex h-7 items-center rounded-[2px] border-[1.5px] border-ink px-1.5 text-[14px] font-bold leading-none">
        {text.slice(5)}
      </span>
    );
  }
  return <span className="text-ink-muted">{quoteOf(text)}</span>;
}

/** 'description: "Made with butter."' → “Made with butter.” */
function quoteOf(s: string): string {
  const m = /^[a-z ]+: "(.*)"$/i.exec(s);
  return m ? `“${m[1]}”` : s;
}
