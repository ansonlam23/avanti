import { cn } from "@/lib/utils";

/** The name, set like the sign: OPEN reverse-printed in a black block, SIGN in ink. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.24em] font-display text-[26px] font-black uppercase leading-none tracking-[0.02em]",
        className,
      )}
    >
      <span className="-rotate-2 bg-ink px-[0.2em] pb-[0.05em] pt-[0.11em] text-paper shadow-[0_1px_1px_rgb(40_30_10/0.25)]">Open</span>
      <span>Sign</span>
    </span>
  );
}
