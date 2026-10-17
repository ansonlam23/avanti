// Simulated payments: used whenever the Visa sandbox is not configured.
// Always reports mode "simulated" (the UI must show <SimulatedBadge/>), never
// pretends to be Visa. Stateless on purpose: on Vercel every request may hit a
// fresh instance, so charge/release accept any well-formed SIM- id; the order
// service enforces the lifecycle from the database.
import { randomBytes } from "node:crypto";
import type { CaptureInput, HoldInput, PaymentResult, PaymentsAdapter, ReleaseInput } from "./types";
import { SIM_ID_PREFIX, cardLast4, checkCapture, checkHold, checkRelease, failure, formatAmount } from "./validate";

export const SIMULATED_LATENCY_MS = 600;

export interface SimulatedAdapterOptions {
  latencyMs?: number;
  now?: () => Date;
}

function simId(): string {
  return `${SIM_ID_PREFIX}${randomBytes(8).toString("hex").toUpperCase()}`;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function createSimulatedAdapter(opts: SimulatedAdapterOptions = {}): PaymentsAdapter {
  const latencyMs = Math.max(0, opts.latencyMs ?? SIMULATED_LATENCY_MS);
  const now = opts.now ?? (() => new Date());
  const mode = "simulated" as const;

  return {
    mode,

    async hold(input: HoldInput): Promise<PaymentResult> {
      const problem = checkHold(input, now());
      if (problem) return failure(mode, problem);
      await sleep(latencyMs);
      return {
        ok: true,
        mode,
        id: simId(),
        status: "AUTHORIZED",
        cardLast4: cardLast4(input.card),
        raw: {
          simulated: true,
          clientReferenceInformation: { code: input.orderId },
          orderInformation: { amountDetails: { authorizedAmount: formatAmount(input.amountCents), currency: "USD" } },
        },
      };
    },

    async charge(input: CaptureInput): Promise<PaymentResult> {
      const problem = checkCapture(input, mode);
      if (problem) return failure(mode, problem);
      await sleep(latencyMs);
      return {
        ok: true,
        mode,
        id: simId(),
        status: "CAPTURED",
        raw: {
          simulated: true,
          authorizationId: input.authId,
          clientReferenceInformation: { code: input.orderId },
          orderInformation: { amountDetails: { totalAmount: formatAmount(input.amountCents), currency: "USD" } },
        },
      };
    },

    async release(input: ReleaseInput): Promise<PaymentResult> {
      const problem = checkRelease(input, mode);
      if (problem) return failure(mode, problem);
      await sleep(latencyMs);
      return {
        ok: true,
        mode,
        id: simId(),
        status: "REVERSED",
        raw: {
          simulated: true,
          authorizationId: input.authId,
          reason: input.reason,
          clientReferenceInformation: { code: input.orderId },
          reversalAmountDetails: { reversedAmount: formatAmount(input.amountCents), currency: "USD" },
        },
      };
    },
  };
}
