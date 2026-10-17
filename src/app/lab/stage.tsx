"use client";

import { RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StageBg = "counter" | "paper" | "dim" | "steel";

const BG: Record<StageBg, string> = {
  counter: "bg-counter bg-[radial-gradient(120%_80%_at_50%_0%,rgb(255_253_246/0.6),transparent_62%)]",
  paper: "bg-paper",
  dim: "bg-[#3a3631]",
  steel: "bg-[linear-gradient(180deg,#d9dbd6,#c6c9c3)]",
};

/**
 * A framed stage for one component state. `children(take)` re-renders with a
 * new `take` on Replay (use it as a React key to remount and replay).
 */
export function Stage({
  label,
  note,
  bg = "counter",
  width = "phone",
  minH = 260,
  className,
  actions,
  children,
}: {
  label: string;
  note?: string;
  bg?: StageBg;
  width?: "phone" | "wide" | "fit";
  minH?: number;
  className?: string;
  actions?: ReactNode;
  children: (take: number) => ReactNode;
}) {
  const [take, setTake] = useState(1);
  return (
    <figure
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[4px] bg-paper shadow-slip",
        width === "phone" && "w-full max-w-[390px]",
        width === "wide" && "w-full",
        width === "fit" && "w-auto",
        className,
      )}
    >
      <figcaption className="flex min-h-12 flex-wrap items-center gap-2 border-b border-ink/10 px-3 py-2">
        <span className="label-print mr-auto text-ink-muted">{label}</span>
        {actions}
        <button
          type="button"
          onClick={() => setTake((t) => t + 1)}
          className="inline-flex h-11 items-center gap-1.5 rounded-[3px] px-3 text-[14px] font-bold uppercase tracking-[0.06em] text-ink transition hover:bg-ink/[0.06] active:scale-95"
        >
          <RotateCcw aria-hidden className="size-4" /> Replay
        </button>
      </figcaption>
      <div className={cn("relative flex flex-1 items-center justify-center overflow-hidden p-6", BG[bg])} style={{ minHeight: minH }}>
        {children(take)}
      </div>
      {note ? <p className="border-t border-ink/10 px-3 py-2 text-[14px] leading-snug text-ink-muted">{note}</p> : null}
    </figure>
  );
}

/** Small key for stage actions. */
export function Pill({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  /** Kept for older demos; every pill is ink now. */
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-11 items-center rounded-[3px] border-2 border-ink px-3.5 text-[14px] font-bold uppercase tracking-[0.05em] transition active:scale-95",
        active ? "bg-ink text-paper" : "bg-transparent text-ink hover:bg-ink/[0.06]",
      )}
    >
      {children}
    </button>
  );
}

export function Section({ id, title, children, intro }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 py-12">
      <h2 className="font-display text-[36px] font-extrabold uppercase leading-none">{title}</h2>
      {intro ? <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink-muted">{intro}</p> : null}
      <div className="mt-6 flex flex-wrap items-start gap-6">{children}</div>
    </section>
  );
}
