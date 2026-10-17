import { cn } from "@/lib/utils";

// "AI-ready ✓": this shop publishes a machine-readable menu (agent.json)
// that AI shoppers read. A square hairline label that links to it.

export function AiReadyBadge({
  href,
  className,
}: {
  href: string;
  /** Kept for callers; it's set the same on paper and on the page. */
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
        "inline-flex h-11 items-center gap-3 whitespace-nowrap border border-carbon/45 px-4 text-[16px] font-semibold leading-none text-carbon transition-colors hover:border-carbon hover:bg-carbon/[0.06]",
        className,
      )}
    >
      AI-ready ✓<span className="font-mono text-[15px] font-normal text-ink-muted">agent.json</span>
    </a>
  );
}
