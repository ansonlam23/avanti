// The shop owner's rules for AI orders (CONTRACTS §13). Pure, unit-tested.
// Stored inside shops.rules (jsonb), so no schema change:
//   ai_max_order_cents: the most one AI order may cost (null/absent = no cap)
//   ai_blocked_items:   item ids the owner keeps off-limits to AI ("order in person")
// Checked twice: by propose_order (so the AI explains and adapts) and at the
// shop's order endpoint after the signature check, before any Visa call.
import { formatCents } from "@/lib/format";
import type { ShopRules } from "@/lib/types";

export const AI_LIMIT_MIN_CENTS = 100; // $1
export const AI_LIMIT_MAX_CENTS = 100_000; // $1,000, same ceiling as a menu price

export type AiRuleCode = "not_for_ai" | "over_ai_limit";

export interface AiRefusal {
  code: AiRuleCode;
  message: string;
  limit_cents?: number;
}

type RulesLike = Partial<Pick<ShopRules, "ai_max_order_cents" | "ai_blocked_items">> | null | undefined;

/** The shop's AI spending cap per order, or null when it has none (or a nonsense value). */
export function aiOrderLimitCents(rules: RulesLike): number | null {
  const n = Number(rules?.ai_max_order_cents);
  if (rules?.ai_max_order_cents === null || rules?.ai_max_order_cents === undefined) return null;
  return Number.isInteger(n) && n >= AI_LIMIT_MIN_CENTS && n <= AI_LIMIT_MAX_CENTS ? n : null;
}

/** Whether the owner lets AI shoppers order this item. */
export function isAiOrderable(rules: RulesLike, itemId: string): boolean {
  const blocked = rules?.ai_blocked_items;
  return !(Array.isArray(blocked) && blocked.includes(itemId));
}

/** null = allowed; otherwise why the shop's rules refuse this AI order. */
export function checkAiRules(
  rules: RulesLike,
  shopName: string,
  item: { id: string; name: string },
  amountCents: number,
): AiRefusal | null {
  if (!isAiOrderable(rules, item.id)) {
    return {
      code: "not_for_ai",
      message: `${shopName} doesn't take AI orders for ${item.name}. Order it in person at the shop.`,
    };
  }
  const limit = aiOrderLimitCents(rules);
  if (limit !== null && amountCents > limit) {
    return {
      code: "over_ai_limit",
      message: `${shopName} takes AI orders up to ${formatCents(limit)}. This one is ${formatCents(amountCents)}.`,
      limit_cents: limit,
    };
  }
  return null;
}

/** The blocked list with one item switched on or off for AI (no duplicates, stable order). */
export function withAiOrderable(blocked: readonly string[] | null | undefined, itemId: string, orderable: boolean): string[] {
  const rest = (blocked ?? []).filter((id) => id !== itemId);
  return orderable ? rest : [...rest, itemId];
}
