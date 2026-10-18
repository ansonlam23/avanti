"use client";

import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { Stamp } from "@/components/brand";
import { cardAt, EARNED_LEAD, sealColumns, toGoLine, type LoyaltyCard } from "@/lib/loyalty/stamps";
import { cn } from "@/lib/utils";

// The shop's stamp card on the ticket (CONTRACTS §17/§18): one row of seals and
// one line. While the order is held, this pickup's seal waits outlined in teal;
// once it's picked up, it's pressed. (/privacy says how the device key works.)

const ANGLES = [-2, 1, -1, 2, -1.5, 0.5, -2.5, 1.5, -0.5, 2.5];
const STAMP_REST = 1.5;

function markOf(name: string): string {
  return name.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() ?? "•";
}

/** "1 of 5 · 4 more for a free cookie", or "This one's on the house: a free cookie" on the pickup that fills the card. */
export function stampLine(visit: number, every: number, reward: string): string {
  const { filled, toGo, complete } = cardAt(visit, every);
  return complete ? `${EARNED_LEAD} ${reward}` : `${filled} of ${every} · ${toGoLine(toGo, reward)}`;
}

export function TicketStamps({ card, paid }: { card: LoyaltyCard; paid: boolean }) {
  if (card.visit === null) return null;
  const visit = card.visit;
  const { filled } = cardAt(visit, card.every);
  const mark = markOf(card.shop_name);
  const cols = sealColumns(card.every);
  const size = cols <= 5 ? 44 : 40;
  const line = stampLine(visit, card.every, card.reward);
  return (
    <motion.article
      aria-label={`Stamp card at ${card.shop_name}: ${line}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="paper w-full px-6 py-6 shadow-[0_14px_30px_-24px_rgb(22_58_66/0.32)] lg:px-8 lg:py-8"
      style={{ "--seal": `${size}px`, "--cols": cols } as CSSProperties}
    >
      <p className="text-[13px] font-semibold uppercase leading-tight tracking-[0.13em] text-ink-muted">Stamp card</p>
      <ol aria-hidden className={cn("mt-3 grid grid-cols-[repeat(var(--cols),var(--seal))]", cols <= 5 ? "gap-2.5" : "gap-2")}>
        {Array.from({ length: card.every }, (_, i) => {
          const thisOne = i === filled - 1;
          const pressed = i < filled - 1 || (thisOne && paid);
          return (
            <li key={i} className="grid size-(--seal) place-items-center">
              {pressed ? (
                <span className="grid place-items-center" style={{ rotate: `${ANGLES[i % ANGLES.length] - STAMP_REST}deg` }}>
                  <Stamp
                    kind="PAID"
                    text={mark}
                    size="sm"
                    animate={thisOne}
                    sound={thisOne}
                    className={cn(
                      "[&_.stamp-ink]:size-(--seal) [&_.stamp-ink]:min-w-0 [&_.stamp-ink]:p-0",
                      size >= 44 ? "text-[21px]" : "text-[19px]",
                    )}
                  />
                </span>
              ) : thisOne ? (
                // this pickup: waiting to be pressed at the counter
                <span className="ticket-pulse grid size-full place-items-center border-2 border-dashed border-carbon font-display text-[20px] text-carbon">
                  {mark}
                </span>
              ) : (
                <span className={cn("block size-full border border-dashed", i === card.every - 1 ? "border-ink/50" : "border-ink/25")} />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[17px] leading-snug text-ink text-balance">{line}</p>
    </motion.article>
  );
}
