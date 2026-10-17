import { describe, expect, it } from "vitest";
import { demoStreet, NOW } from "./fixtures";
import { proposeOrder } from "./propose";

describe("propose_order", () => {
  it("prices from the DB: price_cents × qty", () => {
    const { mai } = demoStreet();
    const cake = mai.items[0];
    const r = proposeOrder(mai, { item_id: cake.id, qty: 2, pickup_time: "17:30" }, NOW);
    expect(r).toMatchObject({
      ok: true,
      proposal: {
        shop_slug: "mais-bakery",
        item_name: "Chocolate cake",
        qty: 2,
        unit_price_cents: 1800,
        amount_cents: 3600,
        currency: "USD",
        pickup_time: "2026-10-17T00:30:00.000Z",
        pickup_label: "5:30 PM",
        walk_minutes: 10,
        is_demo: false,
      },
    });
    expect(r.ok && r.note).toMatch(/Confirm & hold/);
  });

  it("asap picks the earliest slot", () => {
    const { mai } = demoStreet();
    const r = proposeOrder(mai, { item_id: mai.items[0].id, qty: 1, pickup_time: "asap" }, NOW);
    expect(r.ok && r.proposal.pickup_label).toBe("3:25 PM");
  });

  it("refuses what the shop can't sell", () => {
    const { mai } = demoStreet();
    const [cake, croissant, loaf] = mai.items;
    expect(proposeOrder(mai, { item_id: "nope", qty: 1 }, NOW)).toMatchObject({ ok: false, error: "not_on_menu" });
    expect(proposeOrder(mai, { item_id: loaf.id, qty: 1 }, NOW)).toMatchObject({ ok: false, error: "no_price" });
    croissant.sold_out = true;
    expect(proposeOrder(mai, { item_id: croissant.id, qty: 1 }, NOW)).toMatchObject({ ok: false, error: "sold_out" });
    cake.stock = 0;
    expect(proposeOrder(mai, { item_id: cake.id, qty: 1 }, NOW)).toMatchObject({ ok: false, error: "sold_out" });
  });

  it("enforces the shop's rules", () => {
    const { mai } = demoStreet();
    const cake = mai.items[0];
    expect(proposeOrder(mai, { item_id: cake.id, qty: 3 }, NOW)).toMatchObject({ ok: false, error: "over_limit" });
    expect(proposeOrder(mai, { item_id: cake.id, qty: 0 }, NOW)).toMatchObject({ ok: false, error: "bad_qty" });
    expect(proposeOrder(mai, { item_id: cake.id, qty: 1.5 }, NOW)).toMatchObject({ ok: false, error: "bad_qty" });
    cake.stock = 1;
    expect(proposeOrder(mai, { item_id: cake.id, qty: 2 }, NOW)).toMatchObject({ ok: false, error: "not_enough_stock" });
    expect(proposeOrder({ ...mai, open: false }, { item_id: cake.id, qty: 1 }, NOW)).toMatchObject({ ok: false, error: "closed" });
    expect(
      proposeOrder({ ...mai, rules: { max_per_order: 2, accept_ai_orders: false } }, { item_id: cake.id, qty: 1 }, NOW),
    ).toMatchObject({ ok: false, error: "no_ai_orders" });
  });

  it("keeps pickup inside the window", () => {
    const { mai } = demoStreet();
    const r = proposeOrder(mai, { item_id: mai.items[0].id, qty: 1, pickup_time: "19:00" }, NOW);
    expect(r).toMatchObject({ ok: false, error: "outside_window", pickup_window: { start: "08:00", end: "18:00" } });
    expect(!r.ok && r.message).toMatch(/8 AM–6 PM/);
  });
});
