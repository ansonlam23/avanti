"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AiMark } from "./ai-mark";
import { RISE } from "./ink";

// The conversation, as ink on rice paper: the shopper's notes are paper slips
// (right), the AI's words are printed straight onto the page (left, by its
// mark). No bubbles, no tilt; everything rises in calmly.

/** The AI is asked for plain text; if a stray **bold** or `code` slips through, show the words only. */
export function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");
}

/** The shopper: a note handed over the counter (a paper slip, right side). */
export function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: RISE }}
      className="flex justify-end pl-12 lg:pl-28"
    >
      <p className="ask-slip whitespace-pre-wrap break-words px-4 py-3 text-[16px] leading-relaxed lg:px-5 lg:py-3.5 lg:text-[17px]">{text}</p>
    </motion.div>
  );
}

/** The AI: its words in ink on the page. Proactive messages ("Heads up") come on the shop's teal wash. */
export function AiBubble({ text, streaming, proactive }: { text: string; streaming: boolean; proactive: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: RISE }}
      className={cn("flex items-start gap-3.5 pr-2 lg:pr-12", proactive && "lg:max-w-[600px] lg:pr-0")}
    >
      <AiMark size={22} className="mt-[3px]" />
      <div
        className={cn(
          "min-w-0 flex-1 text-[16px] leading-[1.65] lg:text-[17px]",
          proactive && "ask-wash -mt-1 border-l-2 border-l-carbon px-4 py-3 lg:px-5 lg:py-4",
        )}
      >
        {proactive ? <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-carbon">Live from the shop</p> : null}
        <p className="whitespace-pre-wrap break-words">
          {plain(text)}
          {streaming ? <span aria-hidden className="ask-caret" /> : null}
        </p>
      </div>
    </motion.div>
  );
}

/** Status sentences instead of spinners: "Looking at shops near campus…" */
export function StatusLine({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, ease: RISE }}
      className="flex items-center gap-3.5 py-1"
      role="status"
    >
      <AiMark size={22} state="thinking" />
      <span className="text-[15px] text-ink-muted lg:text-[16px]">{text}</span>
    </motion.div>
  );
}

export function Notice({ text, tone }: { text: string; tone: "error" | "info" }) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "ml-[36px] text-[15px] leading-snug lg:text-[16px]",
        tone === "error" ? "border-l-2 border-stamp py-1 pl-3 font-semibold text-stamp-deep" : "text-ink-muted",
      )}
    >
      {text}
    </p>
  );
}
