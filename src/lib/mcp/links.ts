// Links the MCP server hands to other AIs (CONTRACTS §15). Pure.
// An order started from Claude/ChatGPT/Cursor is finished inside avanti:
// the link opens /ask with the order spelled out in the composer, and the
// person sends it and taps "Confirm & hold" there (signed order, Visa hold).
import type { OrderProposal } from "@/lib/ai/shopper-types";

/** /ask keeps the first 300 characters of ?q= (src/app/ask/page.tsx). */
export const MAX_PROMPT_CHARS = 300;

const ASAP = new Set(["", "asap", "now", "soonest"]);

/** True when the caller asked for the earliest pickup (no time, or "asap"). */
export function isAsap(pickupTime: string | null | undefined): boolean {
  return ASAP.has((pickupTime ?? "").trim().toLowerCase());
}

/**
 * Origin for links: NEXT_PUBLIC_APP_URL when it's a valid http(s) URL,
 * otherwise the origin the request came in on.
 */
export function linkOrigin(configured: string | null | undefined, requestOrigin: string): string {
  const value = (configured ?? "").trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // not a URL: fall back to the request origin
    }
  }
  return new URL(requestOrigin).origin;
}

function clipName(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * "today at 5:30 PM", "tomorrow at 9 AM", "Sunday at 9 AM" from a proposal's
 * pickup_label ("5:30 PM" | "tomorrow 9 AM" | "Sunday 9 AM").
 */
export function pickupPhrase(label: string): string {
  const m = /^(.*?)\s*(\d{1,2}(?::\d{2})?\s*[AP]M)$/i.exec(label.trim());
  if (!m) return label.trim();
  return `${m[1] || "today"} at ${m[2]}`;
}

type PromptFields = Pick<OrderProposal, "qty" | "item_name" | "item_name_en" | "shop_name" | "pickup_label">;

/**
 * What the person sees in avanti's composer, e.g. "Order 1 × Chocolate cake
 * from Mai's Bakery, pickup today at 5:30 PM". No final period: chat apps
 * drop trailing punctuation when they auto-link a URL.
 */
export function orderPrompt(p: PromptFields, opts: { asap: boolean }): string {
  const item = clipName(p.item_name, 80) + (p.item_name_en ? ` (${clipName(p.item_name_en, 60)})` : "");
  const when = opts.asap ? "pickup as soon as possible" : `pickup ${pickupPhrase(p.pickup_label)}`;
  const text = `Order ${p.qty} × ${item} from ${clipName(p.shop_name, 80)}, ${when}`;
  return text.length > MAX_PROMPT_CHARS ? `${text.slice(0, MAX_PROMPT_CHARS - 1)}…` : text;
}

/** `<origin>/ask?q=<prompt>`. Form-encoded, so spaces, apostrophes and parentheses never break a Markdown link. */
export function orderLink(origin: string, prompt: string): string {
  const url = new URL("/ask", origin);
  url.searchParams.set("q", prompt);
  return url.toString();
}
