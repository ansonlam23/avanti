// What gets logged for one AI shop search, and how asks are counted. Pure.
import type { SearchShopsResult } from "@/lib/ai/shopper-types";
import { normalize } from "@/lib/ai/tools/match";
import type { AiQueryInsert, AiQuerySource } from "./types";

export const MAX_QUERY_CHARS = 200;
export const MAX_NEEDED_BY_CHARS = 40;
/** Longest ask shown to the owner; longer wording is cut with "…". */
export const MAX_ASK_CHARS = 80;

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const NUMBER_RUN = /\+?\(?\d[\d\s().-]*\d/g;
/** Words that don't change what was asked for ("some cookies" = "cookies"). */
const FILLER = new Set(["a", "an", "the", "some", "any", "please"]);

/** Cut to `max` characters (code points, as Postgres counts them; never half an emoji). */
function clipChars(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

/** Remove what could identify a person: email addresses and long numbers (phones, cards). */
export function scrubDetails(s: string): string {
  return s
    .replace(EMAIL, " ")
    .replace(NUMBER_RUN, (run) => (run.replace(/\D/g, "").length >= 7 ? " " : run));
}

/** Control characters (C0, DEL, C1) become spaces: Postgres text can't hold NUL, and none belong in a query. */
function noControls(s: string): string {
  return Array.from(s, (c) => {
    const n = c.codePointAt(0) ?? 0;
    return n < 0x20 || (n >= 0x7f && n < 0xa0) ? " " : c;
  }).join("");
}

/** Text as stored: one line, no control characters, trimmed, at most `max` characters. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return clipChars(noControls(raw).replace(/\s+/g, " ").trim(), max).trim();
}

/** A search query as stored: cleaned, with emails and long numbers removed. "" when nothing is left. */
export function cleanQuery(raw: unknown): string {
  return cleanText(typeof raw === "string" ? scrubDetails(raw) : raw, MAX_QUERY_CHARS);
}

/**
 * The ai_queries row for one search_shops call, or null when there's nothing
 * to log. Returned = every shop the result named (matches, or the open shops
 * nearby when nothing matched); matched = the shops listed with matching items.
 */
export function searchLogRow(
  source: AiQuerySource,
  args: { query?: unknown; needed_by?: unknown },
  result: Pick<SearchShopsResult, "shops" | "other_open_shops">,
): AiQueryInsert | null {
  const query = cleanQuery(args.query);
  if (!query) return null;
  const shops = result.shops ?? [];
  const others = result.other_open_shops ?? [];
  return {
    source,
    query,
    needed_by: cleanText(args.needed_by, MAX_NEEDED_BY_CHARS) || null,
    shop_slugs: [...new Set([...shops.map((s) => s.slug), ...others.map((s) => s.slug)])],
    matched_slugs: [...new Set(shops.filter((s) => s.matches.length > 0).map((s) => s.slug))],
  };
}

/**
 * Simple plural folding, so singular and plural count as one ask: cookies and
 * cookie → "cooki", berries and berry → "berri", boxes → "box", cakes → "cake".
 * It only has to be consistent, not good English.
 */
export function foldWord(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  let w = word;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}i`;
  else if (/(ss|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (/[^su]s$/.test(w)) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("ie")) w = `${w.slice(0, -2)}i`;
  else if (w.length > 3 && /[^aeiou]y$/.test(w)) w = `${w.slice(0, -1)}i`;
  return w;
}

/** The key asks are counted by: lowercase, no accents or punctuation, no filler words, plurals folded. */
export function askKey(query: string): string {
  return normalize(query)
    .split(" ")
    .filter((w) => w && !FILLER.has(w))
    .map(foldWord)
    .join(" ");
}

const EDGE_PUNCTUATION = /^[\s"'“”‘’.,;:!?¿¡-]+|[\s"'“”‘’.,;:!?¿¡-]+$/g;

/**
 * How an ask is shown to the owner: the wording, lowercased, one line, without
 * leading filler ("a sourdough loaf" → "sourdough loaf") or stray punctuation.
 */
export function askLabel(query: string): string {
  let words = query.toLowerCase().replace(EDGE_PUNCTUATION, "").split(/\s+/).filter(Boolean);
  while (words.length > 1 && FILLER.has(words[0].replace(/[^\p{L}]/gu, ""))) words = words.slice(1);
  const s = words.join(" ").replace(EDGE_PUNCTUATION, "");
  const cut = clipChars(s, MAX_ASK_CHARS);
  return cut === s ? s : `${cut.trimEnd()}…`;
}
