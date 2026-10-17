import { describe, expect, it } from "vitest";
import { SIMULATED_LATENCY_MS, createSimulatedAdapter } from "./simulated";
import { DEMO_TEST_CARD } from "./types";

const ORDER_ID = "6f1c0d6e-3a52-4b7e-9d3f-0e7b8a1c2d3e";
const fast = () => createSimulatedAdapter({ latencyMs: 0 });

describe("simulated adapter", () => {
  it("runs the full lifecycle and always says mode: simulated", async () => {
    const pay = fast();
    expect(pay.mode).toBe("simulated");

    const held = await pay.hold({ orderId: ORDER_ID, amountCents: 1800, currency: "USD", card: DEMO_TEST_CARD });
    expect(held).toMatchObject({ ok: true, mode: "simulated", status: "AUTHORIZED", cardLast4: "1111" });
    if (!held.ok) throw new Error("hold failed");
    expect(held.id).toMatch(/^SIM-[0-9A-F]{16}$/);
    expect(JSON.stringify(held)).not.toContain(DEMO_TEST_CARD.number);

    const paid = await pay.charge({ orderId: ORDER_ID, authId: held.id, amountCents: 1800, heldAmountCents: 1800, currency: "USD" });
    expect(paid).toMatchObject({ ok: true, mode: "simulated", status: "CAPTURED" });
    expect(paid.ok && paid.id).toMatch(/^SIM-/);
    expect(paid.ok && paid.id).not.toBe(held.id);

    const held2 = await pay.hold({ orderId: "order-2", amountCents: 600, currency: "USD", card: DEMO_TEST_CARD });
    if (!held2.ok) throw new Error("hold failed");
    const released = await pay.release({ orderId: "order-2", authId: held2.id, amountCents: 600, currency: "USD", reason: "no_show" });
    expect(released).toMatchObject({ ok: true, mode: "simulated", status: "REVERSED" });
  });

  it("is stateless: a fresh instance can charge/release a SIM- id it never saw", async () => {
    // On Vercel each request may land on a new instance; the DB owns the lifecycle.
    const authId = "SIM-0123456789ABCDEF";
    expect(await fast().charge({ orderId: ORDER_ID, authId, amountCents: 1800, currency: "USD" })).toMatchObject({
      ok: true,
      status: "CAPTURED",
    });
    expect(
      await fast().release({ orderId: ORDER_ID, authId, amountCents: 1800, currency: "USD", reason: "cancelled" }),
    ).toMatchObject({ ok: true, status: "REVERSED" });
  });

  it("rejects a capture above the held amount", async () => {
    const r = await fast().charge({ orderId: ORDER_ID, authId: "SIM-AB", amountCents: 1900, heldAmountCents: 1800, currency: "USD" });
    expect(r).toMatchObject({ ok: false, mode: "simulated", code: "exceeds_hold", retryable: false });
  });

  it("validates amounts, ids and cards like the sandbox adapter", async () => {
    const pay = fast();
    const base = { orderId: ORDER_ID, currency: "USD" as const };
    expect(await pay.hold({ ...base, amountCents: 0, card: DEMO_TEST_CARD })).toMatchObject({ code: "invalid_input" });
    expect(await pay.hold({ ...base, amountCents: 12.5, card: DEMO_TEST_CARD })).toMatchObject({ code: "invalid_input" });
    expect(
      await pay.hold({ ...base, amountCents: 100, card: { ...DEMO_TEST_CARD, number: "4111111111111112" } }),
    ).toMatchObject({ code: "invalid_input" });
    // A sandbox (numeric) auth id is not ours: never "settle" a real hold in the simulator.
    expect(await pay.charge({ ...base, authId: "7609478419816525104807", amountCents: 100 })).toMatchObject({
      code: "mode_mismatch",
    });
    expect(await pay.release({ ...base, authId: "SIM-../x", amountCents: 100, reason: "no_show" })).toMatchObject({
      code: "invalid_input",
    });
    expect(await pay.release({ ...base, authId: "SIM-AB", amountCents: -1, reason: "no_show" })).toMatchObject({
      code: "invalid_input",
    });
  });

  it("waits about 600 ms by default and honours latencyMs", async () => {
    expect(SIMULATED_LATENCY_MS).toBe(600);
    const t0 = performance.now();
    await createSimulatedAdapter({ latencyMs: 40 }).hold({ orderId: ORDER_ID, amountCents: 100, currency: "USD", card: DEMO_TEST_CARD });
    expect(performance.now() - t0).toBeGreaterThanOrEqual(35);
  });
});
