// Prompt + response schema for "change anything" in /open: the owner's menu so
// far (from the photo, or empty if they skipped it) plus what they just said or
// typed → only the changes they asked for. One Gemini call per change.

import { DIET_TAGS } from "./onboard";

export const REVISE_SYSTEM_PROMPT = `You help a small-shop owner fix their menu on avanti. You get the menu so far as JSON (each item has an id; it may be empty) and the owner's new words: a voice note or a typed message. Return ONLY the changes the owner asked for, as JSON.

People will pay these prices and people with allergies will trust these tags, so these rules are absolute:

CHANGES
1. op "update": the owner talks about an item already on the menu (match by meaning, any language: "the lemon ones" = "Lemon bars"). Set id to that item's id. Fill only what they changed; leave every other field null (name null = keep the name).
2. op "add": a new item that isn't on the menu yet. id null. Never add an item that is already on the menu: update it instead.
3. op "remove": the owner says they don't sell it, it's gone, or to take it off. id only.
4. Change nothing the owner didn't mention. No change at all → changes [].

PRICES
5. A price exists only if the owner SAID or TYPED it in this message. Never invent, estimate or use a typical price.
6. price_action: "set" = the owner gave a price · "clear" = they said they don't know it yet or to drop it · "keep" = they didn't talk about the price. A new item with no price is "keep".
7. price_evidence: the exact words for the price ("four seventy five", "4.75", "2 for 5"), required with "set", else null.
8. Prices are US dollars as integer cents: "4.75" or "four seventy five" → 475, "three" → 300, "a dollar fifty" → 150. If a number is ambiguous, or you can't tell which item it belongs to, leave it out and say so in unclear. Another currency (£, €, ¥ …) is not a dollar price: say so in unclear.

ALLERGENS AND DIET TAGS
9. tags_add: only what the owner said in this message, each with a short exact quote. Never infer from recipes ("croissants have butter") or looks. A blanket statement ("nothing has nuts") applies to every item: update each one.
10. tags_remove: tags the owner says are wrong.
11. Allowed tags: ${DIET_TAGS.join(", ")}. Use nothing else.

ITEMS
12. name: the owner's own words in the language they spoke, short and title-like. name_en: the English name (repeat it if it's already English). For an update, set name only when the owner renames the item or names it in their own language (then set name_en too).
13. est_quantity: how many the owner says they have, else null.
14. description: one short factual line only if the owner described the item, else null.

SHOP
15. heard: a verbatim transcript of the voice note in the language spoken (null for typed messages). Write it first and base every change on it.
16. shop_name: only if the owner says the shop's name in this message, else null.
17. language: BCP-47 code of what the owner spoke or typed ("en", "vi", "es", …).
18. unclear: short notes (under 80 characters) for anything you couldn't tell.`;

export interface RevisePromptItem {
  id: string;
  name: string;
  name_en: string | null;
  price_cents: number | null;
  tags: string[];
  est_quantity: number | null;
}

export interface RevisePromptContext {
  hasAudio: boolean;
  notes: string | null;
  menu: RevisePromptItem[];
  shopName: string | null;
  languageHint: string | null;
}

/** The text part of the user turn (after the voice note, when there is one). */
export function reviseUserPrompt(ctx: RevisePromptContext): string {
  const lines: string[] = [];
  lines.push(
    ctx.menu.length
      ? `The menu so far${ctx.shopName ? ` for ${ctx.shopName}` : ""} (prices in cents; null = no price yet):`
      : "The menu is empty so far: the owner is telling you what they sell.",
  );
  if (ctx.menu.length) lines.push(JSON.stringify(ctx.menu));
  if (ctx.hasAudio) {
    lines.push("Above: the owner's voice note with their changes.");
  } else {
    lines.push("The owner typed (treat it like spoken words; heard must be null):");
    lines.push(`<<<\n${ctx.notes ?? ""}\n>>>`);
  }
  if (ctx.languageHint) lines.push(`The owner's language is probably "${ctx.languageHint}".`);
  lines.push("Return the changes JSON now.");
  return lines.join("\n");
}

/** Nullable the way the Gemini docs show it: a type array. */
const nullable = <S extends { type: string }>(schema: S) => ({ ...schema, type: [schema.type, "null"] });

/**
 * JSON Schema for Gemini's `responseJsonSchema`. One flat change shape for all
 * three ops (simpler for the model than a union). Transcript first, evidence
 * before numbers. No numeric/length bounds: gemini-3.8-flash rejects them (see
 * ONBOARD_RESPONSE_SCHEMA); `validateRevision` enforces every range instead.
 */
export const REVISE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    heard: nullable({ type: "string", description: "Verbatim transcript of the voice note, or null." }),
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "update", "remove"] },
          id: nullable({ type: "string", description: "Existing item id (update/remove); null for add." }),
          name: nullable({ type: "string" }),
          name_en: nullable({ type: "string" }),
          price_action: { type: "string", enum: ["keep", "set", "clear"] },
          price_evidence: nullable({ type: "string", description: "Exact words for the price." }),
          price_cents: nullable({ type: "integer" }),
          est_quantity: nullable({ type: "integer" }),
          description: nullable({ type: "string" }),
          tags_add: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tag: { type: "string", enum: [...DIET_TAGS] },
                quote: { type: "string" },
              },
              required: ["tag", "quote"],
            },
          },
          tags_remove: { type: "array", items: { type: "string", enum: [...DIET_TAGS] } },
        },
        required: [
          "op",
          "id",
          "name",
          "name_en",
          "price_action",
          "price_evidence",
          "price_cents",
          "est_quantity",
          "description",
          "tags_add",
          "tags_remove",
        ],
      },
    },
    shop_name: nullable({ type: "string" }),
    language: { type: "string", description: "BCP-47 code, e.g. en, vi, es" },
    unclear: { type: "array", items: { type: "string" } },
  },
  required: ["heard", "changes", "shop_name", "language", "unclear"],
} as const;
