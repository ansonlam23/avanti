import { cn } from "@/lib/utils";

/**
 * The name, set like the landing page: "avanti" in Marcellus, lowercase,
 * brand teal. Size it with a text-[…] class (default 26px). Always lowercase:
 * never "Avanti" or "AVANTI".
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block font-display text-[26px] font-normal normal-case leading-none tracking-[0.01em] text-carbon",
        className,
      )}
    >
      avanti
    </span>
  );
}
