"use client";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import { SimulatedBadge } from "@/components/brand";
import { EASE, STAGGER } from "@/lib/motion";
import type { PaymentMode } from "@/lib/types";
import { AiMark } from "./ai-mark";

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
    // Phone: the welcome sits right above the composer (thumb reach). Laptop: centered in
    // the column (the header already carries the mark); short laptop screens tighten it (ask.css).
    <div className="ask-welcome flex flex-1 flex-col justify-end gap-7 pb-2 pt-6 lg:justify-center lg:gap-10 lg:pb-12 lg:pt-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE.out }}>
        <div className="flex lg:hidden">
          <AiMark size={44} state="listening" />
        </div>
        <h2 className="thermal mt-5 font-display text-[40px] font-extrabold uppercase leading-[0.92] text-balance lg:mt-0 lg:max-w-[640px] lg:text-[68px] lg:leading-[0.9]">
          What can I find you nearby?
        </h2>
        <p className="mt-3 text-[16px] leading-snug text-ink-muted lg:mt-5 lg:max-w-[44ch] lg:text-[18px] lg:leading-relaxed">
          I order from small shops near campus. Visa holds it until pickup.
        </p>
      </motion.div>

      <ul className="space-y-3" aria-label="Try asking">
        {chips.map((c, i) => (
          <motion.li
            key={c}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE.out, delay: 0.25 + i * STAGGER.line }}
          >
            <button
              type="button"
              onClick={() => onPick(c)}
              className="paper group flex min-h-14 w-full items-center justify-between gap-3 rounded-[2px] px-4 py-3 text-left text-[16px] leading-snug shadow-slip transition hover:shadow-[var(--shadow-lift)] active:scale-[0.99] lg:min-h-16 lg:px-5 lg:text-[17px]"
              style={{ rotate: `${[-0.5, 0.4, -0.3][i % 3]}deg` }}
            >
              <span>{c}</span>
              <ArrowUpRight aria-hidden className="size-5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </motion.li>
        ))}
      </ul>

      <p className="flex flex-wrap items-center gap-2 text-[14px] text-ink-muted lg:text-[15px]">
        {mode === "simulated" ? <SimulatedBadge /> : null}
        <span>Test card · no real money</span>
      </p>
    </div>
  );
}
