"use client";

import { motion } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import { Stamp } from "@/components/brand";
import { ms } from "@/components/brand/motion-prefs";
import { cardAt, EARNED_LEAD, earnedLine, ordinal, sealColumns, toGoLine, type LoyaltyCard } from "@/lib/loyalty/stamps";
import { cn } from "@/lib/utils";
import { RISE } from "./ink";

// The shop's stamp card (CONTRACTS §17), laid in the conversation when an order
// is picked up: the shop's name, rows of seals (pressed = pickups, dashed = to
// go) and one line, "2 more for a free cookie". The pickup that fills the card
// says "This one's on the house: …". The newest seal is pressed a beat after
// the card lands (the brand seal: 0.6 s, a soft thunk when sound is on).

/** Net angles of the pressed seals: hand-pressed, never quite square. */
const ANGLES = [-2, 1, -1, 2, -1.5, 0.5, -2.5, 1.5, -0.5, 2.5];
const STAMP_REST = 1.5; // the Stamp's own rest angle for kind "PAID"

/** The seal's mark: the shop's first letter or digit (M for Mai's Bakery). */
function markOf(name: string): string {
  return name.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() ?? "•";
}

export function StampCard({ card }: { card: LoyaltyCard }) {
  const visit = card.visit ?? card.stamps;
  const { filled, toGo, complete } = cardAt(visit, card.every);
  const line = complete ? earnedLine(card.reward) : toGoLine(toGo, card.reward);
  const mark = markOf(card.shop_name);
  // Even rows of at most 6; six 40px seals still fit a 390px phone.
  const cols = sealColumns(card.every);
  const size = cols <= 5 ? 44 : 40;
  // The newest seal waits for the card to settle, then it's pressed.
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setPressed(true), ms(0.75));
    return () => window.clearTimeout(t);
  }, []);

  return (
    <motion.article
      aria-label={`Stamp card at ${card.shop_name}: ${filled} of ${card.every} stamps, your ${ordinal(visit)} pickup. ${line}.`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: RISE }}
      className="ask-slip w-full max-w-[380px] px-6 pb-5 pt-5 lg:px-7 lg:pb-6 lg:pt-6"
      style={{ "--seal": `${size}px`, "--cols": cols } as CSSProperties}
    >
      <p className="text-[13px] font-semibold uppercase leading-tight tracking-[0.13em] text-ink-muted">Stamp card</p>
      <h3 className="mt-1.5 font-display text-[26px] font-normal leading-[1.1] text-ink lg:text-[28px]">{card.shop_name}</h3>

      <ol aria-hidden className={cn("mt-5 grid grid-cols-[repeat(var(--cols),var(--seal))]", cols <= 5 ? "gap-2.5" : "gap-2")}>
        {Array.from({ length: card.every }, (_, i) => {
          const newest = i === filled - 1;
          const inked = i < filled - 1 || (newest && pressed);
          return (
            <li key={i} className="grid size-(--seal) place-items-center">
              {inked ? (
                <span className="grid place-items-center" style={{ rotate: `${ANGLES[i % ANGLES.length] - STAMP_REST}deg` }}>
                  <Stamp
                    kind="PAID"
                    text={mark}
                    size="sm"
                    animate={newest}
                    sound={newest}
                    className={cn(
                      "[&_.stamp-ink]:size-(--seal) [&_.stamp-ink]:min-w-0 [&_.stamp-ink]:p-0",
                      size >= 44 ? "text-[21px]" : "text-[19px]",
                    )}
                  />
                </span>
              ) : (
                // still to go; the last square is the one with the reward
                <span
                  className={cn(
                    "block size-full border border-dashed",
                    i === card.every - 1 ? "border-ink/50" : "border-ink/25",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {complete ? (
        <p className="mt-5 font-display text-[22px] leading-snug text-ink lg:text-[24px]">
          {EARNED_LEAD}
          <br />
          <span className="text-balance">{card.reward}</span>
        </p>
      ) : (
        <p className="mt-5 text-balance text-[17px] text-ink lg:text-[18px]">{line}</p>
      )}
      <p className="mt-1.5 text-[15px] leading-snug text-ink-muted">Tied to this device, no account.</p>
    </motion.article>
  );
}
