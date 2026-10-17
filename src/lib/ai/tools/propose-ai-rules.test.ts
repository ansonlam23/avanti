import { describe, expect, it } from "vitest";
import { demoStreet, NOW } from "./fixtures";
import { menuResult } from "./menu";
import { proposeOrder } from "./propose";

// The owner's AI rules (src/lib/orders/ai-rules.ts) as the shopper AI sees them.
describe("propose_order · owner rules for AI orders", () => {
  it("refuses an item the owner sells in person only", () => {
    const { mai } = demoStreet();
    const cake = mai.items[0];
    const shop = { ...mai, rules: { ...mai.rules, ai_blocked_items: [cake.id] } };
    const r = proposeOrder(shop, { item_id: cake.id, qty: 1, pickup_time: "17:30" }, NOW);
    expect(r).toMatchObject({ ok: false, error: "not_for_ai" });
  });

  it("refuses an order over the shop's AI spending cap, and allows one at the cap", () => {
    const { mai } = demoStreet();
    const cake = mai.items[0]; // $18.00
    const capped = { ...mai, rules: { ...mai.rules, ai_max_order_cents: 1800 } };
    expect(proposeOrder(capped, { item_id: cake.id, qty: 2, pickup_time: "17:30" }, NOW)).toMatchObject({
      ok: false,
      error: "over_ai_limit",
    });
    expect(proposeOrder(capped, { item_id: cake.id, qty: 1, pickup_time: "17:30" }, NOW)).toMatchObject({ ok: true });
  });

  it("shows the rules in the menu the AI reads", () => {
    const { mai } = demoStreet();
    const cake = mai.items[0];
    const shop = { ...mai, rules: { ...mai.rules, ai_blocked_items: [cake.id], ai_max_order_cents: 4000 } };
    const menu = menuResult(shop, NOW);
    expect(menu.shop.ai_order_limit_cents).toBe(4000);
    expect(menu.items.find((i) => i.id === cake.id)?.ai_orderable).toBe(false);
    expect(menu.items.find((i) => i.id !== cake.id)?.ai_orderable).toBe(true);
  });
});
