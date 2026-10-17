// Payments adapter contract (CONTRACTS.md §6). Pure: no `server-only`, no env.
import type { PaymentMode } from "@/lib/types";

export type { PaymentMode };

export interface TestCard {
  number: string;
  expirationMonth: string; // "01"–"12"
  expirationYear: string; // 4 digits
  securityCode?: string;
}

/**
 * Visa's public sandbox test card (Cybersource testing guide). Sandbox only:
 * it never moves real money. The shopper agent never sees card data; the
 * server pays with this card on the shopper's behalf.
 */
export const DEMO_TEST_CARD: TestCard = {
  number: "4111111111111111",
  expirationMonth: "12",
  expirationYear: "2031",
};

/** Clearly fake bill-to person sent with every sandbox authorization. */
export const DEMO_BILL_TO = {
  firstName: "Demo",
  lastName: "Shopper",
  address1: "1 Demo Way",
  locality: "Seattle",
  administrativeArea: "WA",
  postalCode: "98105",
  country: "US",
  email: "demo@example.com",
} as const;

export interface HoldInput {
  orderId: string;
  amountCents: number;
  currency: "USD";
  card: TestCard;
  description?: string;
}

export interface CaptureInput {
  orderId: string;
  authId: string;
  amountCents: number;
  currency: "USD";
  /**
   * Addition to CONTRACTS §6: the amount that was held (from the DB). When
   * given, a capture above it is rejected locally. Defaults to `amountCents`.
   */
  heldAmountCents?: number;
}

export type ReleaseReason = "no_show" | "cancelled" | "order_failed";

export interface ReleaseInput {
  orderId: string;
  authId: string;
  amountCents: number; // must be the full authorized amount (Cybersource rule)
  currency: "USD";
  reason: ReleaseReason;
}

export type PaymentStatus = "AUTHORIZED" | "CAPTURED" | "REVERSED";

/**
 * Failure codes (stable, snake_case):
 * - `declined`              issuer/processor said no (route → 402)
 * - `invalid_input`         rejected locally before any Visa call
 * - `exceeds_hold`          capture above the held amount
 * - `mode_mismatch`         a SIM- id sent to the sandbox adapter, or the reverse
 * - `already_finalized`     Visa: already captured/settled/reversed
 * - `unknown_authorization` Visa: no such authorization
 * - `duplicate_request`     Visa: same order reference within 15 minutes
 * - `invalid_request`       Visa rejected the request (our bug or merchant config)
 * - `auth_failed`           Visa rejected our HTTP Signature or keys (401/403)
 * - `not_configured`        sandbox requested but Visa keys are missing
 * - `upstream_error`        Visa 5xx / SERVER_ERROR (retryable)
 * - `timeout`               no answer within the timeout (retryable; outcome unknown)
 * - `network_error`         could not reach Visa (retryable)
 * - `unexpected_response`   Visa answered with something we can't interpret
 */
export type PaymentErrorCode =
  | "declined"
  | "invalid_input"
  | "exceeds_hold"
  | "mode_mismatch"
  | "already_finalized"
  | "unknown_authorization"
  | "duplicate_request"
  | "invalid_request"
  | "auth_failed"
  | "not_configured"
  | "upstream_error"
  | "timeout"
  | "network_error"
  | "unexpected_response";

export type PaymentResult =
  | {
      ok: true;
      mode: PaymentMode;
      id: string; // hold → authorization id, charge → capture id, release → reversal id
      status: PaymentStatus;
      cardLast4?: string;
      raw?: unknown;
    }
  | {
      ok: false;
      mode: PaymentMode;
      code: PaymentErrorCode;
      message: string;
      retryable: boolean;
      raw?: unknown;
    };

export interface PaymentsAdapter {
  readonly mode: PaymentMode;
  /** Authorization only (processingInformation.capture = false). */
  hold(input: HoldInput): Promise<PaymentResult>;
  /** Capture; amount must be ≤ the held amount (rejected locally otherwise). */
  charge(input: CaptureInput): Promise<PaymentResult>;
  /** Full authorization reversal. */
  release(input: ReleaseInput): Promise<PaymentResult>;
}
