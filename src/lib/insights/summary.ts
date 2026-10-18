// One shop's day of AI searches → the owner's insights (CONTRACTS §16). Pure.
// "Today" is the calendar day in America/Los_Angeles, where the shops are.
import { fromWallClock, SHOP_TZ, wallClock } from "@/lib/ai/tools/time";
import { askKey, askLabel } from "./queries";
import type { AiQueryRow, ShopInsights, UnmetAsk } from "./types";

/** How many unmet asks the owner sees. */
export const TOP_ASKS = 5;

/** 00:00 of `now`'s day in Los Angeles (DST-safe): where "today" starts. */
export function laDayStart(now: Date): Date {
  const w = wallClock(now);
  return fromWallClock(w.year, w.month, w.day, 0, 0);
}

/** `now`'s calendar day in Los Angeles: "2026-10-17". */
export function laDay(now: Date): string {
  const w = wallClock(now);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

interface AskGroup {
  count: number;
  nobody: boolean;
  latest: number;
  /** wording → how often, and when last */
  wordings: Map<string, { n: number; latest: number }>;
}

/** The wording people used most (ties: the shorter, usually the singular; then the most recent). */
function mostUsed(wordings: AskGroup["wordings"]): string {
  let best = "";
  let top = { n: 0, latest: -Infinity };
  for (const [label, w] of wordings) {
    const better =
      w.n > top.n ||
      (w.n === top.n && (label.length < best.length || (label.length === best.length && w.latest > top.latest)));
    if (better) {
      best = label;
      top = w;
    }
  }
  return best;
}

/**
 * Count one shop's AI searches for `now`'s Los Angeles day:
 * - shown: searches that returned the shop
 * - matched: of those, searches where the shop had a matching item
 * - unmet: searches that returned the shop without a match, grouped by what was
 *   asked (normalized, plurals folded), most asked first, top `TOP_ASKS`; each
 *   says whether no shop in those searches had it.
 * Rows from other days or for other shops are ignored. `ordered` (today's
 * orders) is counted by the caller and passed through.
 */
export function summarizeInsights(
  rows: readonly AiQueryRow[],
  slug: string,
  opts: { now: Date; ordered: number; top?: number },
): ShopInsights {
  const since = laDayStart(opts.now);
  const from = since.getTime();
  let shown = 0;
  let matched = 0;
  const groups = new Map<string, AskGroup>();

  for (const row of rows) {
    const at = Date.parse(row.created_at);
    if (!(at >= from) || !row.shop_slugs.includes(slug)) continue;
    shown++;
    if (row.matched_slugs.includes(slug)) {
      matched++;
      continue;
    }
    const key = askKey(row.query);
    const label = askLabel(row.query);
    if (!key || !label) continue;
    const group = groups.get(key) ?? { count: 0, nobody: true, latest: at, wordings: new Map() };
    group.count++;
    group.nobody &&= row.matched_slugs.length === 0;
    group.latest = Math.max(group.latest, at);
    const wording = group.wordings.get(label) ?? { n: 0, latest: at };
    group.wordings.set(label, { n: wording.n + 1, latest: Math.max(wording.latest, at) });
    groups.set(key, group);
  }

  const unmet: UnmetAsk[] = [...groups.values()]
    .map((g) => ({ ask: mostUsed(g.wordings), count: g.count, nobody_nearby: g.nobody, latest: g.latest }))
    .sort((a, b) => b.count - a.count || b.latest - a.latest || a.ask.localeCompare(b.ask))
    .slice(0, opts.top ?? TOP_ASKS)
    .map(({ ask, count, nobody_nearby }) => ({ ask, count, nobody_nearby }));

  return {
    day: laDay(opts.now),
    timezone: SHOP_TZ,
    since: since.toISOString(),
    shown,
    matched,
    ordered: Math.max(0, opts.ordered),
    unmet,
  };
}
