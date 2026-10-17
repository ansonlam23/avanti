import "server-only";
import { isToolName, type ToolFailure, type ToolResult } from "@/lib/ai/shopper-types";
import { askShopResult } from "./ask-shop";
import { loadPublicOrder, loadSearchableShops, loadShop } from "./catalog";
import { parseToolArgs } from "./declarations";
import { menuResult } from "./menu";
import { proposeOrder } from "./propose";
import { searchCatalog } from "./search";

export { TOOL_DECLARATIONS } from "./declarations";

// Execute one shopper tool on the server. Every tool is read-only; results are
// small JSON. Failures come back as { ok: false, error, message } so the model
// can explain them honestly instead of the whole turn failing.

export interface ToolContext {
  now: Date;
  /** Slugs of this browser's own (private) shops, from getMyShops(). */
  myShops: string[];
}

function failure(error: string, message: string): ToolFailure {
  return { ok: false, error, message };
}

const noShop = (slug: string) => failure("not_found", `No shop called "${slug}". Use a slug from search_shops.`);

export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  if (!isToolName(name)) return failure("unknown_tool", `There is no tool called ${name}.`);
  const { now, myShops } = ctx;
  try {
    switch (name) {
      case "search_shops": {
        const p = parseToolArgs(name, rawArgs);
        if (!p.ok) return failure("bad_args", p.message);
        return searchCatalog(await loadSearchableShops(myShops), p.args, now, { myShops });
      }
      // The rest act on a shop the conversation already references (by slug):
      // reachable like its public link, never surfaced by search for strangers.
      case "get_menu": {
        const p = parseToolArgs(name, rawArgs);
        if (!p.ok) return failure("bad_args", p.message);
        const shop = await loadShop(p.args.shop_slug);
        return shop ? menuResult(shop, now) : noShop(p.args.shop_slug);
      }
      case "ask_shop": {
        const p = parseToolArgs(name, rawArgs);
        if (!p.ok) return failure("bad_args", p.message);
        const shop = await loadShop(p.args.shop_slug);
        return shop ? askShopResult(shop, p.args.question) : noShop(p.args.shop_slug);
      }
      case "propose_order": {
        const p = parseToolArgs(name, rawArgs);
        if (!p.ok) return failure("bad_args", p.message);
        const shop = await loadShop(p.args.shop_slug);
        return shop ? proposeOrder(shop, p.args, now) : noShop(p.args.shop_slug);
      }
      case "check_order": {
        const p = parseToolArgs(name, rawArgs);
        if (!p.ok) return failure("bad_args", p.message);
        const order = await loadPublicOrder(p.args.order_id);
        return order ? { ok: true, order } : failure("not_found", "No order with that id.");
      }
    }
  } catch (err) {
    console.error(`[shopper] tool ${name} failed:`, err);
    return failure("unavailable", "The shop directory didn't answer. Try again in a moment.");
  }
}
