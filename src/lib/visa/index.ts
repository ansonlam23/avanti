// Payments entry point for app code (server only: it reads env).
// Scripts and tests import the pure modules directly instead.
import { env, hasVisaKeys, paymentMode } from "@/lib/env";
import type { PaymentMode } from "@/lib/types";
import { createCybersourceAdapter } from "./cybersource";
import { createSimulatedAdapter } from "./simulated";
import type { PaymentResult, PaymentsAdapter } from "./types";

export * from "./types";
export { createSimulatedAdapter, SIMULATED_LATENCY_MS } from "./simulated";
export { createCybersourceAdapter, type CybersourceConfig } from "./cybersource";
export { formatAmount, SIM_ID_PREFIX } from "./validate";

/** An adapter whose every call fails with `not_configured` (never falls back to simulated). */
function unavailableAdapter(mode: PaymentMode, message: string): PaymentsAdapter {
  const fail = async (): Promise<PaymentResult> => ({ ok: false, mode, code: "not_configured", message, retryable: false });
  return { mode, hold: fail, charge: fail, release: fail };
}

/**
 * - `getPayments()` → the adapter for new orders: sandbox iff `paymentMode()`
 *   is "sandbox" (PAYMENTS_MODE=sandbox + all VISA_* keys), else simulated.
 * - `getPayments(order.payment_mode)` → the adapter that made that hold. Use it
 *   for charge/release so a sandbox hold is never "settled" by the simulator
 *   (and vice versa) if the env changes between hold and pickup.
 */
export function getPayments(mode: PaymentMode = paymentMode()): PaymentsAdapter {
  if (mode === "simulated") return createSimulatedAdapter();
  if (!hasVisaKeys()) {
    return unavailableAdapter("sandbox", "Visa sandbox keys are not configured on this server");
  }
  return createCybersourceAdapter({
    merchantId: env.visaMerchantId(),
    keyId: env.visaKeyId(),
    sharedSecret: env.visaSharedSecret(),
    host: env.visaHost(),
  });
}
