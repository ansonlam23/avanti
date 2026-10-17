"use client";

import { motion } from "motion/react";
import { ChalkMenu } from "@/components/brand";
import type { AskShopResult, MenuResult } from "@/lib/ai/shopper-types";
import { formatClock, formatPriceShort } from "@/lib/format";
import { RISE, RISE_S } from "./ink";

/** get_menu → the shop's live menu slip (sold-out lines struck in the owner's pen). Square, never tilted. */
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
  const items = result.items.slice(0, 8).map((i) => {
    const note = i.name_en ?? (i.tags.length ? i.tags.slice(0, 3).join(" · ") : null);
    return {
      id: i.id,
      name: i.name,
      price_cents: i.price_cents,
      tags: i.tags,
      // unavailable because of no price ≠ sold out: the slip stamps NEEDS A PRICE for those
      sold_out: Boolean(gone[i.id]) || i.sold_out || i.stock <= 0,
      // the owner sells it over the counter only (AI can't order it): said quietly under the line
      note: i.ai_orderable === false ? ["in person only", note].filter(Boolean).join(" · ") : note,
    };
  });
  const cap = shop.accepts_ai_orders ? (shop.ai_order_limit_cents ?? null) : null;
  const more = result.items.length - items.length;
  return (
    <motion.figure initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: RISE_S, ease: RISE }}>
      <ChalkMenu title={shop.name} items={items} highlightId={highlightId} tilt={0} />
      <figcaption className="mt-3 px-1 text-[15px] text-ink-muted lg:text-[16px]">
        Live from the shop
        {shop.walk_minutes !== null ? ` · ${shop.walk_minutes} min walk` : ""}
        {` · pickup ${formatClock(shop.pickup_window.start)}–${formatClock(shop.pickup_window.end)}`}
        {shop.is_demo ? " · demo shop" : ""}
        {cap ? ` · AI orders up to ${formatPriceShort(cap)}` : ""}
        {more > 0 ? ` · +${more} more` : ""}
      </figcaption>
    </motion.figure>
  );
}

/**
 * ask_shop → what the shop itself said about the question (tags, descriptions,
 * notes), so the AI's answer has visible receipts. "didn't say" when it didn't.
 * The shop's own words: on the teal wash (the shop's side).
 */
export function ShopSaysCard({ result }: { result: AskShopResult }) {
  if (!result.topics.length) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: RISE_S, ease: RISE }}
      className="ask-wash border-l-2 border-l-carbon px-5 py-4 lg:px-6"
      aria-label={`What ${result.shop.name} says`}
    >
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-carbon">In {result.shop.name}&apos;s own words</p>
      <div className="mt-2.5 space-y-3">
        {result.topics.slice(0, 2).map((t) => {
          const withSays = t.items.filter((i) => i.says.length);
          const rows = [...withSays, ...t.items.filter((i) => !i.says.length)].slice(0, 4);
          return (
            <div key={t.topic}>
              {result.topics.length > 1 ? <p className="text-[15px] font-semibold capitalize">{t.topic}</p> : null}
              {t.shop_says.map((s) => (
                <p key={s} className="text-[16px] leading-snug lg:text-[17px]">
                  {quoteOf(s)}
                </p>
              ))}
              <ul className="mt-1.5 space-y-1.5">
                {rows.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[16px] lg:text-[17px]">
                    <span>{i.name}</span>
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
      <span className="inline-flex h-7 items-center border border-ink/50 bg-paper/60 px-2 text-[15px] font-semibold leading-none">
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
