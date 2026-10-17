import { cn } from "@/lib/utils";

// "AI-ready ✓": this shop publishes a machine-readable menu (agent.json)
// that AI shoppers read. A small printed label that links to it.

export function AiReadyBadge({
  href,
  className,
}: {
  href: string;
  /** Kept for callers; it's printed the same on paper and on the counter. */
  surface?: "dusk" | "paper";
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="AI-ready: open this shop's machine-readable menu (agent.json)"
      className={cn(
        "inline-flex h-12 items-center gap-2.5 whitespace-nowrap rounded-[3px] border-2 border-ink px-4 font-display text-[20px] font-extrabold uppercase leading-none tracking-[0.03em] text-ink transition hover:bg-ink hover:text-paper",
        className,
      )}
    >
      AI-ready ✓<span className="font-sans text-[15px] font-normal normal-case tracking-normal opacity-75">agent.json</span>
    </a>
  );
}
