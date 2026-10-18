"use client";

import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { Stamp } from "@/components/brand";
import { StampCard } from "@/components/ask/stamp-card";
import { cardAt, EARNED_LEAD, sealColumns, toGoLine, type LoyaltyCard } from "@/lib/loyalty/stamps";
import { cn } from "@/lib/utils";
// the chat's StampCard is an `ask-slip`: its paper lives in the chat's (fully ask-prefixed) stylesheet
import "@/components/ask/ask.css";

// The shop's stamp card on the ticket, right away (CONTRACTS §17/§18). While the
// order is held, this pickup's seal waits outlined in teal ("this pickup makes
// 3 of 5"); once it's picked up, the chat's StampCard presses it for real.

const ANGLES = [-2, 1, -1, 2, -1.5, 0.5, -2.5, 1.5, -0.5, 2.5];
const STAMP_REST = 1.5;

function markOf(name: string): string {
  return name.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() ?? "•";
}

export function TicketStamps({ card, paid }: { card: LoyaltyCard; paid: boolean }) {
  if (card.visit === null) return null;
  if (paid) return <StampCard card={card} />;
  return <PendingStamps card={card} visit={card.visit} />;
}

/** "This pickup makes 3 of 5 · 2 more for a free cookie", with this pickup's seal outlined. Exported for the lab. */
export function pendingLine(visit: number, every: number, reward: string): string {
  const { filled, toGo, complete } = cardAt(visit, every);
  if (complete) return `${EARNED_LEAD} ${reward}`;
  return `This pickup makes ${filled} of ${every} · ${toGo} more for ${reward}`;
}

function PendingStamps({ card, visit }: { card: LoyaltyCard; visit: number }) {
  const { filled, toGo, complete } = cardAt(visit, card.every);
  const mark = markOf(card.shop_name);
  const cols = sealColumns(card.every);
  const size = cols <= 5 ? 44 : 40;
  return (
    <motion.article
      aria-label={`Stamp card at ${card.shop_name}: ${pendingLine(visit, card.every, card.reward)}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="paper w-full max-w-[440px] px-6 pb-5 pt-5 shadow-[0_14px_30px_-24px_rgb(22_58_66/0.32)] lg:px-8 lg:pb-6 lg:pt-6"
      style={{ "--seal": `${size}px`, "--cols": cols } as CSSProperties}
    >
      <p className="text-[13px] font-semibold uppercase leading-tight tracking-[0.13em] text-ink-muted">Stamp card</p>
      <ol aria-hidden className={cn("mt-4 grid grid-cols-[repeat(var(--cols),var(--seal))]", cols <= 5 ? "gap-2.5" : "gap-2")}>
        {Array.from({ length: card.every }, (_, i) => {
          const pressed = i < filled - 1;
          const thisOne = i === filled - 1;
          return (
            <li key={i} className="grid size-(--seal) place-items-center">
              {pressed ? (
                <span className="grid place-items-center" style={{ rotate: `${ANGLES[i % ANGLES.length] - STAMP_REST}deg` }}>
                  <Stamp
                    kind="PAID"
                    text={mark}
                    size="sm"
                    sound={false}
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
      {complete ? (
        <p className="mt-4 font-display text-[22px] leading-snug text-ink lg:text-[24px]">
          {EARNED_LEAD}
          <br />
          <span className="text-balance">{card.reward}</span>
        </p>
      ) : (
        <p className="mt-4 text-[17px] leading-snug text-ink lg:text-[18px]">
          This pickup makes {filled} of {card.every}.
          <br />
          {toGoLine(toGo, card.reward)}.
        </p>
      )}
      <p className="mt-1.5 text-[15px] leading-snug text-ink-muted">Stamped when you pick up. Tied to this device, no account.</p>
    </motion.article>
  );
}
