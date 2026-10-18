import "server-only";
import { ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { geminiModel, getGemini } from "@/lib/ai/gemini";
import { env } from "@/lib/env";
import {
  CONFLICTING_TAGS,
  DIET_TAGS,
  ONBOARD_RESPONSE_SCHEMA,
  ONBOARD_SYSTEM_PROMPT,
  onboardUserPrompt,
  type DietTag,
} from "@/lib/ai/prompts/onboard";
import type { DraftItem, MenuDraft, PriceSource } from "@/lib/types";

// "Open in 40 seconds": ONE Gemini call (photo + voice/notes → menu draft),
// then strict post-validation. The validation is the trust layer: a price
// survives only if it can be traced to words the owner said/typed or text
// read off the photo, and allergen tags need a quoted source.

// ── Public shapes ──────────────────────────────────────────────────────

/** [ymin, xmin, ymax, xmax], 0–1000 (Gemini's box convention). */
export type Box2D = [number, number, number, number];

/** DraftItem plus where the item sits in the photo (for the tag flight). */
export interface OnboardDraftItem extends DraftItem {
  box_2d: Box2D | null;
}

/** MenuDraft plus the transcript of the voice note (shown to the owner). */
export interface OnboardDraft extends MenuDraft {
  items: OnboardDraftItem[];
  heard: string | null;
}

export interface ExtractMenuInput {
  image: { data: Buffer; mimeType: string };
  audio?: { data: Buffer; mimeType: string };
  notes?: string;
  languageHint?: string;
}

export class OnboardAiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OnboardAiError";
  }
}

export const MAX_ITEMS = 30;
export const MAX_PRICE_CENTS = 100_000; // $1,000: anything above is treated as a misread
const MAX_UNCLEAR = 12;

// ── Gemini call ────────────────────────────────────────────────────────

export async function extractMenu(input: ExtractMenuInput): Promise<OnboardDraft> {
  const notes = clean(input.notes, 2000);
  const languageHint = clean(input.languageHint, 16);
  const hasAudio = Boolean(input.audio && input.audio.data.length > 0);

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { inlineData: { data: input.image.data.toString("base64"), mimeType: input.image.mimeType } },
  ];
  if (hasAudio && input.audio) {
    parts.push({ inlineData: { data: input.audio.data.toString("base64"), mimeType: input.audio.mimeType } });
  }
  parts.push({ text: onboardUserPrompt({ hasAudio, notes, languageHint }) });

  // A weak fallback model sometimes looks at a full counter and lists nothing. An
  // empty menu is a failed read, not an answer: give the next model(s) a go.
  let start = 0;
  let empty: OnboardDraft | null = null;
  for (let tries = 0; tries <= EMPTY_RETRIES; tries++) {
    let read: GeminiRead;
    try {
      read = await callGeminiFrom(parts, ONBOARD_PROMPT, start);
    } catch (err) {
      if (empty) return empty; // the later models are out of quota too: the empty read stands
      throw err;
    }
    const draft = validateDraft(read.raw, { hasAudio, notes, languageHint });
    if (draft.items.length > 0 || read.index >= read.of - 1) {
      console.info(`[onboard] ${read.model} read ${draft.items.length} item(s)`);
      return draft;
    }
    console.warn(`[onboard] ${read.model} saw nothing; trying the next model`);
    empty = draft;
    start = read.index + 1;
  }
  return empty!;
}

/** How many more models to try after one returns an empty menu (each read takes ~5–10 s). */
const EMPTY_RETRIES = 2;
const ONBOARD_PROMPT = { system: ONBOARD_SYSTEM_PROMPT, schema: ONBOARD_RESPONSE_SCHEMA };

interface GeminiRead {
  raw: unknown;
  model: string;
  /** Position of `model` in the fallback list, and the list's length. */
  index: number;
  of: number;
}

/**
 * One menu read, trying GEMINI_MODEL first and then each GEMINI_FALLBACK_MODELS
 * entry: every model has its own free quota (gemini-3.8-flash allows only ~20
 * requests a day), and onboarding must keep working because only Gemini hears
 * the voice note. A 429 moves on to the next model; 5xx, network errors and bad
 * JSON get one retry on the same model; anything else fails at once.
 */
export async function callGemini(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  prompt: { system: string; schema: object } = ONBOARD_PROMPT,
): Promise<unknown> {
  return (await callGeminiFrom(parts, prompt, 0)).raw;
}

/** `callGemini`, starting at the `start`-th model, and saying which model answered. */
async function callGeminiFrom(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  prompt: { system: string; schema: object },
  start: number,
): Promise<GeminiRead> {
  const ai = getGemini();
  const models = [...new Set([geminiModel(), ...env.geminiFallbackModels()])];
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    if (index < start) continue;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: prompt.system,
            responseMimeType: "application/json",
            responseJsonSchema: prompt.schema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal: AbortSignal.timeout(28_000),
            // No SDK retries (its default is 5 tries with 1-8 s waits on 429): a 429 must move
            // straight to the next model, and our own loop retries 5xx once.
            httpOptions: { retryOptions: { attempts: 1 } },
          },
        });
        const text = res.text;
        if (!text) throw new OnboardAiError("Gemini returned an empty response", true);
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new OnboardAiError("Gemini returned invalid JSON", true);
        }
        return { raw, model, index, of: models.length };
      } catch (err) {
        lastError = err;
        if (isQuotaError(err)) break; // this model's free quota is used up: try the next one
        if (attempt === 0 && isRetryable(err)) continue;
        throw toOnboardError(err);
      }
    }
  }
  throw toOnboardError(lastError);
}

function isQuotaError(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 429;
}

function toOnboardError(err: unknown): OnboardAiError {
  if (err instanceof OnboardAiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new OnboardAiError(`Gemini request failed: ${message.slice(0, 300)}`, isRetryable(err));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OnboardAiError) return err.retryable;
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  const msg = err instanceof Error ? err.message : "";
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|UNAVAILABLE|INTERNAL/i.test(msg);
}

// ── Post-validation (pure; unit-tested) ────────────────────────────────

export interface ValidateContext {
  hasAudio: boolean;
  notes: string | null;
  languageHint?: string | null;
}

const looseString = z.preprocess((v) => (typeof v === "string" ? v : null), z.string().nullable());
const looseNumber = z.preprocess((v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}, z.number().nullable());

const rawItemSchema = z.object({
  name: looseString.catch(null),
  name_en: looseString.catch(null),
  price_evidence: looseString.catch(null),
  price_source: z.enum(["spoken", "tag_in_photo", "missing", "owner"]).catch("missing"),
  price_cents: looseNumber.catch(null),
  est_quantity: looseNumber.catch(null),
  description: looseString.catch(null),
  tags: z.array(z.unknown()).catch([]),
  box_2d: z.unknown().catch(null),
});

const rawDraftSchema = z.object({
  heard: looseString.catch(null),
  shop_name: looseString.catch(null),
  language: looseString.catch(null),
  items: z.array(z.unknown()).catch([]),
  unclear: z.array(z.unknown()).catch([]),
});

const rawTagSchema = z.object({
  tag: z.string(),
  source: z.enum(["spoken", "written_in_photo"]),
  quote: z.string(),
});

/**
 * Turn whatever the model returned into a safe MenuDraft:
 * coerce + clamp fields, drop junk, merge duplicates, and enforce
 * "never invent a price" and "allergen tags need a source".
 */
export function validateDraft(raw: unknown, ctx: ValidateContext): OnboardDraft {
  const parsed = rawDraftSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  const d = parsed.success ? parsed.data : { heard: null, shop_name: null, language: null, items: [], unclear: [] };

  const notes = clean(ctx.notes, 2000);
  const heard = ctx.hasAudio ? clean(d.heard, 2000) : null;
  const language = normalizeLanguage(d.language) ?? normalizeLanguage(ctx.languageHint ?? null) ?? "en";
  const sourceText = [heard, notes].filter(Boolean).join("\n");
  const owner = { hasAudio: ctx.hasAudio, notes, sourceText, english: language.startsWith("en") };

  const unclear: string[] = [];
  for (const u of d.unclear) {
    const note = typeof u === "string" ? clean(u, 120) : null;
    if (note) unclear.push(note);
  }

  const items: OnboardDraftItem[] = [];
  const byKey = new Map<string, OnboardDraftItem>();
  for (const rawItem of d.items) {
    const r = rawItemSchema.safeParse(rawItem && typeof rawItem === "object" ? rawItem : {});
    if (!r.success) continue;
    const item = validateItem(r.data, owner, unclear);
    if (!item) continue;
    const key = itemKey(item.name);
    const existing = byKey.get(key);
    if (existing) {
      mergeInto(existing, item);
      continue;
    }
    if (items.length >= MAX_ITEMS) continue;
    byKey.set(key, item);
    items.push(item);
  }

  // Every missing price gets a note for the owner (unless the model already wrote one).
  for (const item of items) {
    if (item.price_cents !== null) continue;
    const mentioned = unclear.some((u) => u.toLowerCase().includes(item.name.toLowerCase()));
    if (!mentioned) unclear.push(`price for ${item.name}`);
  }

  return {
    shop_name: clean(d.shop_name, 80),
    language,
    items,
    unclear: dedupe(unclear).slice(0, MAX_UNCLEAR),
    heard,
  };
}

export interface OwnerWords {
  hasAudio: boolean;
  notes: string | null;
  sourceText: string; // transcript + typed notes
  english: boolean;
}

function validateItem(
  r: z.infer<typeof rawItemSchema>,
  owner: OwnerWords,
  unclear: string[],
): OnboardDraftItem | null {
  const name = cleanName(r.name);
  if (!name) return null;
  let nameEn = cleanName(r.name_en);
  if (nameEn && nameEn.toLowerCase() === name.toLowerCase()) nameEn = null;

  const price = validatePrice(
    { cents: r.price_cents, source: r.price_source, evidence: clean(r.price_evidence, 120) },
    owner,
  );
  if (price.rejected) unclear.push(`check the price for ${name}`);

  return {
    name,
    name_en: nameEn,
    price_cents: price.cents,
    price_source: price.source,
    description: clean(r.description, 200),
    tags: validateTags(r.tags, owner, name, unclear),
    est_quantity: validateQuantity(r.est_quantity),
    box_2d: validateBox(r.box_2d),
  };
}

// ── Prices ─────────────────────────────────────────────────────────────

interface PriceIn {
  cents: number | null;
  source: string;
  evidence: string | null;
}
interface PriceOut {
  cents: number | null;
  source: PriceSource;
  /** true when the model claimed a price we could not trace (owner gets a note). */
  rejected: boolean;
}

const MISSING: PriceOut = { cents: null, source: "missing", rejected: false };
const REJECTED: PriceOut = { cents: null, source: "missing", rejected: true };

/** Prices must be US dollars; these mean the number is in another currency. */
const FOREIGN_CURRENCY = /[£€¥₩₹฿₫₱]|\b(eur|euros?|gbp|pounds?|quid|yen|yuan|rmb|baht|dong|pesos?|rupees?|won)\b/i;

export function validatePrice(p: PriceIn, owner: OwnerWords): PriceOut {
  if (p.source !== "spoken" && p.source !== "tag_in_photo") return MISSING;
  if (p.cents === null || !Number.isFinite(p.cents) || p.cents <= 0) return MISSING;
  if (p.evidence && FOREIGN_CURRENCY.test(p.evidence)) return REJECTED;

  let cents = Math.round(p.cents);
  const evidenceAmounts = p.evidence ? amountsIn(p.evidence) : new Set<number>();

  // The evidence names a different number → fix the classic dollars-for-cents
  // slip (18 → 1800, 1.1 → 110) only when the evidence proves it, else reject.
  if (evidenceAmounts.size > 0 && !evidenceAmounts.has(cents)) {
    const asDollars = Math.round(p.cents * 100);
    if (evidenceAmounts.has(asDollars)) cents = asDollars;
    else return REJECTED;
  }
  if (cents < 1 || cents > MAX_PRICE_CENTS) return REJECTED;

  if (p.source === "tag_in_photo") {
    // Read off the photo: we can't re-read the image, but the model must quote the tag.
    return p.evidence ? { cents, source: "tag_in_photo", rejected: false } : REJECTED;
  }

  // "spoken": the owner must actually have said or typed something.
  if (!owner.hasAudio && !owner.notes) return REJECTED;
  if (!owner.sourceText) {
    // Voice note without a transcript: nothing to check against; keep only quoted prices.
    return p.evidence ? { cents, source: "spoken", rejected: false } : REJECTED;
  }
  if (amountsIn(owner.sourceText).has(cents)) return { cents, source: "spoken", rejected: false };
  // Words we can't parse into numbers (another language): the quote must be in what was said.
  if (p.evidence && evidenceAmounts.size === 0 && fuzzyContains(owner.sourceText, p.evidence)) {
    return { cents, source: "spoken", rejected: false };
  }
  return REJECTED;
}

// ── Tags ───────────────────────────────────────────────────────────────

const TAG_SET = new Set<string>(DIET_TAGS);

const TAG_SYNONYMS: Record<string, DietTag> = {
  "no-nuts": "nut-free",
  "nut-free": "nut-free",
  "nutfree": "nut-free",
  "tree-nut-free": "nut-free",
  "has-nuts": "contains-nuts",
  "nuts": "contains-nuts",
  "with-nuts": "contains-nuts",
  "no-peanuts": "peanut-free",
  "peanuts": "contains-peanuts",
  "no-gluten": "gluten-free",
  "gluten": "contains-gluten",
  "wheat": "contains-gluten",
  "no-dairy": "dairy-free",
  "dairy": "contains-dairy",
  "milk": "contains-dairy",
  "lactose-free": "dairy-free",
  "no-eggs": "egg-free",
  "no-egg": "egg-free",
  "eggs": "contains-eggs",
  "egg": "contains-eggs",
  "contains-egg": "contains-eggs",
  "soy": "contains-soy",
  "sesame": "contains-sesame",
  "veggie": "vegetarian",
  "plant-based": "vegan",
  "no-sugar": "sugar-free",
};

/** Words that must appear in an English quote before we accept the tag. */
const TAG_KEYWORDS: Record<DietTag, RegExp> = {
  "nut-free": /\bnut|almond|walnut|pecan|hazelnut|pistachio|cashew|macadamia/,
  "contains-nuts": /\bnut|almond|walnut|pecan|hazelnut|pistachio|cashew|macadamia/,
  "peanut-free": /peanut/,
  "contains-peanuts": /peanut/,
  "gluten-free": /gluten|wheat|celiac|coeliac|\bgf\b/,
  "contains-gluten": /gluten|wheat|flour/,
  "dairy-free": /dairy|milk|butter|lactose|cream|cheese/,
  "contains-dairy": /dairy|milk|butter|lactose|cream|cheese/,
  "egg-free": /\begg/,
  "contains-eggs": /\begg/,
  "soy-free": /\bsoy/,
  "contains-soy": /\bsoy/,
  "sesame-free": /sesame/,
  "contains-sesame": /sesame/,
  vegan: /vegan|plant[- ]based/,
  vegetarian: /vegetarian|veggie|meat/,
  halal: /halal/,
  kosher: /kosher/,
  "sugar-free": /sugar/,
  spicy: /spic|\bhot\b|chil/,
};

export function normalizeTag(tag: string): DietTag | null {
  const k = tag
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (TAG_SET.has(k)) return k as DietTag;
  return TAG_SYNONYMS[k] ?? null;
}

export function validateTags(rawTags: unknown[], owner: OwnerWords, itemName: string, unclear: string[]): string[] {
  const kept = new Set<DietTag>();
  for (const t of rawTags) {
    const r = rawTagSchema.safeParse(t);
    if (!r.success) continue; // a bare string has no source → it's a guess → drop it
    const tag = normalizeTag(r.data.tag);
    const quote = clean(r.data.quote, 160);
    if (!tag || !quote) continue;
    if (owner.english && !TAG_KEYWORDS[tag].test(quote.toLowerCase())) continue;
    if (r.data.source === "spoken") {
      if (!owner.hasAudio && !owner.notes) continue;
      if (owner.sourceText && !fuzzyContains(owner.sourceText, quote)) continue;
    }
    kept.add(tag);
  }
  for (const [a, b] of CONFLICTING_TAGS) {
    if (kept.has(a) && kept.has(b)) {
      kept.delete(a);
      kept.delete(b);
      unclear.push(`allergy info for ${itemName} (${a} vs ${b})`);
    }
  }
  return DIET_TAGS.filter((t) => kept.has(t));
}

// ── Small fields ───────────────────────────────────────────────────────

export function validateQuantity(q: number | null): number | null {
  if (q === null || !Number.isFinite(q) || q < 0) return null;
  return Math.min(999, Math.round(q));
}

function validateBox(v: unknown): Box2D | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const n = v.map((x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : NaN));
  if (n.some((x) => Number.isNaN(x) || x < 0 || x > 1000)) return null;
  const [ymin, xmin, ymax, xmax] = n;
  if (ymax <= ymin || xmax <= xmin) return null;
  return [ymin, xmin, ymax, xmax];
}

export function normalizeLanguage(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase().replace(/_/g, "-");
  return /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/.test(s) ? s : null;
}

function mergeInto(a: OnboardDraftItem, b: OnboardDraftItem) {
  if (a.price_cents === null && b.price_cents !== null) {
    a.price_cents = b.price_cents;
    a.price_source = b.price_source;
  }
  if (a.est_quantity === null) a.est_quantity = b.est_quantity;
  if (a.box_2d === null) a.box_2d = b.box_2d;
  if (!a.name_en) a.name_en = b.name_en;
  if (!a.description) a.description = b.description;
  a.tags = DIET_TAGS.filter((t) => a.tags.includes(t) || b.tags.includes(t));
}

// ── Text helpers ───────────────────────────────────────────────────────

export function clean(v: string | null | undefined, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max).trim() : null;
}

export function cleanName(v: string | null): string | null {
  const s = clean(v, 200)?.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "");
  if (!s || !/[\p{L}\p{N}]/u.test(s)) return null;
  return s.slice(0, 80).trim();
}

export function itemKey(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function words(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** True if (almost) every word of `quote` appears in `text`. */
export function fuzzyContains(text: string, quote: string): boolean {
  const q = words(quote);
  if (q.length === 0) return false;
  const t = new Set(words(text));
  const hits = q.filter((w) => t.has(w)).length;
  return hits / q.length >= 0.75;
}

// ── Amount parsing: every price a piece of text could be naming, in cents ──

const UNITS: Record<string, number> = {
  zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const DOLLAR_WORDS = new Set(["dollar", "dollars", "buck", "bucks"]);
const CENT_WORDS = new Set(["cent", "cents"]);

/**
 * All amounts (in cents) that `text` could be stating, generously:
 * "$4.50" "4,50" "4 50" "18" → 450/450/450/1800; "eighteen dollars" → 1800;
 * "four fifty" → 450; "three twenty five" → 325; "a dollar fifty" → 150;
 * "fifty cents" → 50. Used to check that a price was really said/typed.
 */
export function amountsIn(text: string): Set<number> {
  const out = new Set<number>();
  const s = text.toLowerCase();

  // Digits: 18 · 4.50 · 4,50 · $3.25 · "4 50" (the second chunk is also read on its own)
  for (const m of s.matchAll(/(\d{1,5})(?:[.,](\d{1,2}))?(?=(?:\s+(\d{2})(?!\d))?)/g)) {
    const whole = Number(m[1]);
    if (m[2] !== undefined) {
      out.add(whole * 100 + Number(m[2].padEnd(2, "0")));
      continue;
    }
    out.add(whole * 100);
    if (m[3] !== undefined) out.add(whole * 100 + Number(m[3]));
    if (whole >= 100 && whole <= 9999) out.add(whole); // "450" said as $4.50
  }
  // "4 dollars 50" · "4 dollars and 50 cents" · "4 dólares con 50" · "4 đô 50"
  for (const m of s.matchAll(
    /(\d{1,4})\s*(?:dollars?|d[oó]lares?|bucks?|đô(?:\s*la)?|usd)\s*(?:and|con|y|và|,)?\s*(\d{1,2})(?!\d)/g,
  )) {
    out.add(Number(m[1]) * 100 + Number(m[2]));
  }
  // "50 cents" · "50 centavos" · "50¢"
  for (const m of s.matchAll(/(?<![\d.,])(\d{1,2})\s*(?:cents?|centavos?|¢)/g)) out.add(Number(m[1]));

  // Number words
  const tokens = s.split(/[^a-z]+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length) {
    if (!isNumberToken(tokens, i)) {
      i++;
      continue;
    }
    const run: string[] = [];
    while (
      i < tokens.length &&
      (isNumberToken(tokens, i) || tokens[i] === "and" || DOLLAR_WORDS.has(tokens[i]) || CENT_WORDS.has(tokens[i]))
    ) {
      run.push(tokens[i]);
      i++;
    }
    while (run.length && run[run.length - 1] === "and") run.pop();
    for (const c of runAmounts(run)) out.add(c);
    // "eighteen and four fifty": also read each side of an "and" on its own
    if (run.includes("and")) {
      let seg: string[] = [];
      for (const w of [...run, "and"]) {
        if (w === "and") {
          for (const c of runAmounts(seg)) out.add(c);
          seg = [];
        } else seg.push(w);
      }
    }
  }
  return out;
}

/** A number word at tokens[i]; "a"/"an" only count right before "dollar(s)" or "hundred". */
function isNumberToken(tokens: string[], i: number): boolean {
  const w = tokens[i];
  if (w === "a" || w === "an") {
    const next = tokens[i + 1];
    return next !== undefined && (DOLLAR_WORDS.has(next) || next === "hundred");
  }
  return w in UNITS || w in TENS || w === "hundred";
}

/** Parse a run of number words into candidate amounts (cents). */
function runAmounts(run: string[]): number[] {
  const out: number[] = [];
  if (run.length === 0) return out;
  // Split around explicit units: "<x> dollars (and) <y> (cents)" / "<y> cents"
  const dollarAt = run.findIndex((w) => DOLLAR_WORDS.has(w));
  const centAt = run.findIndex((w) => CENT_WORDS.has(w));
  if (dollarAt >= 0) {
    const dollars = wordsToNumber(run.slice(0, dollarAt));
    const rest = run.slice(dollarAt + 1).filter((w) => w !== "and" && !CENT_WORDS.has(w));
    const cents = rest.length ? wordsToNumber(rest) : 0;
    if (dollars !== null && cents !== null && cents < 100) out.push(dollars * 100 + cents);
    return out;
  }
  if (centAt >= 0) {
    const cents = wordsToNumber(run.slice(0, centAt));
    if (cents !== null && cents < 100) out.push(cents);
    return out;
  }
  const nums = run.filter((w) => w !== "and");
  const whole = wordsToNumber(nums);
  if (whole !== null) out.push(whole * 100);
  // "four fifty" / "three twenty five" / "twelve ninety nine": dollars then a cents chunk
  for (let k = 1; k < nums.length; k++) {
    const d = wordsToNumber(nums.slice(0, k));
    const c = wordsToNumber(nums.slice(k));
    if (d !== null && c !== null && c >= 10 && c < 100 && d < 1000) out.push(d * 100 + c);
  }
  return out;
}

/** "twenty five" → 25, "one hundred twenty" → 120, "eighteen" → 18; null if not a single number. */
function wordsToNumber(ws: string[]): number | null {
  if (ws.length === 0) return null;
  let total = 0;
  let current = 0;
  let lastKind: "unit" | "ten" | "hundred" | null = null;
  for (const w of ws) {
    if (w in UNITS) {
      if (lastKind === "unit") return null; // "four five" isn't one number
      if (lastKind === "ten" && UNITS[w] >= 10) return null;
      current += UNITS[w];
      lastKind = "unit";
    } else if (w in TENS) {
      if (lastKind === "unit" || lastKind === "ten") return null;
      current += TENS[w];
      lastKind = "ten";
    } else if (w === "hundred") {
      if (lastKind === "hundred") return null;
      current = (current || 1) * 100;
      total += current;
      current = 0;
      lastKind = "hundred";
    } else {
      return null;
    }
  }
  return total + current;
}
