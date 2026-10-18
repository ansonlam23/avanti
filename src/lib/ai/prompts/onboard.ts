// Prompt + response schema for "Open in 40 seconds" (one Gemini call:
// counter photo + voice note or typed notes → a menu draft).
// Plain module (no server-only) so the review screen can reuse DIET_TAGS.

/** Allergen / diet tags we accept (kebab-case). Anything else is dropped. */
export const DIET_TAGS = [
  "nut-free",
  "contains-nuts",
  "peanut-free",
  "contains-peanuts",
  "gluten-free",
  "contains-gluten",
  "dairy-free",
  "contains-dairy",
  "egg-free",
  "contains-eggs",
  "soy-free",
  "contains-soy",
  "sesame-free",
  "contains-sesame",
  "vegan",
  "vegetarian",
  "halal",
  "kosher",
  "sugar-free",
  "spicy",
] as const;

export type DietTag = (typeof DIET_TAGS)[number];

/** Pairs that can't both be true of one item. */
export const CONFLICTING_TAGS: ReadonlyArray<readonly [DietTag, DietTag]> = [
  ["nut-free", "contains-nuts"],
  ["peanut-free", "contains-peanuts"],
  ["gluten-free", "contains-gluten"],
  ["dairy-free", "contains-dairy"],
  ["egg-free", "contains-eggs"],
  ["soy-free", "contains-soy"],
  ["sesame-free", "contains-sesame"],
  ["vegan", "contains-dairy"],
  ["vegan", "contains-eggs"],
];

export const ONBOARD_SYSTEM_PROMPT = `You set up a small shop on avanti. The owner gave you ONE photo of their counter (what they sell today) and a voice note or typed notes about it. Turn that into their menu as JSON.

People will pay these prices and people with allergies will trust these tags, so these rules are absolute:

PRICES
1. Never invent, estimate or "typical-price" anything. A price exists only if the owner SAID it (voice note or typed notes) or it is clearly WRITTEN in the photo (price tag, sign, label, chalkboard).
2. price_source: "spoken" = from the voice note or typed notes · "tag_in_photo" = read from text visible in the photo · "missing" = neither. If both exist, use what the owner said.
3. price_evidence: copy the exact words you heard or read ("four fifty", "$4.50", "18"). Required whenever price_cents is not null; null when the price is missing.
4. Prices are US dollars written as integer cents: "18" → 1800, "4.50" or "four fifty" → 450, "three twenty five" → 325, "a dollar fifty" → 150. If a number is ambiguous or you can't tell which item it belongs to, use null and explain in unclear. A price in another currency (£, €, ฿, ¥ …) is not a dollar price: leave it missing and say so in unclear.
5. No price → price_cents null, price_source "missing", price_evidence null, and add an unclear note such as "price for the round loaf".

ALLERGENS AND DIET TAGS
6. Only tag what the owner said or what is written in the photo. Never infer from looks or from typical recipes: do NOT add "nut-free" because nothing looks nutty, do NOT add "contains-dairy" because croissants usually have butter.
7. A blanket statement ("no nuts in anything") applies to every item. An option is not a fact about an item: "sugar-free available" or "gluten-free on request" does not make any listed item sugar-free or gluten-free, so don't tag it.
8. Each tag has a source ("spoken" or "written_in_photo") and a short quote of the exact words.
9. Allowed tags: ${DIET_TAGS.join(", ")}. Use nothing else.

ITEMS
10. List everything the owner mentions plus every clearly visible distinct product in the photo. Merge a product that is both mentioned and seen into one item. Ignore props, packaging, the counter and decor. At most 30 items.
11. name: the owner's own words, in the owner's language, short and title-like ("Chocolate cake"). name_en: the English name (repeat the name if it's already English).
12. est_quantity: how many the owner said they have; otherwise count the units you can see in the photo; otherwise null.
13. description: one short, factual line from what was said or plainly visible ("Two-layer chocolate cake"), else null. No marketing words.
14. box_2d: where the item is in the photo as [ymin, xmin, ymax, xmax] scaled 0–1000. If the item itself isn't visible but it is listed on a sign, menu board or price card, box only that item's own line on the sign (its name and price), so every item gets its own box; never one box for the whole sign. Null if neither is visible.

SHOP
15. heard: a verbatim transcript of the voice note, in the language spoken (null when there is no voice note). Write it before anything else and base the menu on it.
16. shop_name: only if the owner said it or it's written on a sign; else null.
17. language: BCP-47 code of what the owner spoke or wrote ("en", "vi", "es", …).
18. unclear: short notes (under 80 characters, no full sentences needed) for anything you couldn't tell: missing prices, unreadable tags, items heard but not seen.`;

export interface OnboardPromptContext {
  hasAudio: boolean;
  notes: string | null;
  languageHint: string | null;
}

/** The text part that goes after the photo (and audio) in the user turn. */
export function onboardUserPrompt(ctx: OnboardPromptContext): string {
  const lines: string[] = [];
  lines.push(
    ctx.hasAudio
      ? "Above: the counter photo, then the owner's voice note."
      : "Above: the counter photo. There is no voice note (heard must be null).",
  );
  if (ctx.notes) {
    lines.push("The owner typed these notes (treat them like spoken words, price_source \"spoken\"):");
    lines.push(`<<<\n${ctx.notes}\n>>>`);
  } else if (!ctx.hasAudio) {
    lines.push("The owner said nothing, so every price must come from text visible in the photo or be missing.");
  }
  if (ctx.languageHint) lines.push(`The owner's language is probably "${ctx.languageHint}".`);
  lines.push("Build the menu JSON now.");
  return lines.join("\n");
}

/** Nullable the way the Gemini docs show it: a type array, e.g. {"type": ["string", "null"]}. */
const nullable = <S extends { type: string }>(schema: S) => ({ ...schema, type: [schema.type, "null"] });

/**
 * JSON Schema for Gemini's `responseJsonSchema`. Property order matters (the
 * model writes in this order): transcript first, evidence before numbers.
 * No numeric or length bounds (minimum/maximum/minItems/maxItems): gemini-3.8-flash
 * rejects the request with 400 INVALID_ARGUMENT when they're present (checked
 * 2026-10-17). `validateDraft` enforces every range after the call instead.
 */
export const ONBOARD_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    heard: nullable({ type: "string", description: "Verbatim transcript of the voice note, or null." }),
    shop_name: nullable({ type: "string" }),
    language: { type: "string", description: "BCP-47 code, e.g. en, vi, es" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          name_en: nullable({ type: "string" }),
          price_evidence: nullable({ type: "string", description: "Exact words heard or text read for the price." }),
          price_source: { type: "string", enum: ["spoken", "tag_in_photo", "missing"] },
          price_cents: nullable({ type: "integer" }),
          est_quantity: nullable({ type: "integer" }),
          description: nullable({ type: "string" }),
          tags: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tag: { type: "string", enum: [...DIET_TAGS] },
                source: { type: "string", enum: ["spoken", "written_in_photo"] },
                quote: { type: "string" },
              },
              required: ["tag", "source", "quote"],
            },
          },
          box_2d: nullable({
            type: "array",
            items: { type: "integer" },
            description: "[ymin, xmin, ymax, xmax], each 0-1000",
          }),
        },
        required: [
          "name",
          "name_en",
          "price_evidence",
          "price_source",
          "price_cents",
          "est_quantity",
          "description",
          "tags",
          "box_2d",
        ],
      },
    },
    unclear: { type: "array", items: { type: "string" } },
  },
  required: ["heard", "shop_name", "language", "items", "unclear"],
} as const;
