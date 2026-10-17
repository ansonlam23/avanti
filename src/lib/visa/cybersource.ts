// Visa Acceptance (Cybersource) REST adapter for the sandbox, plain fetch + our
// own HTTP Signature signer. Pure: no `server-only`, no env (index.ts wires it).
//
//   hold    POST /pts/v2/payments                    capture=false → AUTHORIZED
//   charge  POST /pts/v2/payments/{authId}/captures  Visa says PENDING (= queued
//                                                    for settlement) → CAPTURED
//   release POST /pts/v2/payments/{authId}/reversals → REVERSED
//
// Response semantics (Cybersource response-code table): HTTP 201 can still be a
// failure (DECLINED, AUTHORIZED_RISK_DECLINED, SERVER_ERROR …), so we always
// read `status`; 400 = INVALID_REQUEST (+reason), 502 = SERVER_ERROR.
import { signHttpRequest, decodeSharedSecret } from "./http-signature";
import {
  DEMO_BILL_TO,
  type CaptureInput,
  type HoldInput,
  type PaymentErrorCode,
  type PaymentResult,
  type PaymentsAdapter,
  type ReleaseInput,
} from "./types";
import { cardLast4, cardType, checkCapture, checkHold, checkRelease, failure, formatAmount } from "./validate";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const PAYMENTS_PATH = "/pts/v2/payments";
const PRODUCTION_HOSTS = new Set(["api.cybersource.com", "api.visaacceptance.com"]);

export interface CybersourceConfig {
  merchantId: string;
  keyId: string;
  sharedSecret: string;
  host: string; // "apitest.cybersource.com" (a scheme or path is stripped)
  /** Optional extras (additive to CONTRACTS §6), mainly for tests. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

type Op = "hold" | "charge" | "release";
type Json = Record<string, unknown>;
type HttpOutcome =
  | { kind: "response"; httpStatus: number; json: Json | null }
  | { kind: "timeout" }
  | { kind: "network"; message: string };

export function normalizeHost(host: string): string {
  return host
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

// ── request bodies (exported for tests) ──────────────────────────────────

/** ASCII-only, single-line text for free-form fields (Business Center friendly). */
export function plainText(text: string, max: number): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function holdBody(input: HoldInput) {
  const { card } = input;
  const type = cardType(card.number);
  const comments = input.description ? plainText(input.description, 256) : "";
  return {
    clientReferenceInformation: { code: input.orderId, ...(comments ? { comments } : {}) },
    processingInformation: { capture: false },
    orderInformation: {
      amountDetails: { totalAmount: formatAmount(input.amountCents), currency: input.currency },
      billTo: { ...DEMO_BILL_TO },
    },
    paymentInformation: {
      card: {
        number: card.number,
        expirationMonth: card.expirationMonth.padStart(2, "0"),
        expirationYear: card.expirationYear,
        ...(type ? { type } : {}),
        ...(card.securityCode ? { securityCode: card.securityCode } : {}),
      },
    },
  };
}

export function captureBody(input: CaptureInput) {
  return {
    clientReferenceInformation: { code: input.orderId },
    orderInformation: {
      amountDetails: { totalAmount: formatAmount(input.amountCents), currency: input.currency },
    },
  };
}

const RELEASE_COMMENT: Record<ReleaseInput["reason"], string> = {
  no_show: "Open Sign: no-show, hold released",
  cancelled: "Open Sign: order cancelled, hold released",
  order_failed: "Open Sign: order failed, hold released",
};

/**
 * Full reversal. Our reason goes in clientReferenceInformation.comments (shown
 * in the Business Center), NOT reversalInformation.reason: that field is
 * String(3) and its only documented value is "34" (suspected fraud).
 */
export function reversalBody(input: ReleaseInput) {
  return {
    clientReferenceInformation: { code: input.orderId, comments: RELEASE_COMMENT[input.reason] },
    reversalInformation: {
      amountDetails: { totalAmount: formatAmount(input.amountCents), currency: input.currency },
    },
  };
}

// ── response mapping (exported for tests) ────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function obj(v: unknown): Json | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined;
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  const o = obj(value);
  if (!o) return value;
  const out: Json = {};
  for (const [k, v] of Object.entries(o)) {
    const c = compact(v);
    if (c === undefined) continue;
    if (obj(c) && Object.keys(c as Json).length === 0) continue;
    out[k] = c;
  }
  return out;
}

/** Whitelisted copy of Visa's response: ids, statuses, amounts, reasons. Never card data. */
export function safeRaw(httpStatus: number, json: Json | null): unknown {
  if (!json) return { httpStatus };
  const cri = obj(json.clientReferenceInformation);
  const amount = obj(obj(json.orderInformation)?.amountDetails);
  const reversed = obj(json.reversalAmountDetails);
  const proc = obj(json.processorInformation);
  const err = obj(json.errorInformation);
  const details = (v: unknown) =>
    Array.isArray(v) ? v.map((d) => ({ field: str(obj(d)?.field), reason: str(obj(d)?.reason) })) : undefined;
  return compact({
    httpStatus,
    id: str(json.id),
    status: str(json.status),
    reason: str(json.reason),
    message: str(json.message),
    details: details(json.details),
    submitTimeUtc: str(json.submitTimeUtc),
    reconciliationId: str(json.reconciliationId),
    clientReferenceInformation: { code: str(cri?.code) },
    orderInformation: {
      amountDetails: {
        authorizedAmount: str(amount?.authorizedAmount),
        totalAmount: str(amount?.totalAmount),
        currency: str(amount?.currency),
      },
    },
    reversalAmountDetails: { reversedAmount: str(reversed?.reversedAmount), currency: str(reversed?.currency) },
    processorInformation: {
      approvalCode: str(proc?.approvalCode),
      responseCode: str(proc?.responseCode),
      transactionId: str(proc?.transactionId),
    },
    errorInformation: { reason: str(err?.reason), message: str(err?.message), details: details(err?.details) },
    rmsg: str(obj(json.response)?.rmsg), // 401 body: {"response":{"rmsg":"Authentication Failed"}}
  });
}

const SUCCESS: Record<Op, { statuses: ReadonlySet<string> | null; as: "AUTHORIZED" | "CAPTURED" | "REVERSED" }> = {
  // AUTHORIZED_PENDING_REVIEW = issuer approved, flagged by AVS/fraud rules; still capturable.
  hold: { statuses: new Set(["AUTHORIZED", "AUTHORIZED_PENDING_REVIEW"]), as: "AUTHORIZED" },
  charge: { statuses: null, as: "CAPTURED" }, // any non-failure 2xx with an id (Visa: "PENDING")
  release: { statuses: new Set(["REVERSED"]), as: "REVERSED" },
};
const FAILURE_STATUSES = new Set([
  "DECLINED",
  "AUTHORIZED_RISK_DECLINED",
  "PARTIAL_AUTHORIZED",
  "PENDING_AUTHENTICATION",
  "INVALID_REQUEST",
  "SERVER_ERROR",
]);
const DECLINE_STATUSES = new Set(["DECLINED", "AUTHORIZED_RISK_DECLINED", "PARTIAL_AUTHORIZED", "PENDING_AUTHENTICATION"]);
const INVALID_REASON_CODE: Record<string, PaymentErrorCode> = {
  EXCEEDS_AUTH_AMOUNT: "exceeds_hold",
  AUTH_ALREADY_REVERSED: "already_finalized",
  TRANSACTION_ALREADY_SETTLED: "already_finalized",
  TRANSACTION_ALREADY_REVERSED_OR_SETTLED: "already_finalized",
  INVALID_PAYMENT_ID: "unknown_authorization",
  MISSING_AUTH: "unknown_authorization",
  DUPLICATE_REQUEST: "duplicate_request",
  PROCESSOR_UNAVAILABLE: "upstream_error",
};
const OP_NOUN: Record<Op, string> = { hold: "authorization", charge: "capture", release: "reversal" };

export function mapResponse(op: Op, httpStatus: number, json: Json | null): PaymentResult {
  const mode = "sandbox" as const;
  const raw = safeRaw(httpStatus, json);
  const status = str(json?.status);
  const id = str(json?.id);
  const ok2xx = httpStatus >= 200 && httpStatus < 300;

  const success = SUCCESS[op];
  if (ok2xx && id && status && !FAILURE_STATUSES.has(status) && (!success.statuses || success.statuses.has(status))) {
    return { ok: true, mode, id, status: success.as, raw };
  }

  const err = obj(json?.errorInformation);
  const reason = str(err?.reason) ?? str(json?.reason);
  const visaMessage = str(err?.message) ?? str(json?.message) ?? str(obj(json?.response)?.rmsg);
  const noun = OP_NOUN[op];
  const say = (code: PaymentErrorCode, lead: string, retryable: boolean) =>
    failure(
      mode,
      { code, message: `${lead}${reason ? ` (${reason})` : ""}${visaMessage ? `: ${visaMessage}` : ""}` },
      retryable,
      raw,
    );

  if (httpStatus === 401 || httpStatus === 403) {
    return say("auth_failed", `Visa rejected our credentials (HTTP ${httpStatus}); check the merchant ID, key and clock`, false);
  }
  if (httpStatus === 429) return say("upstream_error", "Visa rate-limited the request", true);
  if (httpStatus >= 500 || status === "SERVER_ERROR") {
    return say("upstream_error", `Visa had a server error on the ${noun} (HTTP ${httpStatus})`, true);
  }
  if (status && DECLINE_STATUSES.has(status)) {
    return say("declined", `Visa declined the ${noun} [${status}]`, false);
  }
  if (status === "INVALID_REQUEST" || httpStatus === 400) {
    const code = (reason && INVALID_REASON_CODE[reason]) || "invalid_request";
    return say(code, `Visa rejected the ${noun} request`, code === "upstream_error");
  }
  if (httpStatus === 404) {
    return say(op === "hold" ? "invalid_request" : "unknown_authorization", `Visa could not find that ${noun} (HTTP 404)`, false);
  }
  if (httpStatus >= 400) return say("invalid_request", `Visa rejected the ${noun} request (HTTP ${httpStatus})`, false);
  // 2xx we can't interpret (unknown status / no id). Not retryable: Visa may have acted on it.
  return say("unexpected_response", `Unexpected Visa ${noun} response (HTTP ${httpStatus}, status ${status ?? "none"})`, false);
}

// ── adapter ──────────────────────────────────────────────────────────────

export function createCybersourceAdapter(cfg: CybersourceConfig): PaymentsAdapter {
  const merchantId = (cfg.merchantId ?? "").trim();
  const keyId = (cfg.keyId ?? "").trim();
  const sharedSecret = (cfg.sharedSecret ?? "").trim();
  const host = normalizeHost(cfg.host ?? "");
  if (!merchantId || !keyId || !sharedSecret || !host) {
    throw new Error("createCybersourceAdapter: merchantId, keyId, sharedSecret and host are required");
  }
  decodeSharedSecret(sharedSecret); // fail fast on a malformed secret (message never includes it)
  if (PRODUCTION_HOSTS.has(host)) {
    throw new Error("createCybersourceAdapter: this build only talks to the Visa sandbox (apitest.* hosts)");
  }
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl: typeof fetch = cfg.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = cfg.now ?? (() => new Date());
  const mode = "sandbox" as const;

  async function post(path: string, body: unknown): Promise<HttpOutcome> {
    const text = JSON.stringify(body);
    const auth = signHttpRequest({ method: "POST", host, path, body: text, merchantId, keyId, sharedSecret, date: now() });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Host comes from the URL (fetch ignores a custom host header); it equals `host` above.
      const res = await fetchImpl(`https://${host}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "v-c-merchant-id": auth["v-c-merchant-id"],
          date: auth.date,
          "v-c-date": auth["v-c-date"],
          digest: auth.digest ?? "",
          signature: auth.signature,
        },
        body: text,
        signal: controller.signal,
      });
      const responseText = await res.text();
      let json: Json | null = null;
      try {
        json = obj(JSON.parse(responseText)) ?? null;
      } catch {
        json = null;
      }
      return { kind: "response", httpStatus: res.status, json };
    } catch (error) {
      if (controller.signal.aborted) return { kind: "timeout" };
      return { kind: "network", message: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  async function call(op: Op, path: string, body: unknown): Promise<PaymentResult> {
    let outcome: HttpOutcome;
    try {
      outcome = await post(path, body);
    } catch (error) {
      // Never throw into route code (e.g. a signing error). Messages never contain secrets.
      const message = error instanceof Error ? error.message : String(error);
      return failure(mode, { code: "unexpected_response", message: `Payments adapter error: ${message}` }, false);
    }
    if (outcome.kind === "timeout") {
      return failure(
        mode,
        { code: "timeout", message: `Visa did not answer the ${OP_NOUN[op]} within ${timeoutMs} ms (outcome unknown)` },
        true,
      );
    }
    if (outcome.kind === "network") {
      return failure(mode, { code: "network_error", message: `Could not reach Visa: ${outcome.message}` }, true);
    }
    return mapResponse(op, outcome.httpStatus, outcome.json);
  }

  return {
    mode,

    async hold(input: HoldInput): Promise<PaymentResult> {
      const problem = checkHold(input, now());
      if (problem) return failure(mode, problem);
      const result = await call("hold", PAYMENTS_PATH, holdBody(input));
      return result.ok ? { ...result, cardLast4: cardLast4(input.card) } : result;
    },

    async charge(input: CaptureInput): Promise<PaymentResult> {
      const problem = checkCapture(input, mode);
      if (problem) return failure(mode, problem);
      return call("charge", `${PAYMENTS_PATH}/${encodeURIComponent(input.authId)}/captures`, captureBody(input));
    },

    async release(input: ReleaseInput): Promise<PaymentResult> {
      const problem = checkRelease(input, mode);
      if (problem) return failure(mode, problem);
      return call("release", `${PAYMENTS_PATH}/${encodeURIComponent(input.authId)}/reversals`, reversalBody(input));
    },
  };
}
