import { cn } from "@/lib/utils";

/** The landing's quiet arrow ("get started →"): a fine stroke, it nudges on hover (ask.css). */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-[18px] shrink-0", className)}
    >
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}
