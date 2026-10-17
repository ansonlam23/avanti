// Minimal Server-Sent Events parser for the chat stream. Pure.
import type { ChatEvent } from "@/lib/ai/shopper-types";

/**
 * Split buffered stream text into complete events. Each event is a block of
 * `data:` lines ended by a blank line; anything after the last blank line is
 * returned as `rest` to prepend to the next chunk.
 */
export function parseSse(buffer: string): { events: ChatEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const block of blocks) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) continue;
    try {
      const event = JSON.parse(data) as ChatEvent;
      if (event && typeof event === "object" && typeof event.type === "string") events.push(event);
    } catch {
      // a malformed event never breaks the stream
    }
  }
  return { events, rest };
}
