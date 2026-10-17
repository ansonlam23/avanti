// Input validation shared by the simulated and Cybersource adapters. Pure and
// stateless: the order service enforces the lifecycle (held → paid/released)
// from the database; adapters only check what they are handed.
import type { CaptureInput, HoldInput, PaymentErrorCode, PaymentMode, PaymentResult, ReleaseInput, TestCard } from "./types";

export const SIM_ID_PREFIX = "SIM-";
const ORDER_ID_MAX = 50; // clientReferenceInformation.code is String(50)
const RELEASE_REASONS = new Set(["no_show", "cancelled", "order_failed"]);

export type Problem = { code: PaymentErrorCode; message: string };

export function failure(mode: PaymentMode, p: Problem, retryable = false, raw?: unknown): PaymentResult {
  return { ok: false, mode, code: p.code, message: p.message, retryable, ...(raw === undefined ? {} : { raw }) };
}

/** Integer cents → Cybersource decimal string ("18.00"). No float math. */
export function formatAmount(cents: number): string {
  if (!isValidAmountCents(cents)) throw new Error(`formatAmount: invalid cents ${String(cents)}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function isValidAmountCents(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardLast4(card: TestCard): string {
  return card.number.slice(-4);
}

/** Cybersource card type code (paymentInformation.card.type). */
export function cardType(number: string): string | undefined {
  if (/^4/.test(number)) return "001"; // Visa
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(number)) return "002"; // Mastercard
  if (/^3[47]/.test(number)) return "003"; // American Express
  if (/^(6011|65|64[4-9])/.test(number)) return "004"; // Discover
  return undefined;
}

function checkOrderId(orderId: unknown): Problem | null {
  if (typeof orderId !== "string" || !/^[\x21-\x7e]{1,50}$/.test(orderId)) {
    return { code: "invalid_input", message: `orderId must be 1–${ORDER_ID_MAX} printable characters` };
  }
  return null;
}

function checkMoney(amountCents: unknown, currency: unknown): Problem | null {
  if (!isValidAmountCents(amountCents)) {
    return { code: "invalid_input", message: "amountCents must be a positive integer (cents)" };
  }
  if (currency !== "USD") return { code: "invalid_input", message: "currency must be USD" };
  return null;
}

export function checkCard(card: TestCard | undefined, now: Date): Problem | null {
  const bad = (message: string): Problem => ({ code: "invalid_input", message });
  if (!card || typeof card.number !== "string") return bad("card is required");
  if (!/^\d{13,19}$/.test(card.number) || !luhnValid(card.number)) return bad("card number is not valid");
  if (!/^(0?[1-9]|1[0-2])$/.test(card.expirationMonth ?? "")) return bad("card expirationMonth must be 01–12");
  if (!/^\d{4}$/.test(card.expirationYear ?? "")) return bad("card expirationYear must have 4 digits");
  const year = Number(card.expirationYear);
  const month = Number(card.expirationMonth);
  const nowYear = now.getUTCFullYear();
  if (year < nowYear || (year === nowYear && month < now.getUTCMonth() + 1)) return bad("card is expired");
  if (card.securityCode !== undefined && !/^\d{3,4}$/.test(card.securityCode)) {
    return bad("card securityCode must be 3–4 digits");
  }
  return null;
}

export function checkHold(input: HoldInput, now: Date): Problem | null {
  return (
    checkOrderId(input?.orderId) ??
    checkMoney(input?.amountCents, input?.currency) ??
    checkCard(input?.card, now)
  );
}

/**
 * Validate a follow-on (capture/reversal) authorization id for this adapter:
 * simulated ids start with "SIM-", sandbox ids are plain alphanumerics (the
 * id goes into the URL path, so nothing else is allowed).
 */
export function checkAuthId(authId: unknown, mode: PaymentMode): Problem | null {
  if (typeof authId !== "string" || authId.length === 0) {
    return { code: "invalid_input", message: "authId is required" };
  }
  const simulatedId = authId.startsWith(SIM_ID_PREFIX);
  if (mode === "sandbox" && simulatedId) {
    return { code: "mode_mismatch", message: "a simulated (SIM-) authorization cannot be sent to the Visa sandbox" };
  }
  if (mode === "simulated" && !simulatedId) {
    return { code: "mode_mismatch", message: "the simulated adapter only handles SIM- authorizations" };
  }
  const body = simulatedId ? authId.slice(SIM_ID_PREFIX.length) : authId;
  if (!/^[A-Za-z0-9]{1,64}$/.test(body)) {
    return { code: "invalid_input", message: "authId has unexpected characters" };
  }
  return null;
}

export function checkCapture(input: CaptureInput, mode: PaymentMode): Problem | null {
  const basic =
    checkOrderId(input?.orderId) ?? checkAuthId(input?.authId, mode) ?? checkMoney(input?.amountCents, input?.currency);
  if (basic) return basic;
  if (input.heldAmountCents !== undefined) {
    if (!isValidAmountCents(input.heldAmountCents)) {
      return { code: "invalid_input", message: "heldAmountCents must be a positive integer (cents)" };
    }
    if (input.amountCents > input.heldAmountCents) {
      return {
        code: "exceeds_hold",
        message: `capture ${formatAmount(input.amountCents)} is more than the held ${formatAmount(input.heldAmountCents)}`,
      };
    }
  }
  return null;
}

export function checkRelease(input: ReleaseInput, mode: PaymentMode): Problem | null {
  const basic =
    checkOrderId(input?.orderId) ?? checkAuthId(input?.authId, mode) ?? checkMoney(input?.amountCents, input?.currency);
  if (basic) return basic;
  if (!RELEASE_REASONS.has(input.reason)) {
    return { code: "invalid_input", message: "reason must be no_show, cancelled or order_failed" };
  }
  return null;
}
