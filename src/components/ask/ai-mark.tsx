import { cn } from "@/lib/utils";

/** The AI's mark: a little 3×3 dot-matrix print head. One dot breathes while listening; it prints while thinking. */
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
      className={cn("ask-mark", state === "listening" && "ask-mark-listening", state === "thinking" && "ask-mark-thinking", className)}
      style={{ width: size, height: size, padding: Math.round(size * 0.17), gap: Math.max(1, Math.round(size * 0.09)) }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} />
      ))}
    </span>
  );
}
