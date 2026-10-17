// Status sentences instead of spinners (DESIGN.md §6.7). Pure.
import type { ToolName } from "@/lib/ai/shopper-types";

export const THINKING = "Thinking…";
export const CHECKING_STOCK = "Checking what's still available…";

export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** What the AI is doing right now, given the tool it just asked for. */
export function statusFor(name: ToolName, args: Record<string, unknown>, shopNames: Record<string, string>): string {
  const slug = typeof args.shop_slug === "string" ? args.shop_slug : "";
  const shop = shopNames[slug];
  switch (name) {
    case "search_shops":
      return "Looking at shops near campus…";
    case "get_menu":
      return shop ? `Reading ${possessive(shop)} menu…` : "Reading the menu…";
    case "ask_shop":
      return `Checking what ${shop ?? "the shop"} says…`;
    case "propose_order":
      return "Writing up your order…";
    case "check_order":
      return "Checking your order…";
  }
}
