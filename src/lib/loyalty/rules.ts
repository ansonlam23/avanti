// The owner's loyalty rule (CONTRACTS §17). Pure, unit-tested.
// Stored inside shops.rules (jsonb) as `loyalty: { every, reward }`, so no
// schema change: "every 5th pickup: a free cookie". Absent or null = no program.
import type { LoyaltyRule } from "@/lib/types";

export const LOYALTY_EVERY_MIN = 2;
export const LOYALTY_EVERY_MAX = 20;
export const LOYALTY_REWARD_MAX = 40;
/** What the counter's setting starts at when the owner turns it on. */
export const LOYALTY_DEFAULT_EVERY = 5;

/** The reward as shown everywhere: whitespace collapsed and trimmed. */
export function cleanReward(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The shop's loyalty rule, or null when it has none (or a stored value outside the contract). */
export function loyaltyOf(rules: { loyalty?: unknown } | null | undefined): LoyaltyRule | null {
  const raw = rules?.loyalty;
  if (!raw || typeof raw !== "object") return null;
  const { every, reward } = raw as { every?: unknown; reward?: unknown };
  if (typeof every !== "number" || !Number.isInteger(every)) return null;
  if (every < LOYALTY_EVERY_MIN || every > LOYALTY_EVERY_MAX) return null;
  const text = typeof reward === "string" ? cleanReward(reward) : "";
  if (!text || text.length > LOYALTY_REWARD_MAX) return null;
  return { every, reward: text };
}

export type LoyaltyInput =
  | { ok: true; rule: LoyaltyRule }
  | { ok: false; field: "every" | "reward"; message: string };

/** The owner's typed "Every [5] pickups → [free cookie]", checked before it's saved. */
export function parseLoyaltyInput(every: string, reward: string): LoyaltyInput {
  const n = /^\s*\d{1,3}\s*$/.test(every) ? Number(every) : NaN;
  if (!Number.isInteger(n) || n < LOYALTY_EVERY_MIN || n > LOYALTY_EVERY_MAX) {
    return { ok: false, field: "every", message: `Every ${LOYALTY_EVERY_MIN} to ${LOYALTY_EVERY_MAX} pickups.` };
  }
  const text = cleanReward(reward);
  if (!text) return { ok: false, field: "reward", message: "Name the reward." };
  if (text.length > LOYALTY_REWARD_MAX) {
    return { ok: false, field: "reward", message: `Keep the reward under ${LOYALTY_REWARD_MAX} letters.` };
  }
  return { ok: true, rule: { every: n, reward: text } };
}

export function sameRule(a: LoyaltyRule | null, b: LoyaltyRule | null): boolean {
  return a === b || (a !== null && b !== null && a.every === b.every && a.reward === b.reward);
}
