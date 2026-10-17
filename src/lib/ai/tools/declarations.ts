// The shopper tools for both providers + argument sanitizing. Pure.
// One source of truth: TOOL_DECLARATIONS (Gemini function declarations with a
// JSON Schema); CLAUDE_TOOLS is generated from it, never written twice.
// All tools are READ-ONLY. There is deliberately no tool that places an order.
import type { Tool as ClaudeTool } from "@anthropic-ai/sdk/resources/messages";
import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import type { ToolName } from "@/lib/ai/shopper-types";

const TIME_HELP =
  'Local time in America/Los_Angeles: 24h "HH:MM" (e.g. "18:00" means the next 6 PM), or ISO 8601 for another day.';

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "search_shops",
    description:
      "Find OPEN small shops near the shopper (UW campus, Seattle) that sell what they want. Returns each shop with its matching items (id, live price, stock, tags, availability), walking minutes, pickup window and whether it is a demo shop. Call this first.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'The kind of item, in a few words, e.g. "chocolate cake", "croissant", "coffee". Leave dietary needs out; check them with the tags or ask_shop.',
        },
        needed_by: { type: "string", description: `Optional deadline. ${TIME_HELP}` },
      },
      required: ["query"],
    },
  },
  {
    name: "get_menu",
    description: "Get one shop's live menu: every item with id, price, stock, tags and whether it is available right now.",
    parametersJsonSchema: {
      type: "object",
      properties: { shop_slug: { type: "string", description: "The shop's slug from search_shops." } },
      required: ["shop_slug"],
    },
  },
  {
    name: "ask_shop",
    description:
      "Look up what a shop itself says about a question (ingredients, allergens, diet, rules, pickup). Returns only that shop's own data. Use it before answering any allergen or ingredient question.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        shop_slug: { type: "string", description: "The shop's slug." },
        question: { type: "string", description: 'The shopper\'s question, e.g. "Does the chocolate cake have nuts?"' },
      },
      required: ["shop_slug", "question"],
    },
  },
  {
    name: "propose_order",
    description:
      "Prepare an order card for the shopper to review. It checks the item, quantity, stock and pickup time against the shop's menu and rules, and prices it from the database. It does NOT place or pay for anything: the shopper must tap Confirm & hold on the card.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        shop_slug: { type: "string", description: "The shop's slug." },
        item_id: { type: "string", description: "The item's id from search_shops or get_menu." },
        qty: { type: "integer", description: "How many (default 1). Must be ≤ the shop's max_per_order." },
        pickup_time: {
          type: "string",
          description: `Pickup time inside the shop's pickup window. ${TIME_HELP} Use "asap" for the earliest slot.`,
        },
      },
      required: ["shop_slug", "item_id", "qty", "pickup_time"],
    },
  },
  {
    name: "check_order",
    description: "Look up an order's live status (held, paid, released, failed) by its id.",
    parametersJsonSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "The order id." } },
      required: ["order_id"],
    },
  },
];

/** Gemini declarations → Claude tools: the same name, description and JSON Schema (as `input_schema`). */
export function toClaudeTools(declarations: FunctionDeclaration[]): ClaudeTool[] {
  return declarations.map((d) => {
    const schema = d.parametersJsonSchema as ClaudeTool.InputSchema | undefined;
    if (!d.name || !schema || typeof schema !== "object" || schema.type !== "object") {
      throw new Error(`Tool ${d.name ?? "(unnamed)"} needs an object JSON Schema`);
    }
    return { name: d.name, ...(d.description ? { description: d.description } : {}), input_schema: schema };
  });
}

/**
 * The tools Claude sees. Tools come first in every Claude request and never
 * change, so the last one carries a prompt-cache breakpoint.
 */
export const CLAUDE_TOOLS: ClaudeTool[] = toClaudeTools(TOOL_DECLARATIONS).map((tool, i, all) =>
  i === all.length - 1 ? { ...tool, cache_control: { type: "ephemeral" } } : tool,
);

const text = (max: number) => z.string().trim().min(1).max(max);
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const TOOL_ARGS = {
  search_shops: z.object({ query: text(120), needed_by: optionalText(40) }),
  get_menu: z.object({ shop_slug: slug }),
  ask_shop: z.object({ shop_slug: slug, question: text(300) }),
  propose_order: z.object({
    shop_slug: slug,
    item_id: z.string().trim().max(64),
    qty: z.coerce.number().int().min(1).max(20).default(1),
    pickup_time: optionalText(40),
  }),
  check_order: z.object({ order_id: z.string().trim().max(64) }),
} satisfies Record<ToolName, z.ZodType>;

export type ToolArgs = { [K in ToolName]: z.output<(typeof TOOL_ARGS)[K]> };

export type ParsedArgs<K extends ToolName> = { ok: true; args: ToolArgs[K] } | { ok: false; message: string };

export function parseToolArgs<K extends ToolName>(name: K, raw: unknown): ParsedArgs<K> {
  const parsed = TOOL_ARGS[name].safeParse(raw ?? {});
  if (parsed.success) return { ok: true, args: parsed.data as ToolArgs[K] };
  const issue = parsed.error.issues[0];
  return { ok: false, message: `Invalid ${issue?.path.join(".") || "arguments"}: ${issue?.message ?? "bad input"}` };
}
