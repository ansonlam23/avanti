"use client";

import { motion } from "motion/react";
import { SimulatedBadge } from "@/components/brand";
import type { PaymentMode } from "@/lib/types";
import { Arrow } from "./arrow";
import { RISE, RISE_S } from "./ink";

export const DEFAULT_CHIPS = [
  "Birthday cake near campus by 6, no nuts",
  "What's open near campus right now?",
  "Anything nut-free under $10?",
];

/** First visit: one question, three things to try, the honesty line. */
export function EmptyState({
  chips,
  mode,
  onPick,
}: {
  chips: string[];
  mode: PaymentMode | null;
  onPick: (text: string) => void;
}) {
  return (
    // Phone: the welcome sits right above the composer (thumb reach). Laptop: centred in
    // the column (the header already carries the mark); short laptop screens tighten it (ask.css).
    <div className="ask-welcome flex flex-1 flex-col justify-end gap-8 pb-3 pt-6 lg:justify-center lg:gap-11 lg:pb-14 lg:pt-10">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: RISE }}>
        <h2 className="font-display text-[40px] font-normal leading-[1.08] tracking-[0.005em] text-balance text-carbon lg:max-w-[640px] lg:text-[64px] lg:leading-[1.04]">
          What can I find you nearby?
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted lg:mt-5 lg:max-w-[46ch] lg:text-[19px]">
          I order from small shops near campus. Visa holds it until pickup.
        </p>
      </motion.div>

      <div>
        <motion.p
          className="mb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: RISE_S, ease: RISE, delay: 0.2 }}
        >
          Try asking
        </motion.p>
        <ul className="ask-try" aria-label="Try asking">
          {chips.map((c, i) => (
            <motion.li
              key={c}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: RISE_S, ease: RISE, delay: 0.25 + i * 0.09 }}
            >
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left text-[16px] leading-snug text-ink lg:min-h-[64px] lg:text-[18px]"
              >
                <span className="ask-try-text pb-0.5">{c}</span>
                <Arrow className="text-carbon" />
              </button>
            </motion.li>
          ))}
        </ul>
      </div>

      <p className="flex flex-wrap items-center gap-2.5 text-[15px] text-ink-muted lg:text-[16px]">
        {mode === "simulated" ? <SimulatedBadge /> : null}
        <span>Test card · no real money</span>
      </p>
    </div>
  );
}
