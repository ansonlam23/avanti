import { describe, expect, it } from "vitest";
import { EVENT_PREFIX, shopperSystemPrompt } from "./shopper";

describe("shopperSystemPrompt", () => {
  const p = shopperSystemPrompt(new Date("2026-10-16T22:12:00Z"));

  it("tells the model the shop-local date and time (so 'by 6' means 18:00 today)", () => {
    expect(p).toContain("Friday, October 16, 2026, 3:12 PM (15:12, America/Los_Angeles)");
  });

  it("keeps the hard rules", () => {
    expect(p).toContain('avanti shopper');
    expect(p).toMatch(/only prices that appear in tool results/i);
    expect(p).toMatch(/cannot place, pay for or cancel orders/i);
    expect(p).toContain('tap "Confirm & hold"');
    expect(p).toContain(`"<Shop name> didn't say. Want me to ask?"`);
    expect(p).toMatch(/Never guess/);
    expect(p).toMatch(/demo shop/);
    expect(p).toMatch(/Never claim .*certified/);
    expect(p).toMatch(/Reply in the shopper's language/);
    expect(p).toContain(EVENT_PREFIX);
    expect(p).toContain("Heads up:");
  });

  it("guides errands: search each thing, one card per thing in one step, one short summary", () => {
    expect(p).toMatch(/call search_shops once per thing, all in one step/i);
    expect(p).toMatch(/shops close to each other/i);
    expect(p).toMatch(/call propose_order once per thing, all in the same step/i);
    expect(p).toMatch(/keeps within that shop's owner rules \(ai_orderable, ai_order_limit_cents, max_per_order\)/);
    expect(p).toMatch(/one short summary/i);
    expect(p).toContain('tap "Confirm all"');
  });
});
