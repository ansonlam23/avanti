import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolFailure, ToolResult } from "@/lib/ai/shopper-types";
import { runTool, type ToolContext } from "@/lib/ai/tools";
import type { PaymentMode } from "@/lib/types";
import { isListedShop as dbIsListedShop } from "./catalog";
import { askResult, menuToolResult, orderResult, searchResult } from "./results";

// avanti's MCP server (CONTRACTS §15): any MCP client can find the public
// shops, read a live menu, ask a shop, and start an order. It runs the same
// shopper tools as /ask (src/lib/ai/tools: runTool), so prices, stock, the
// owner's AI rules and pickup windows are checked exactly the same way.
// Nothing here places or pays for an order: start_order returns a link to
// /ask, where the person confirms (signed order → Visa hold).

export const MCP_SERVER_NAME = "avanti";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_TOOL_NAMES = ["search_shops", "get_menu", "ask_shop", "start_order"] as const;

export const MCP_INSTRUCTIONS =
  "avanti: small local shops near the University of Washington campus in Seattle, open to AI shoppers. " +
  "Prices and stock are live from each shop's own menu; quote only prices from tool results. " +
  "Flow: search_shops, then get_menu or ask_shop, then start_order. " +
  "Answer allergen and ingredient questions only from ask_shop (the shop's own words); if the shop didn't say, say so. " +
  "start_order never places or pays for anything: it returns an order_link. The person opens it and confirms inside avanti, " +
  "where a signed, verified order places a Visa hold that is charged only at pickup. Shops marked demo are demos.";

const TIME_HELP =
  'Seattle local time: 24 h "HH:MM" (e.g. "17:30" means the next 5:30 PM) or ISO 8601 for another day.';

const slugArg = z.string().describe('The shop\'s slug from search_shops, e.g. "mais-bakery".');

export interface AvantiMcpOptions {
  /** Absolute origin for order links, e.g. "https://open-sign-three.vercel.app". */
  origin: string;
  /** How avanti's payments run right now (shown next to every order link). */
  paymentMode: PaymentMode;
  /** Clock (tests pin it). */
  now?: () => Date;
  /** Is this slug a public (listed) shop? Defaults to the database. */
  isListedShop?: (slug: string) => Promise<boolean>;
}

const UNAVAILABLE: ToolFailure = {
  ok: false,
  error: "unavailable",
  message: "The shop directory didn't answer. Try again in a moment.",
};

export function createAvantiMcpServer(opts: AvantiMcpOptions): McpServer {
  const now = opts.now ?? (() => new Date());
  const isListed = opts.isListedShop ?? dbIsListedShop;
  // Strangers' view: search shows listed shops only (no "my shops" here).
  const ctx = (): ToolContext => ({ now: now(), myShops: [], source: "mcp" });

  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      title: "avanti",
      version: MCP_SERVER_VERSION,
      description: "Small local shops near the UW campus, open to AI shoppers. Orders are confirmed in avanti with a Visa hold.",
      websiteUrl: opts.origin,
    },
    { instructions: MCP_INSTRUCTIONS, maxToolInputElements: 50 },
  );

  /** get_menu / ask_shop / start_order act on one shop by slug: public (listed) shops only, like search. */
  async function onPublicShop(slug: string, run: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      const [listed, result] = await Promise.all([isListed(slug.trim().toLowerCase()), run()]);
      if (listed) return result;
      return { ok: false, error: "not_found", message: `No public shop called "${slug}". Use a slug from search_shops.` };
    } catch (err) {
      console.error("[mcp] public shop check failed:", err);
      return UNAVAILABLE;
    }
  }

  async function logged(tool: string, run: () => Promise<CallToolResult>): Promise<CallToolResult> {
    const started = Date.now();
    const result = await run();
    console.info(`[mcp] tool=${tool} ok=${!result.isError} ms=${Date.now() - started}`);
    return result;
  }

  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

  server.registerTool(
    "search_shops",
    {
      title: "Search shops",
      description:
        "Find open small shops near the UW campus (Seattle) that sell what the person wants. Returns each shop with its matching items " +
        "(item id, live price in cents, stock, tags, availability, whether AI may order it), walking minutes from campus, pickup window, " +
        "the owner's AI order limit and whether it is a demo shop. Call this first.",
      inputSchema: {
        query: z
          .string()
          .describe(
            'What they want, in a few words, e.g. "birthday cake", "croissant", "flowers". Diet needs don\'t filter results; check tags or ask_shop.',
          ),
        needed_by: z.string().optional().describe(`Optional deadline. ${TIME_HELP}`),
      },
      annotations: readOnly,
    },
    ({ query, needed_by }) =>
      logged("search_shops", async () => searchResult(await runTool("search_shops", { query, needed_by }, ctx()))),
  );

  server.registerTool(
    "get_menu",
    {
      title: "Get a shop's menu",
      description:
        "Get one shop's live menu: every item with id, price in cents, stock, tags, availability and whether AI may order it, plus the shop's pickup window, rules and notes.",
      inputSchema: { shop_slug: slugArg },
      annotations: readOnly,
    },
    ({ shop_slug }) =>
      logged("get_menu", async () =>
        menuToolResult(await onPublicShop(shop_slug, () => runTool("get_menu", { shop_slug }, ctx()))),
      ),
  );

  server.registerTool(
    "ask_shop",
    {
      title: "Ask a shop",
      description:
        "Look up what a shop itself says about a question (ingredients, allergens, diet, rules, pickup). Returns only the shop's own words: item tags and descriptions and the shop's notes. " +
        "Use it before answering any allergen or ingredient question. If it doesn't answer the question, say the shop didn't say; never guess.",
      inputSchema: {
        shop_slug: slugArg,
        question: z.string().describe('The person\'s question, e.g. "Does the chocolate cake have nuts?"'),
      },
      annotations: readOnly,
    },
    ({ shop_slug, question }) =>
      logged("ask_shop", async () =>
        askResult(await onPublicShop(shop_slug, () => runTool("ask_shop", { shop_slug, question }, ctx()))),
      ),
  );

  server.registerTool(
    "start_order",
    {
      title: "Start an order",
      description:
        "Start an order for pickup. Checks the item, quantity, stock, pickup time and the owner's rules for AI orders, and prices it from the shop's database. " +
        "It does NOT place or pay for anything: it returns a short summary and an order_link. Give the person the link; they open it and confirm in avanti, " +
        "where a signed, verified order places a Visa hold that is charged only at pickup. If the shop refuses (sold out, sold in person only, over the owner's AI limit), it says why.",
      inputSchema: {
        shop_slug: slugArg,
        item_id: z.string().describe("The item's id from search_shops or get_menu."),
        qty: z.number().int().min(1).max(20).describe("How many: at least 1, at most the shop's max_per_order."),
        pickup_time: z
          .string()
          .optional()
          .describe(`Optional pickup time inside the shop's pickup window. ${TIME_HELP} Leave it out for the earliest pickup.`),
      },
      annotations: readOnly,
    },
    ({ shop_slug, item_id, qty, pickup_time }) =>
      logged("start_order", async () => {
        const result = await onPublicShop(shop_slug, () =>
          runTool("propose_order", { shop_slug, item_id, qty, pickup_time: pickup_time ?? null }, ctx()),
        );
        return orderResult(result, { origin: opts.origin, paymentMode: opts.paymentMode, requestedPickup: pickup_time });
      }),
  );

  return server;
}
