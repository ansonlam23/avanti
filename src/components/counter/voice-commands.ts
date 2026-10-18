// The counter's voice commands. The owner says (or types) one short thing and
// it becomes one change on their own shop:
//   "we're out of croissants"          → that item sold out
//   "croissants are back"              → back in stock
//   "AI orders up to forty dollars"    → the AI spending cap ("no cap on AI orders" removes it)
//   "AI can't order the birthday cake" → that item in person only ("let AI order the cake again")
//   "pause AI orders"                  → stop taking AI orders ("start taking AI orders")
// Pure (no DOM, no network, no AI calls): what was heard is matched against the
// shop's live menu here, and the counter calls the owner endpoints with the result.

import { formatPriceShort } from "@/lib/format";
import { AI_LIMIT_MAX_CENTS, AI_LIMIT_MIN_CENTS, aiOrderLimitCents, isAiOrderable } from "@/lib/orders/ai-rules";
import type { ShopRules } from "@/lib/types";

export interface VoiceItem {
  id: string;
  name: string;
  name_en?: string | null;
  price_cents?: number | null;
  sold_out?: boolean;
  stock?: number;
}

/** What to do to an item, once we know which one. */
export type ItemIntent = { kind: "sold_out"; sold_out: boolean } | { kind: "ai_orderable"; ai_orderable: boolean };

export type VoiceCommand =
  | { kind: "sold_out"; item: VoiceItem; sold_out: boolean }
  | { kind: "ai_orderable"; item: VoiceItem; ai_orderable: boolean }
  | { kind: "ai_limit"; cents: number | null }
  | { kind: "accept_ai"; accept: boolean };

export type ParseResult =
  | { ok: true; command: VoiceCommand; heard: string }
  | { ok: false; reason: "empty" | "unknown" | "cancel"; heard: string }
  | { ok: false; reason: "no_item"; intent: ItemIntent; heard: string }
  | { ok: false; reason: "ambiguous"; intent: ItemIntent; candidates: VoiceItem[]; heard: string }
  | { ok: false; reason: "bad_amount"; cents: number; heard: string };

/** The question we asked last ("Which one: …?"), so "the almond one" can answer it. */
export interface Pending {
  intent: ItemIntent;
  candidates: string[]; // item ids
}

// ── Words ────────────────────────────────────────────────────

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan'?t\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/\bwon'?t\b/g, "will not"],
  [/\b(do|does|did|is|are|was|were|has|have|had|should|could|would|must|need)n'?t\b/g, "$1 not"],
  [/\b(we|they|you)'re\b/g, "$1 are"],
  [/\b(it|that|there|here|what|who|everything|nothing)'s\b/g, "$1 is"],
  [/\b(we|i|they|you)'ve\b/g, "$1 have"],
  [/\b(we|i|they|you|it|that)'ll\b/g, "$1 will"],
  [/\bi'm\b/g, "i am"],
  [/\blet's\b/g, "let us"],
];

/**
 * Lowercase words, ready to match: accents dropped, contractions opened
 * ("can't" → "can not"), "$40" → "40 dollars", "A.I." → "ai", punctuation gone.
 */
export function words(text: string): string[] {
  let s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'");
  s = s.replace(/\ba\s*\.\s*i\b\.?/g, " ai ");
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  s = s.replace(/\$\s*(\d+(?:\.\d+)?)/g, " $1 dollars ");
  s = s.replace(/(\d+(?:\.\d+)?)\s*\$/g, " $1 dollars ");
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  s = s.replace(/'/g, "").replace(/[^a-z0-9.\s]/g, " ");
  const out: string[] = [];
  for (const raw of s.split(/\s+/)) {
    const w = /^\d+\.\d+$/.test(raw) ? raw : raw.replace(/\./g, "");
    if (!w) continue;
    if (w === "i" && out[out.length - 1] === "a") {
      out[out.length - 1] = "ai"; // "a i orders"
      continue;
    }
    out.push(w);
  }
  return out;
}

/** Index of a phrase ("out of") inside the words, or -1. */
function find(tokens: readonly string[], phrase: readonly string[], from = 0): number {
  outer: for (let i = from; i <= tokens.length - phrase.length; i++) {
    for (let k = 0; k < phrase.length; k++) if (tokens[i + k] !== phrase[k]) continue outer;
    return i;
  }
  return -1;
}
const has = (tokens: readonly string[], phrase: string) => find(tokens, phrase.split(" ")) >= 0;

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Grammar and filler: never part of an item's name. */
const FUNCTION = set(`
  a an the of our my your their his her its this that these those some any all every each
  we i you they them it he she us me who what which there here
  is are was were be been being am will would should could can may might must shall do does did done
  have has had having got get gets getting just right anymore again too also very really totally
  completely actually basically literally please thanks thank okay ok alright so um uh uhh umm hmm er erm
  ah oh hey hi hello like well yeah yes yep and or but then for to from in on at by with as up down over
  into onto about more less much many lot lots no not never mark marked set make put turn turned switch
  toggle go going gonna want wanna need let lets theres thats whats were youre theyre weve ive im
  still yet already longer
`);

/** Words that can be part of a name ("Everything bagel", "Soup of the day") but never name one alone. */
const SOFT = set(`
  everything nothing anything something one ones thing things stuff item items menu counter shop store
  today tonight now day days morning afternoon evening night week weekend hour hours minute minutes
  while bit rest lunch dinner breakfast brunch rush moment time kitchen oven batch
`);

/** Item-name words that carry no meaning ("Box of 6" → box, 6). */
const ITEM_STOP = set("a an the of and with w n");

// Maps, not objects: a heard word like "constructor" must never find Object.prototype.
const NUMBER_WORD = new Map<string, number>(
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"
    .split(" ")
    .map((w, i) => [w, i]),
);
const TENS = new Map<string, number>([
  ["twenty", 20], ["thirty", 30], ["forty", 40], ["fourty", 40], ["fifty", 50],
  ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
]);

/** Spellings people (and speech engines) use for the same thing. */
const ALIAS = new Map<string, string>([
  ["doughnut", "donut"], ["expresso", "espresso"], ["bagle", "bagel"], ["omelette", "omelet"],
  ["yoghurt", "yogurt"], ["kabob", "kebab"], ["kebob", "kebab"],
]);

// ── Matching items ───────────────────────────────────────────

/** A word and its likely singulars: "loaves" → loaf, "brownies" → brownie, "six" → 6. */
function forms(w: string): string[] {
  const out = [w];
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) out.push(w.slice(0, -1));
  if (w.length > 4 && w.endsWith("es")) out.push(w.slice(0, -2));
  if (w.length > 4 && w.endsWith("ies")) out.push(`${w.slice(0, -3)}y`);
  if (w.length > 4 && w.endsWith("ves")) out.push(`${w.slice(0, -3)}f`, `${w.slice(0, -3)}fe`);
  const n = NUMBER_WORD.get(w);
  if (n !== undefined) out.push(String(n));
  for (const f of [...out]) {
    const alias = ALIAS.get(f);
    if (alias) out.push(alias);
  }
  return out;
}

/** Edit distance with swaps ("croissnat"), capped: anything past 2 counts as 3. */
function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return Math.min(d[a.length][b.length], 3);
}

/** How alike a heard word and a menu word are: 1 same (plurals too), 0.8 one typo, 0.6 two typos (long words), 0.7 a typed prefix. */
function sim(heard: string, menu: string): number {
  if (heard === menu) return 1;
  const A = forms(heard);
  const B = forms(menu);
  if (A.some((x) => B.includes(x))) return 1;
  if (heard.length >= 4 && menu.startsWith(heard) && heard.length * 2 >= menu.length) return 0.7;
  const short = Math.min(heard.length, menu.length);
  if (short < 5) return 0;
  let best = 3;
  for (const x of A) for (const y of B) best = Math.min(best, distance(x, y));
  if (best <= 1) return 0.8;
  if (best === 2 && short >= 8) return 0.6;
  return 0;
}

/** Each way to say an item: its name, its English name, and each run together ("Cheese cake" → cheesecake). */
function itemForms(item: VoiceItem): string[][] {
  const out: string[][] = [];
  for (const name of [item.name, item.name_en]) {
    if (!name) continue;
    const t = words(name).filter((w) => !ITEM_STOP.has(w));
    if (!t.length) continue;
    out.push(t);
    if (t.length > 1) out.push([t.join("")]);
  }
  return out;
}

interface Scored {
  item: VoiceItem;
  /** How many heard words this item explains. */
  score: number;
  /** The same, without soft words ("day", "one"): an item named by those alone doesn't count. */
  hard: number;
  /** How much of the item's own name was said (1 = all of it). */
  coverage: number;
}

function scoreItem(content: readonly string[], item: VoiceItem): Scored {
  let best = { score: 0, hard: 0, coverage: 0 };
  for (const form of itemForms(item)) {
    let score = 0;
    let hard = 0;
    for (const c of content) {
      let m = 0;
      for (const t of form) m = Math.max(m, sim(c, t));
      score += m;
      if (!SOFT.has(c)) hard += m;
    }
    let covered = 0;
    for (const t of form) {
      let m = 0;
      for (const c of content) m = Math.max(m, sim(c, t));
      covered += m;
    }
    const coverage = covered / form.length;
    if (score > best.score || (score === best.score && coverage > best.coverage)) best = { score, hard, coverage };
  }
  return { item, ...best };
}

type Pick = { kind: "one"; item: VoiceItem } | { kind: "tie"; items: VoiceItem[] } | { kind: "none" };

/**
 * The item the owner named. A clear winner explains at least half a word more
 * than the next; otherwise the one whose whole name was said wins
 * ("croissants" → Croissant over Almond croissant); otherwise it's a tie.
 */
function pickItem(heardWords: readonly string[], items: readonly VoiceItem[]): Pick {
  if (!heardWords.length || !items.length) return { kind: "none" };
  // Words said apart that the menu runs together: "cheese cake" → cheesecake.
  const vocab = items.flatMap((i) => itemForms(i).flat());
  const content = [...heardWords];
  for (let i = 0; i < heardWords.length - 1; i++) {
    const joined = heardWords[i] + heardWords[i + 1];
    if (vocab.some((v) => sim(joined, v) === 1)) content.push(joined);
  }
  const scored = items
    .map((i) => scoreItem(content, i))
    .filter((s) => s.hard >= 0.6)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage);
  if (!scored.length) return { kind: "none" };
  const near = scored.filter((s) => scored[0].score - s.score < 0.5);
  if (near.length === 1) return { kind: "one", item: near[0].item };
  const whole = near.filter((s) => s.coverage >= 0.999);
  if (whole.length === 1) return { kind: "one", item: whole[0].item };
  return { kind: "tie", items: (whole.length > 1 ? whole : near).map((s) => s.item) };
}

// ── Amounts ──────────────────────────────────────────────────

/** A number at tokens[i] ("40", "12.50", "forty five", "a hundred and twenty"), or null. */
function readNumber(tokens: readonly string[], i: number): { value: number; next: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return { value: Number(t), next: i + 1 };
  let total = 0;
  let group = 0;
  let last: "unit" | "teen" | "tens" | "hundred" | "thousand" | null = null;
  let j = i;
  const isNum = (w: string | undefined) => w !== undefined && (NUMBER_WORD.has(w) || TENS.has(w) || w === "hundred" || w === "thousand");
  while (j < tokens.length) {
    const w = tokens[j];
    if (w === "a" && last === null && (tokens[j + 1] === "hundred" || tokens[j + 1] === "thousand")) {
      group = 1;
      last = "unit";
    } else if (w === "and" && last !== null && isNum(tokens[j + 1])) {
      // "one hundred and five"
    } else if (NUMBER_WORD.has(w)) {
      const v = NUMBER_WORD.get(w) ?? 0;
      if (last === "unit" || last === "teen" || (last === "tens" && (v >= 10 || v === 0))) break;
      group += v;
      last = v >= 10 ? "teen" : "unit";
    } else if (TENS.has(w)) {
      if (last === "unit" || last === "teen" || last === "tens") break;
      group += TENS.get(w) ?? 0;
      last = "tens";
    } else if (w === "hundred") {
      if (last === null || last === "hundred") break;
      group = (group || 1) * 100;
      last = "hundred";
    } else if (w === "thousand" || w === "grand") {
      if (last === null) break;
      total += (group || 1) * 1000;
      group = 0;
      last = "thousand";
    } else break;
    j++;
  }
  if (last === null) return null;
  return { value: total + group, next: j };
}

const DOLLAR = set("dollar dollars buck bucks usd");
const CENT = set("cent cents");
const COUNTED = set("item items piece pieces thing things each");
const CAP_CONTEXT = set("to at cap caps capped limit limited max maximum most under below than over above ceiling budget upto is");

export interface Amount {
  cents: number;
  /** Said with a money word ("dollars", "$", "cents"). */
  money: boolean;
  /** A cap word sits just before it ("up to forty", "limit 25"). */
  capContext: boolean;
  /** A count of things, not money ("up to 2 items", "3 croissants"). */
  counted: boolean;
}

/** The first amount of money in the words: "$40", "forty dollars", "twelve fifty", "25 bucks", "fifty cents". */
export function findAmount(tokens: readonly string[]): Amount | null {
  for (let i = 0; i < tokens.length; i++) {
    const n = readNumber(tokens, i);
    if (!n) continue;
    let cents = Math.round(n.value * 100);
    let j = n.next;
    let money = false;
    if (DOLLAR.has(tokens[j] ?? "")) {
      money = true;
      j++;
      // "twelve dollars (and) fifty (cents)"
      const k = tokens[j] === "and" ? j + 1 : j;
      const c = readNumber(tokens, k);
      if (c && Number.isInteger(c.value) && c.value < 100 && (CENT.has(tokens[c.next] ?? "") || tokens[c.next] === undefined)) {
        cents += c.value;
        j = CENT.has(tokens[c.next] ?? "") ? c.next + 1 : c.next;
      }
    } else if (CENT.has(tokens[j] ?? "")) {
      money = true;
      cents = Math.round(n.value);
      j++;
    } else {
      // "twelve fifty" = $12.50
      const c = readNumber(tokens, j);
      if (c && Number.isInteger(n.value) && n.value < 100 && Number.isInteger(c.value) && c.value >= 10 && c.value < 100) {
        cents = n.value * 100 + c.value;
        j = c.next;
        if (DOLLAR.has(tokens[j] ?? "")) {
          money = true;
          j++;
        }
      }
    }
    const before = tokens.slice(Math.max(0, i - 3), i);
    const after = tokens[j];
    const counted = !money && after !== undefined && (COUNTED.has(after) || (!FUNCTION.has(after) && !SOFT.has(after) && after !== "per"));
    return { cents, money, capContext: before.some((w) => CAP_CONTEXT.has(w)), counted };
  }
  return null;
}

// ── Stock: sold out / back in stock ──────────────────────────

type Signal = { phrase: string[]; dir: "out" | "back"; weight: number; unless?: (tokens: readonly string[], at: number) => boolean };

const FUTURE = set("tomorrow later soon next monday tuesday wednesday thursday friday saturday sunday");
const precededBy = (...ws: string[]) => (tokens: readonly string[], at: number) => ws.includes(tokens[at - 1] ?? "");

const STOCK_SIGNALS: Signal[] = (
  [
    // back in stock, said through a negative ("not sold out")
    ["no longer sold out", "back", 6],
    ["not sold out", "back", 6],
    ["not out", "back", 6],
    ["unsold", "back", 6],
    ["out of the oven", "back", 5],
    ["came out", "back", 5],
    ["back in stock", "back", 5],
    ["in stock again", "back", 5],
    ["restock", "back", 5],
    ["restocked", "back", 5],
    ["restocking", "back", 5],
    ["replenish", "back", 5],
    ["replenished", "back", 5],
    ["refill", "back", 5],
    ["refilled", "back", 5],
    // out
    ["not available", "out", 4],
    ["not in stock", "out", 4],
    ["out of stock", "out", 4],
    ["not back", "out", 4],
    ["off the menu", "out", 4],
    ["sold out", "out", 4],
    ["soldout", "out", 4],
    ["sell out", "out", 4],
    ["sold all", "out", 4],
    ["out of", "out", 4],
    ["ran out", "out", 4],
    ["run out", "out", 4],
    ["all out", "out", 4],
    ["fresh out", "out", 4],
    ["no more", "out", 4],
    ["none left", "out", 4],
    ["nothing left", "out", 4],
    ["all gone", "out", 4],
    ["eighty six", "out", 4],
    ["86", "out", 4],
    ["86d", "out", 4],
    ["unavailable", "out", 4],
    ["do not have", "out", 3],
    ["does not have", "out", 3],
    ["have no", "out", 3],
    ["got no", "out", 3],
    ["gone", "out", 2],
    ["finished", "out", 2],
    ["empty", "out", 2],
    ["out", "out", 2],
    ["no", "out", 1],
    ["none", "out", 1],
    // back
    ["have more", "back", 3],
    ["got more", "back", 3],
    ["made more", "back", 3],
    ["baked more", "back", 3],
    ["in stock", "back", 3],
    ["available", "back", 2],
    ["again", "back", 2],
    ["fresh", "back", 2],
  ] as const
)
  .map(([phrase, dir, weight]): Signal => ({ phrase: phrase.split(" "), dir, weight }))
  .concat([
    // "back", unless it's later ("back tomorrow")
    { phrase: ["back"], dir: "back", weight: 4, unless: (t, at) => FUTURE.has(t[at + 1] ?? "") },
    // "more", unless "any more" ("we don't have any more")
    { phrase: ["more"], dir: "back", weight: 3, unless: precededBy("any", "no") },
  ])
  // longer phrases claim their words first, so "not sold out" never also counts as "sold out"
  .sort((a, b) => b.phrase.length - a.phrase.length || b.weight - a.weight);

const LOW = ["running low", "running out", "almost out", "nearly out", "low on", "getting low", "almost gone", "nearly gone"].map((p) => p.split(" "));

/** Weigh what was said toward "sold out" or "back in stock". The words that carried it are `used`. */
function stockSignals(tokens: readonly string[]): { out: number; back: number; used: Set<number> } {
  const used = new Set<number>();
  let out = 0;
  let back = 0;
  for (const s of STOCK_SIGNALS) {
    for (let at = find(tokens, s.phrase); at >= 0; at = find(tokens, s.phrase, at + 1)) {
      const span = s.phrase.map((_, k) => at + k);
      if (span.some((i) => used.has(i)) || s.unless?.(tokens, at)) continue;
      span.forEach((i) => used.add(i));
      if (s.dir === "out") out += s.weight;
      else back += s.weight;
    }
  }
  return { out, back, used };
}

// ── AI rules ─────────────────────────────────────────────────

const AI_WORDS = set("ai ais bot bots robot robots agent agents online");
const AI_NEG = set(`
  no not never stop stopped stopping pause paused pausing block blocked blocking ban banned off disable
  disabled halt hold freeze frozen refuse reject decline without except exclude excluded forbid disallow
  nobody suspend suspended cut end quit kill shut close closed
`);
const AI_POS = set("can let allow allowed start started starting again back on enable enabled accept accepting take taking open ok okay fine yes continue keep");
const AI_POS_STRONG = set("resume resumed resuming unpause unpaused unblock unblocked reenable reenabled restart reopen reopened");
/** Stops that can be negated: "not paused", "don't stop AI orders". */
const AI_STOPS = set("pause paused stop stopped block blocked ban banned disable disabled off");
const AI_FILLER = set(`
  order orders ordering ordered buy buys buying bought purchase purchases purchasing sell selling sale sales
  person only shopper shoppers customer customers
`);
const CAP_WORDS = set("cap caps capped limit limits limited max maximum ceiling budget spending spend");
const UNCAP = set("no remove removed lift lifted drop dropped clear cleared delete cancel without unlimited off rid kill scrap none");

function aiPolarity(tokens: readonly string[]): boolean | null {
  if (tokens.some((t) => AI_POS_STRONG.has(t))) return true;
  for (let i = 0; i < tokens.length - 1; i++) {
    const negated = tokens[i] === "not" || (tokens[i] === "longer" && tokens[i - 1] === "no");
    if (negated && AI_STOPS.has(tokens[i + 1])) return true; // "AI orders are no longer paused"
  }
  if (has(tokens, "in person") || tokens.some((t) => AI_NEG.has(t))) return false;
  if (tokens.some((t) => AI_POS.has(t))) return true;
  return null;
}

// ── Parsing ──────────────────────────────────────────────────

const ok = (command: VoiceCommand, heard: string): ParseResult => ({ ok: true, command, heard });
const fail = (reason: "empty" | "unknown" | "cancel", heard: string): ParseResult => ({ ok: false, reason, heard });

export function commandFor(intent: ItemIntent, item: VoiceItem): VoiceCommand {
  return intent.kind === "sold_out"
    ? { kind: "sold_out", item, sold_out: intent.sold_out }
    : { kind: "ai_orderable", item, ai_orderable: intent.ai_orderable };
}

function byItem(intent: ItemIntent, pick: Pick, heard: string): ParseResult {
  if (pick.kind === "one") return ok(commandFor(intent, pick.item), heard);
  if (pick.kind === "tie") return { ok: false, reason: "ambiguous", intent, candidates: pick.items, heard };
  return { ok: false, reason: "no_item", intent, heard };
}

function parseAi(tokens: readonly string[], items: readonly VoiceItem[], heard: string): ParseResult {
  // The spending cap: "AI orders up to forty dollars" · "no cap on AI orders"
  const amount = findAmount(tokens);
  const capWord = tokens.some((t) => CAP_WORDS.has(t)) || has(tokens, "up to") || has(tokens, "at most");
  if (amount && !amount.counted && (amount.money || amount.capContext)) {
    if (amount.cents < AI_LIMIT_MIN_CENTS || amount.cents > AI_LIMIT_MAX_CENTS) {
      return { ok: false, reason: "bad_amount", cents: amount.cents, heard };
    }
    return ok({ kind: "ai_limit", cents: amount.cents }, heard);
  }
  if (has(tokens, "any amount") || tokens.includes("unlimited") || (capWord && tokens.some((t) => UNCAP.has(t)))) {
    return ok({ kind: "ai_limit", cents: null }, heard);
  }
  if (capWord || amount?.capContext) return fail("unknown", heard); // "what's the AI limit?" · "up to 2 items"

  // One item ("AI can't order the birthday cake"), or all AI orders ("pause AI orders").
  const on = aiPolarity(tokens);
  if (on === null) return fail("unknown", heard);
  const content = tokens.filter(
    (t) => !AI_WORDS.has(t) && !AI_NEG.has(t) && !AI_POS.has(t) && !AI_POS_STRONG.has(t) && !AI_FILLER.has(t) && !FUNCTION.has(t),
  );
  const pick = pickItem(content, items);
  // Nothing named but time words ("pause AI orders for now"): the whole shop.
  if (pick.kind === "none" && content.every((t) => SOFT.has(t))) return ok({ kind: "accept_ai", accept: on }, heard);
  return byItem({ kind: "ai_orderable", ai_orderable: on }, pick, heard);
}

function parseStock(tokens: readonly string[], items: readonly VoiceItem[], heard: string): ParseResult {
  if (LOW.some((p) => find(tokens, p) >= 0)) return fail("unknown", heard); // running low isn't sold out yet
  const { out, back, used } = stockSignals(tokens);
  if (out === back) return fail("unknown", heard);
  const content = tokens.filter((t, i) => !used.has(i) && !FUNCTION.has(t));
  return byItem({ kind: "sold_out", sold_out: out > back }, pickItem(content, items), heard);
}

const ORDINAL = new Map<string, number>([["first", 0], ["1st", 0], ["former", 0], ["second", 1], ["2nd", 1], ["third", 2], ["3rd", 2]]);

/** An answer to "Which one: A or B?": "the almond one", "almond croissant", "the second one". */
function answerPending(tokens: readonly string[], pending: Pending, items: readonly VoiceItem[], heard: string): ParseResult | null {
  const candidates = pending.candidates.map((id) => items.find((i) => i.id === id)).filter((i): i is VoiceItem => !!i);
  if (!candidates.length) return null;
  for (const t of tokens) {
    const at = t === "last" || t === "latter" ? candidates.length - 1 : ORDINAL.get(t);
    if (at !== undefined && candidates[at]) return ok(commandFor(pending.intent, candidates[at]), heard);
  }
  const pick = pickItem(
    tokens.filter((t) => !FUNCTION.has(t)),
    candidates,
  );
  return pick.kind === "none" ? null : byItem(pending.intent, pick, heard);
}

const RANK: Record<string, number> = { ok: 6, cancel: 5, ambiguous: 4, bad_amount: 3, no_item: 2, unknown: 1, empty: 0 };
const rank = (r: ParseResult) => (r.ok ? RANK.ok : RANK[r.reason]);

/** One thing the owner said → one command (or why not). */
export function parseCommand(text: string, items: readonly VoiceItem[], opts: { pending?: Pending | null } = {}): ParseResult {
  const heard = text.trim().replace(/\s+/g, " ");
  const tokens = words(heard);
  if (!tokens.length) return fail("empty", heard);
  if (has(tokens, "never mind") || has(tokens, "nevermind") || has(tokens, "forget it") || (tokens.length <= 2 && tokens.includes("cancel"))) {
    return fail("cancel", heard);
  }

  const ai = tokens.some((t) => AI_WORDS.has(t)) || has(tokens, "in person");
  // An answer to our last question, unless this is a new command of its own.
  if (opts.pending && !ai) {
    const { out, back } = stockSignals(tokens);
    if (Math.max(out, back) < 3) {
      const answer = answerPending(tokens, opts.pending, items, heard);
      if (answer) return answer;
    }
  }
  let result = ai ? parseAi(tokens, items, heard) : parseStock(tokens, items, heard);
  // "Robot cookie" is a cookie, not a robot: an AI word that led nowhere gets a second reading.
  if (ai && !result.ok && result.reason === "unknown") {
    const stock = parseStock(tokens, items, heard);
    if (rank(stock) > rank(result)) result = stock;
  }
  return result;
}

/** Speech engines offer a few guesses ("where out of Chris aunts" / "we're out of croissants"): take the best reading. */
export function parseBest(alternatives: readonly string[], items: readonly VoiceItem[], opts: { pending?: Pending | null } = {}): ParseResult {
  let best: ParseResult | null = null;
  for (const text of alternatives) {
    const r = parseCommand(text, items, opts);
    if (!best || rank(r) > rank(best)) best = r;
  }
  return best ?? parseCommand("", items, opts);
}

// ── State and replies ────────────────────────────────────────

type RulesLike = Partial<ShopRules> | null | undefined;

/** True when the shop already is the way the command asks (nothing to save). */
export function isAlready(cmd: VoiceCommand, state: { items: readonly VoiceItem[]; rules: RulesLike }): boolean {
  switch (cmd.kind) {
    case "sold_out": {
      const item = state.items.find((i) => i.id === cmd.item.id);
      if (!item) return false;
      return cmd.sold_out ? item.sold_out === true : item.sold_out !== true && (item.stock ?? 1) > 0;
    }
    case "ai_orderable":
      return isAiOrderable(state.rules, cmd.item.id) === cmd.ai_orderable;
    case "ai_limit":
      return aiOrderLimitCents(state.rules) === cmd.cents;
    case "accept_ai":
      return (state.rules?.accept_ai_orders !== false) === cmd.accept;
  }
}

/** Uncountable last words: "Coffee is sold out", not "Coffees are". */
const MASS = set(`
  coffee tea bread rice soup milk juice water chai pho kimchi honey jam granola salsa guacamole lemonade
  horchata sourdough focaccia ramen pasta cheese butter chocolate fudge toast popcorn cereal yogurt cream
  gelato sorbet kombucha cider beer wine sake soju matcha cocoa espresso mochi sushi tofu bibimbap flan
  jerky bacon ham chicken beef pork lamb fish shrimp broth chili curry stew oatmeal porridge tapioca boba
  slaw coleslaw mi art jewelry merch candy fruit hummus couscous asparagus citrus tiramisu baklava lasagna
  risotto quinoa bulgogi galbi tteokbokki thai brew
`);

const englishName = (item: VoiceItem) => !item.name_en && /^[a-z0-9\s'’&-]+$/i.test(item.name);

/** "Almond croissant" → { text: "Almond croissants", plural: true }; "Coffee" stays singular; names in other languages stay as written. */
export function menuNoun(item: VoiceItem): { text: string; plural: boolean; english: boolean } {
  const name = item.name.trim();
  if (!englishName(item)) return { text: name, plural: false, english: false };
  const m = /^(.*?)([a-z]+)$/i.exec(name);
  if (!m || /\d|\bof\b|&|\band\b/i.test(name)) return { text: name, plural: false, english: true };
  const [, head, last] = m;
  const lower = last.toLowerCase();
  if (lower.length > 2 && lower.endsWith("s") && !/(ss|us|is)$/.test(lower)) return { text: name, plural: true, english: true };
  if (MASS.has(lower)) return { text: name, plural: false, english: true };
  let plural: string;
  if (/[^aeiou]y$/.test(lower)) plural = `${last.slice(0, -1)}ies`;
  else if (/(s|x|z|ch|sh)$/.test(lower)) plural = `${last}es`;
  else if (/^(loaf|half|leaf)$/.test(lower)) plural = `${last.slice(0, -1)}ves`;
  else plural = `${last}s`;
  return { text: head + plural, plural: true, english: true };
}

/** "Almond croissants are sold out" · "Coffee is sold out" · "Bánh mì: sold out". */
function stockLine(item: VoiceItem, state: string, already = false): string {
  const noun = menuNoun(item);
  if (!noun.english) return `${noun.text}: ${already ? "already " : ""}${state}`;
  return `${noun.text} ${noun.plural ? "are" : "is"} ${already ? "already " : ""}${state}`;
}

/** "Chocolate birthday cake is in-person only" (the name as written, singular unless it already is plural). */
function itemIs(item: VoiceItem): string {
  const plural = englishName(item) && menuNoun(item).plural && menuNoun(item).text === item.name.trim();
  return `${item.name.trim()} ${plural ? "are" : "is"}`;
}

/** The line said (and shown) once a command is saved. */
export function doneLine(cmd: VoiceCommand): string {
  switch (cmd.kind) {
    case "sold_out":
      return `Done. ${stockLine(cmd.item, cmd.sold_out ? "sold out" : "back in stock")}.`;
    case "ai_orderable":
      return cmd.ai_orderable ? `Done. AI can order ${cmd.item.name.trim()} again.` : `Done. ${itemIs(cmd.item)} in-person only.`;
    case "ai_limit":
      return cmd.cents === null ? "Done. No cap on AI orders." : `Done. AI orders up to ${formatPriceShort(cmd.cents)}.`;
    case "accept_ai":
      return cmd.accept ? "Done. Taking AI orders again." : "Done. AI orders are paused.";
  }
}

/** The line when there was nothing to change. */
export function alreadyLine(cmd: VoiceCommand): string {
  switch (cmd.kind) {
    case "sold_out":
      return `${stockLine(cmd.item, cmd.sold_out ? "sold out" : "in stock", true)}.`;
    case "ai_orderable":
      return cmd.ai_orderable ? `AI can already order ${cmd.item.name.trim()}.` : `${itemIs(cmd.item)} already in-person only.`;
    case "ai_limit":
      return cmd.cents === null ? "There's already no cap on AI orders." : `AI orders are already capped at ${formatPriceShort(cmd.cents)}.`;
    case "accept_ai":
      return cmd.accept ? "Already taking AI orders." : "AI orders are already paused.";
  }
}

/** A menu item to use in examples, as the owner would say it: "almond croissants". */
export function exampleItem(items: readonly VoiceItem[]): { many: string; one: string } {
  const plain = items.filter((i) => englishName(i) && !/\d/.test(i.name)).sort((a, b) => a.name.length - b.name.length);
  const item = plain[0] ?? items.find(englishName);
  if (!item) return { many: "croissants", one: "croissant" };
  return { many: menuNoun(item).text.toLowerCase(), one: item.name.trim().toLowerCase() };
}

/** "Which one: Almond croissant or Butter croissant?" */
export function askLine(candidates: readonly VoiceItem[]): string {
  const names = candidates.map((c) => c.name.trim());
  if (names.length > 3) return "Which one? Say its full name.";
  const list = names.length === 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `Which one: ${list}?`;
}

/** The line when nothing was changed: what we missed, and an example from this menu. */
export function missLine(result: ParseResult, items: readonly VoiceItem[]): string {
  if (result.ok) return doneLine(result.command);
  const ex = exampleItem(items);
  const tryOut = `Try “we’re out of ${ex.many}”.`;
  switch (result.reason) {
    case "empty":
      return "I didn’t hear anything.";
    case "cancel":
      return "Okay, never mind.";
    case "bad_amount":
      return `AI limits go from ${formatPriceShort(AI_LIMIT_MIN_CENTS)} to $1,000.`;
    case "ambiguous":
      return askLine(result.candidates);
    case "no_item":
      return result.intent.kind === "ai_orderable"
        ? `I didn’t catch an item. Try “AI can’t order the ${ex.one}”.`
        : `I didn’t catch an item. ${tryOut}`;
    case "unknown":
      return `I didn’t catch that. ${tryOut}`;
  }
}
