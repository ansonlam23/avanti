import { cn } from "@/lib/utils";

/**
 * The AI's mark: avanti's lowercase "a" in a hairline square, like a small
 * seal of the wordmark. It breathes while the AI is thinking.
 */
export function AiMark({
  size = 28,
  state = "idle",
  className,
}: {
  size?: number;
  state?: "idle" | "listening" | "thinking";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("ask-mark", state === "thinking" && "ask-mark-thinking", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.8) }}
    >
      a
    </span>
  );
}
