import "server-only";
import { z } from "zod";
import {
  callGemini,
  clean,
  cleanName,
  dedupe,
  itemKey,
  MAX_ITEMS,
  normalizeLanguage,
  normalizeTag,
  validatePrice,
  validateQuantity,
  validateTags,
  type OwnerWords,
} from "@/lib/ai/onboard";
import { CONFLICTING_TAGS, DIET_TAGS, type DietTag } from "@/lib/ai/prompts/onboard";
import {
  REVISE_RESPONSE_SCHEMA,
  REVISE_SYSTEM_PROMPT,
  reviseUserPrompt,
} from "@/lib/ai/prompts/onboard-revise";
import type { PriceSource } from "@/lib/types";

// "Change anything" in /open: the menu so far + the owner's new words (voice
// note or typed) → only the changes they asked for. Same trust layer as the
// first read: a price survives only if it traces to these words, and a diet
// tag needs a quote from them. Everything the owner didn't mention stays put.

// ── Public shapes ──────────────────────────────────────────────────────

/** One line of the menu so far, as the owner's screen has it. */
export interface MenuSoFarItem {
  id: string;
  name: string;
  name_en: string | null;
  price_cents: number | null;
  price_source: PriceSource;
  description: string | null;
  tags: string[];
  est_quantity: number | null;
}

export interface RevisionItem {
  name: string;
  name_en: string | null;
  price_cents: number | null;
  price_source: PriceSource;
  description: string | null;
  tags: string[];
  est_quantity: number | null;
}

export type RevisionChange =
  | { op: "add"; item: RevisionItem }
  | { op: "update"; id: string; patch: Partial<RevisionItem> }
  | { op: "remove"; id: string };

export interface MenuRevision {
  /** What the AI heard in the voice note (null for typed changes). */
  heard: string | null;
  shop_name: string | null;
  language: string | null;
  changes: RevisionChange[];
  unclear: string[];
}

export interface ReviseMenuInput {
  menu: MenuSoFarItem[];
  shopName: string | null;
  audio?: { data: Buffer; mimeType: string };
  notes?: string;
  languageHint?: string;
}

const MAX_UNCLEAR = 12;

// ── Gemini call ────────────────────────────────────────────────────────

export async function reviseMenu(input: ReviseMenuInput): Promise<MenuRevision> {
  const notes = clean(input.notes, 2000);
  const languageHint = clean(input.languageHint, 16);
  const hasAudio = Boolean(input.audio && input.audio.data.length > 0);

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (hasAudio && input.audio) {
    parts.push({ inlineData: { data: input.audio.data.toString("base64"), mimeType: input.audio.mimeType } });
  }
  parts.push({
    text: reviseUserPrompt({
      hasAudio,
      notes,
      shopName: clean(input.shopName, 80),
      languageHint,
      menu: input.menu.map((m) => ({
        id: m.id,
        name: m.name,
        name_en: m.name_en,
        price_cents: m.price_cents,
        tags: m.tags,
        est_quantity: m.est_quantity,
      })),
    }),
  });

  const raw = await callGemini(parts, { system: REVISE_SYSTEM_PROMPT, schema: REVISE_RESPONSE_SCHEMA });
  return validateRevision(raw, { menu: input.menu, hasAudio, notes, languageHint });
}

// ── Post-validation (pure; unit-tested) ────────────────────────────────

export interface ReviseContext {
  menu: MenuSoFarItem[];
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

const rawChangeSchema = z.object({
  op: z.enum(["add", "update", "remove"]),
  id: looseString.catch(null),
  name: looseString.catch(null),
  name_en: looseString.catch(null),
  price_action: z.enum(["keep", "set", "clear"]).catch("keep"),
  price_evidence: looseString.catch(null),
  price_cents: looseNumber.catch(null),
  est_quantity: looseNumber.catch(null),
  description: looseString.catch(null),
  tags_add: z.array(z.unknown()).catch([]),
  tags_remove: z.array(z.unknown()).catch([]),
});
type RawChange = z.infer<typeof rawChangeSchema>;

const rawRevisionSchema = z.object({
  heard: looseString.catch(null),
  changes: z.array(z.unknown()).catch([]),
  shop_name: looseString.catch(null),
  language: looseString.catch(null),
  unclear: z.array(z.unknown()).catch([]),
});

const rawTagAddSchema = z.object({ tag: z.string(), quote: z.string() });

/**
 * Turn whatever the model returned into safe changes against `ctx.menu`:
 * resolve ids (or names) to real lines, turn a duplicate "add" into an update,
 * keep a price only if it traces to the owner's words in this message, and
 * keep a new diet tag only with a quote from them.
 */
export function validateRevision(raw: unknown, ctx: ReviseContext): MenuRevision {
  const parsed = rawRevisionSchema.safeParse(raw && typeof raw === "object" ? raw : {});
  const d = parsed.success
    ? parsed.data
    : { heard: null, changes: [], shop_name: null, language: null, unclear: [] };

  const notes = clean(ctx.notes, 2000);
  const heard = ctx.hasAudio ? clean(d.heard, 2000) : null;
  const language = normalizeLanguage(d.language) ?? normalizeLanguage(ctx.languageHint ?? null);
  const owner: OwnerWords = {
    hasAudio: ctx.hasAudio,
    notes,
    sourceText: [heard, notes].filter(Boolean).join("\n"),
    english: (language ?? "en").startsWith("en"),
  };
  // A typed price is the owner's own entry; a heard one keeps the mic mark.
  const said: PriceSource = ctx.hasAudio ? "spoken" : "owner";

  const unclear: string[] = [];
  for (const u of d.unclear) {
    const note = typeof u === "string" ? clean(u, 120) : null;
    if (note) unclear.push(note);
  }

  // The lines as they stand, updated as changes are accepted (so two updates to one line merge).
  const lines = new Map(ctx.menu.map((m) => [m.id, { ...m, tags: [...m.tags] }]));
  const findByName = (name: string | null): string | null => {
    if (!name) return null;
    const k = itemKey(name);
    if (!k) return null;
    for (const [id, m] of lines) {
      if (itemKey(m.name) === k || (m.name_en && itemKey(m.name_en) === k)) return id;
    }
    return null;
  };

  const patches = new Map<string, Partial<RevisionItem>>();
  const removed = new Set<string>();
  const adds: RevisionItem[] = [];

  for (const rawChange of d.changes) {
    const r = rawChangeSchema.safeParse(rawChange && typeof rawChange === "object" ? rawChange : {});
    if (!r.success) continue;
    const c = r.data;
    const named = cleanName(c.name);
    const target =
      (c.id && lines.has(c.id) ? c.id : null) ?? findByName(named) ?? findByName(cleanName(c.name_en));

    if (c.op === "remove") {
      if (target && !removed.has(target)) {
        removed.add(target);
        patches.delete(target);
      }
      continue;
    }

    if (target && !removed.has(target)) {
      // an update, or an "add" of something already on the menu
      const line = lines.get(target)!;
      const patch = updatePatch(line, c, owner, said, unclear);
      if (Object.keys(patch).length === 0) continue;
      Object.assign(line, patch);
      patches.set(target, { ...patches.get(target), ...patch });
      continue;
    }

    if (!named) continue; // an update of nothing we know, with no name to add it by
    const key = itemKey(named);
    if (adds.some((a) => itemKey(a.name) === key)) continue;
    if (ctx.menu.length - removed.size + adds.length >= MAX_ITEMS) {
      unclear.push(`the menu is full (${MAX_ITEMS} things)`);
      continue;
    }
    adds.push(newItem(named, c, owner, said, unclear));
  }

  for (const item of adds) {
    if (item.price_cents !== null) continue;
    const mentioned = unclear.some((u) => u.toLowerCase().includes(item.name.toLowerCase()));
    if (!mentioned) unclear.push(`price for ${item.name}`);
  }

  const changes: RevisionChange[] = [
    ...[...patches].map(([id, patch]) => ({ op: "update" as const, id, patch })),
    ...[...removed].map((id) => ({ op: "remove" as const, id })),
    ...adds.map((item) => ({ op: "add" as const, item })),
  ];

  return {
    heard,
    shop_name: clean(d.shop_name, 80),
    language,
    changes,
    unclear: dedupe(unclear).slice(0, MAX_UNCLEAR),
  };
}

/** What one change does to an existing line; only fields that really change. */
function updatePatch(
  line: MenuSoFarItem,
  c: RawChange,
  owner: OwnerWords,
  said: PriceSource,
  unclear: string[],
): Partial<RevisionItem> {
  const patch: Partial<RevisionItem> = {};
  const name = cleanName(c.name);
  // a rename, not the same name said in another case ("lemon bars" = "Lemon bars")
  if (name && itemKey(name) !== itemKey(line.name)) patch.name = name;
  const nameEn = cleanName(c.name_en);
  if (nameEn && nameEn.toLowerCase() !== (patch.name ?? line.name).toLowerCase() && nameEn !== line.name_en) {
    patch.name_en = nameEn;
  }
  const label = patch.name ?? line.name;

  if (c.price_action === "set") {
    const cents = checkedPrice(c, owner);
    if (cents === null) unclear.push(`check the price for ${label}`);
    else if (cents !== line.price_cents || line.price_source === "missing") {
      patch.price_cents = cents;
      patch.price_source = said;
    }
  } else if (c.price_action === "clear" && line.price_cents !== null) {
    patch.price_cents = null;
    patch.price_source = "missing";
  }

  const qty = validateQuantity(c.est_quantity);
  if (qty !== null && qty !== line.est_quantity) patch.est_quantity = qty;
  const description = clean(c.description, 200);
  if (description && description !== line.description) patch.description = description;

  const tags = nextTags(line.tags, c, owner, label, unclear);
  if (tags.join() !== DIET_TAGS.filter((t) => line.tags.includes(t)).join()) patch.tags = tags;
  return patch;
}

function newItem(name: string, c: RawChange, owner: OwnerWords, said: PriceSource, unclear: string[]): RevisionItem {
  let nameEn = cleanName(c.name_en);
  if (nameEn && nameEn.toLowerCase() === name.toLowerCase()) nameEn = null;
  let cents: number | null = null;
  if (c.price_action === "set") {
    cents = checkedPrice(c, owner);
    if (cents === null) unclear.push(`check the price for ${name}`);
  }
  return {
    name,
    name_en: nameEn,
    price_cents: cents,
    price_source: cents === null ? "missing" : said,
    description: clean(c.description, 200),
    tags: nextTags([], c, owner, name, unclear),
    est_quantity: validateQuantity(c.est_quantity),
  };
}

/** A "set" price that traces to the owner's words in this message, else null. */
function checkedPrice(c: RawChange, owner: OwnerWords): number | null {
  const p = validatePrice({ cents: c.price_cents, source: "spoken", evidence: clean(c.price_evidence, 120) }, owner);
  return p.cents;
}

/**
 * The line's tags after this change: removals first, then additions that the
 * owner's words back up. The latest words win: a new "nut-free" replaces an old
 * "contains-nuts" even if the model forgot to remove it.
 */
function nextTags(current: string[], c: RawChange, owner: OwnerWords, name: string, unclear: string[]): string[] {
  const remove = new Set<DietTag>();
  for (const t of c.tags_remove) {
    const tag = typeof t === "string" ? normalizeTag(t) : null;
    if (tag) remove.add(tag);
  }
  const quoted = c.tags_add.flatMap((t) => {
    const r = rawTagAddSchema.safeParse(t);
    return r.success ? [{ tag: r.data.tag, source: "spoken", quote: r.data.quote }] : [];
  });
  const added = new Set(validateTags(quoted, owner, name, unclear) as DietTag[]);
  const kept = new Set(current.map((t) => normalizeTag(t)).filter((t): t is DietTag => t !== null && !remove.has(t)));
  for (const [a, b] of CONFLICTING_TAGS) {
    if (added.has(a)) kept.delete(b);
    if (added.has(b)) kept.delete(a);
  }
  return DIET_TAGS.filter((t) => kept.has(t) || added.has(t));
}
