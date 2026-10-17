import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPayments } from "./index";

const VISA_ENV = ["PAYMENTS_MODE", "VISA_MERCHANT_ID", "VISA_KEY_ID", "VISA_SHARED_SECRET", "VISA_HOST"];

function setVisaEnv(values: Record<string, string>) {
  for (const k of VISA_ENV) vi.stubEnv(k, values[k] ?? "");
}

afterEach(() => vi.unstubAllEnvs());

const keys = {
  VISA_MERCHANT_ID: "open_sign_test",
  VISA_KEY_ID: "11111111-2222-3333-4444-555555555555",
  VISA_SHARED_SECRET: randomBytes(32).toString("base64"), // runtime only
};

describe("getPayments", () => {
  it("defaults to simulated", () => {
    setVisaEnv({});
    expect(getPayments().mode).toBe("simulated");
  });

  it("stays simulated when PAYMENTS_MODE=sandbox but keys are missing", () => {
    setVisaEnv({ PAYMENTS_MODE: "sandbox" });
    expect(getPayments().mode).toBe("simulated");
  });

  it("uses the Visa sandbox when enabled and keyed", () => {
    setVisaEnv({ PAYMENTS_MODE: "sandbox", ...keys });
    expect(getPayments().mode).toBe("sandbox");
  });

  it("follows an order's recorded mode, and never fakes a sandbox call", async () => {
    setVisaEnv({ PAYMENTS_MODE: "simulated", ...keys });
    expect(getPayments("sandbox").mode).toBe("sandbox"); // a sandbox hold is settled in the sandbox
    expect(getPayments("simulated").mode).toBe("simulated");

    setVisaEnv({});
    const pay = getPayments("sandbox");
    const r = await pay.charge({ orderId: "o1", authId: "7609478419816525104807", amountCents: 1800, currency: "USD" });
    expect(r).toMatchObject({ ok: false, mode: "sandbox", code: "not_configured", retryable: false });
  });
});
