"use client";

import { RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StageBg = "counter" | "paper" | "dim" | "steel";

const BG: Record<StageBg, string> = {
  counter: "bg-counter",
  paper: "bg-paper",
  dim: "bg-counter-deep", // kept for callers: ink stays bright, so "dim" is paper in shadow
  steel: "bg-pad", // kept for callers: the teal wash
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
        "paper flex min-w-0 flex-col overflow-hidden shadow-slip",
        width === "phone" && "w-full max-w-[390px]",
        width === "wide" && "w-full",
        width === "fit" && "w-auto",
        className,
      )}
    >
      <figcaption className="flex min-h-12 flex-wrap items-center gap-2 border-b border-ink/16 px-4 py-2">
        <span className="label-print mr-auto text-[13px] text-ink-muted">{label}</span>
        {actions}
        <button
          type="button"
          onClick={() => setTake((t) => t + 1)}
          className="inline-flex h-11 items-center gap-1.5 px-3 text-[15px] font-medium text-ink transition-colors hover:bg-ink/[0.05]"
        >
          <RotateCcw aria-hidden className="size-4" /> Replay
        </button>
      </figcaption>
      <div className={cn("relative flex flex-1 items-center justify-center overflow-hidden p-6", BG[bg])} style={{ minHeight: minH }}>
        {children(take)}
      </div>
      {note ? <p className="border-t border-ink/16 px-4 py-2.5 text-[15px] leading-snug text-ink-muted">{note}</p> : null}
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
  /** Kept for older demos; every key is ink now. */
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-11 items-center border px-4 text-[15px] font-medium transition-colors duration-200 active:translate-y-px",
        active ? "border-carbon bg-carbon text-paper" : "border-ink bg-transparent text-ink hover:bg-ink/[0.05]",
      )}
    >
      {children}
    </button>
  );
}

export function Section({ id, title, children, intro }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 py-12">
      <h2 className="font-display text-[36px] leading-none">{title}</h2>
      {intro ? <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-muted">{intro}</p> : null}
      <div className="mt-6 flex flex-wrap items-start gap-6">{children}</div>
    </section>
  );
}
