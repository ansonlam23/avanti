"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AiMark } from "./ai-mark";

/** The AI is asked for plain text; if a stray **bold** or `code` slips through, show the words only. */
export function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");
}

/** The shopper: a note handed over the counter (a paper slip, right side). */
export function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, rotate: 1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0.6 }}
      transition={{ duration: 0.32, ease: EASE.out }}
      className="flex justify-end pl-14 lg:pl-32"
    >
      <p className="paper rounded-[2px] px-4 py-3 text-[16px] leading-snug shadow-slip lg:px-5 lg:py-3.5 lg:text-[17px]">{text}</p>
    </motion.div>
  );
}

/** The AI: its words printed straight onto the counter. Proactive messages ("Heads up") come on a yellow note. */
export function AiBubble({ text, streaming, proactive }: { text: string; streaming: boolean; proactive: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE.out }}
      className="flex items-start gap-3 pr-4 lg:pr-12"
    >
      <AiMark size={22} className="mt-1" />
      <div className={cn("min-w-0 text-[16px] leading-relaxed lg:text-[17px]", proactive && "pad -mt-1 rounded-[2px] px-4 py-3 shadow-slip lg:px-5 lg:py-4")}>
        {proactive ? <p className="label-print mb-1 text-ink-muted">Live from the shop</p> : null}
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
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 py-1"
      role="status"
    >
      <AiMark size={22} state="thinking" />
      <span className="text-[15px] text-ink-muted lg:text-[16px]">{text}</span>
    </motion.div>
  );
}

export function Notice({ text, tone }: { text: string; tone: "error" | "info" }) {
  return (
    <p role={tone === "error" ? "alert" : undefined} className={cn("pl-[34px] text-[15px] leading-snug lg:text-[16px]", tone === "error" ? "font-bold text-stamp-deep" : "text-ink-muted")}>
      {text}
    </p>
  );
}
