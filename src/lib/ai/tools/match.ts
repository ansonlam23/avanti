// Text matching for shop search + "what did the shop say about X". Pure, no deps.
// The data set is small (a few shops × ≤30 items), so we match in memory:
// item name / English name / description / tags, and the shop name.

/** Lowercase, strip accents ("Bánh" → "banh"), keep letters/digits. */
export function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Tiny plural stripper. Matching is by word start plus a plural ending (see
 * hasWord), so a stem only has to start the singular: cakes → cake,
 * cookies → cook(ie), pastries → pastr(y), boxes → box, tomatoes → tomato.
 */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return word.length >= 6 ? word.slice(0, -3) : word.slice(0, -1);
  if (/(ss|x|ch|sh|o)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

const STOP = new Set(
  (
    "a an the and or for with near nearby close around me my i im we need want wanted looking look some something " +
    "any anything by to of in on at from campus today tonight now please get find buy order orders pickup pick up " +
    "shop shops store stores place places good best cheap under less than is are there it its that this what " +
    "where who whats have has do does can could would like no not without free uw university seattle pm am " +
    "oclock o clock before after until till one two few little big small birthday party gift"
  ).split(" "),
);

/** Allergen / diet topics → words that signal them in a question, tag or description. */
export const DIET_TOPICS: Record<string, string[]> = {
  nuts: ["nut", "peanut", "almond", "walnut", "pecan", "hazelnut", "pistachio", "cashew", "macadamia"],
  dairy: ["dairy", "milk", "lactose", "butter", "cream", "cheese"],
  gluten: ["gluten", "wheat", "celiac", "coeliac"],
  eggs: ["egg"],
  soy: ["soy", "soya"],
  sesame: ["sesame"],
  vegan: ["vegan", "plant based"],
  vegetarian: ["vegetarian", "veggie"],
  sugar: ["sugar"],
  halal: ["halal"],
  kosher: ["kosher"],
  fish: ["fish", "shellfish", "shrimp", "crab"],
};

const DIET_WORDS = new Set(Object.values(DIET_TOPICS).flat().map(stem));

/** A few everyday words that should find the obvious items. */
const SYNONYMS: Record<string, string[]> = {
  dessert: ["cake", "cookie", "brownie", "pie", "tart", "pastry", "cupcake", "mochi"],
  sweet: ["cake", "cookie", "brownie", "pastry", "cupcake", "donut"],
  pastry: ["croissant", "danish", "tart", "scone", "muffin", "bun", "pastry"],
  breakfast: ["croissant", "bagel", "muffin", "scone", "pastry", "egg", "coffee"],
  bread: ["bread", "loaf", "baguette", "bun", "roll", "banh mi"],
  drink: ["coffee", "tea", "latte", "boba", "juice", "smoothie", "espresso"],
  coffee: ["coffee", "latte", "espresso", "americano", "cappuccino", "mocha"],
  cupcake: ["cupcake", "cake"],
  flower: ["flower", "bouquet", "rose", "tulip"],
};

export interface QueryTerms {
  /** Product words (stemmed), each with its synonym group. */
  keywords: Array<{ word: string; alts: string[] }>;
  /** Diet words found in the query (stemmed). */
  diet: string[];
}

export function queryTerms(query: string): QueryTerms {
  const words = normalize(query).split(/\s+/).filter(Boolean).map(stem);
  const keywords: QueryTerms["keywords"] = [];
  const diet: string[] = [];
  for (const w of words) {
    if (STOP.has(w) || /^\d+$/.test(w)) continue;
    if (DIET_WORDS.has(w)) {
      if (!diet.includes(w)) diet.push(w);
      continue;
    }
    if (keywords.some((k) => k.word === w)) continue;
    keywords.push({ word: w, alts: [w, ...(SYNONYMS[w] ?? []).map(stem)] });
  }
  return { keywords, diet };
}

/** What may follow a stem inside a word: nothing, or a plural/singular ending (cook+ie, pastr+y, box+es). */
const ENDINGS = new Set(["", "s", "es", "ie", "ies", "y", "ys"]);

/**
 * Does `haystack` (normalized) contain `word` as a word, give or take a plural
 * ending ("cake" ∈ "chocolate cakes", "cook" ∈ "cookie")? Not as any prefix:
 * "bun" ∉ "bundle", "pho" ∉ "phone", "rose" ∉ "rosemary".
 */
export function hasWord(haystack: string, word: string): boolean {
  if (!word) return false;
  const h = ` ${haystack} `;
  const needle = ` ${word}`;
  for (let i = h.indexOf(needle); i !== -1; i = h.indexOf(needle, i + 1)) {
    const after = h.slice(i + needle.length);
    if (ENDINGS.has(after.slice(0, after.indexOf(" ")))) return true;
  }
  return false;
}

export interface MatchableItem {
  name: string;
  name_en: string | null;
  description: string | null;
  tags: string[];
}

/**
 * Score an item for a query: name hits count double. Diet words only add to
 * the score when an item already matched a product word (or when the query
 * is diet-only, e.g. "vegan"), so "no nuts" never surfaces nut items by itself.
 */
export function scoreItem(item: MatchableItem, terms: QueryTerms): number {
  const name = normalize(`${item.name} ${item.name_en ?? ""}`);
  const rest = normalize(`${item.description ?? ""} ${item.tags.join(" ")}`);
  let score = 0;
  for (const k of terms.keywords) {
    if (k.alts.some((a) => hasWord(name, a))) score += 2;
    else if (k.alts.some((a) => hasWord(rest, a))) score += 1;
  }
  if (terms.keywords.length === 0 && terms.diet.length > 0) {
    const tags = normalize(item.tags.join(" "));
    for (const d of terms.diet) if (hasWord(tags, d)) score += 1;
  }
  return score;
}

export function shopNameMatches(shopName: string, terms: QueryTerms): boolean {
  const n = normalize(shopName);
  return terms.keywords.some((k) => k.word.length >= 3 && hasWord(n, k.word));
}

/** Which diet topics a question is about ("does it have nuts?" → ["nuts"]). */
export function topicsIn(question: string): string[] {
  const words = normalize(question).split(/\s+/).map(stem);
  const text = ` ${words.join(" ")} `;
  return Object.entries(DIET_TOPICS)
    .filter(([, signals]) => signals.some((s) => text.includes(` ${stem(s)}`)))
    .map(([topic]) => topic);
}

/** Exactly what an item's own data says about a topic: matching tags and description sentences. */
export function itemSaysAbout(item: MatchableItem, topic: string): string[] {
  const signals = (DIET_TOPICS[topic] ?? []).map(stem);
  const says: string[] = [];
  for (const tag of item.tags) {
    const t = normalize(tag);
    if (signals.some((s) => hasWord(t, s))) says.push(`tag: ${tag}`);
  }
  for (const sentence of (item.description ?? "").split(/(?<=[.!?])\s+/)) {
    const t = normalize(sentence);
    if (t && signals.some((s) => hasWord(t, s))) says.push(`description: "${sentence.trim()}"`);
  }
  return says;
}

/** Shop-level notes (e.g. "no nuts in anything") that mention a topic. */
export function notesSayAbout(notes: string | null | undefined, topic: string): string[] {
  if (!notes) return [];
  const signals = (DIET_TOPICS[topic] ?? []).map(stem);
  return notes
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => signals.some((s) => hasWord(normalize(sentence), s)))
    .map((sentence) => `shop notes: "${sentence.trim()}"`);
}
