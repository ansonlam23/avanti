import { createHash, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createCybersourceAdapter, mapResponse, normalizeHost, plainText, type CybersourceConfig } from "./cybersource";
import { DEMO_BILL_TO, DEMO_TEST_CARD } from "./types";

const secretBytes = randomBytes(32); // runtime key material only
const NOW = new Date(Date.UTC(2026, 9, 16, 19, 30, 0));
const ORDER_ID = "6f1c0d6e-3a52-4b7e-9d3f-0e7b8a1c2d3e";
const AUTH_ID = "7609478419816525104807";

type Call = { url: string; init: RequestInit; body: Record<string, unknown>; headers: Record<string, string> };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/hal+json;charset=utf-8" },
  });
}

function setup(responder: (call: Call) => Response | Promise<Response>, extra: Partial<CybersourceConfig> = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? "{}")),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
    };
    calls.push(call);
    return responder(call);
  });
  const adapter = createCybersourceAdapter({
    merchantId: "open_sign_test",
    keyId: "11111111-2222-3333-4444-555555555555",
    sharedSecret: secretBytes.toString("base64"),
    host: "apitest.cybersource.com",
    fetch: fetchMock as unknown as typeof fetch,
    now: () => NOW,
    ...extra,
  });
  return { adapter, calls, fetchMock };
}

const AUTHORIZED = {
  _links: { capture: { method: "POST", href: `/pts/v2/payments/${AUTH_ID}/captures` } },
  clientReferenceInformation: { code: ORDER_ID },
  id: AUTH_ID,
  orderInformation: { amountDetails: { authorizedAmount: "18.00", currency: "USD" } },
  paymentAccountInformation: { card: { type: "001" } },
  paymentInformation: { tokenizedCard: { type: "001" }, card: { type: "001" } },
  processorInformation: { approvalCode: "831000", responseCode: "00", transactionId: "016153570198200", avs: { code: "Y" } },
  reconciliationId: AUTH_ID,
  status: "AUTHORIZED",
  submitTimeUtc: "2026-10-16T19:30:01Z",
};

const hold = { orderId: ORDER_ID, amountCents: 1800, currency: "USD" as const, card: DEMO_TEST_CARD };

describe("hold (authorization, capture=false)", () => {
  it("POSTs the documented body to /pts/v2/payments", async () => {
    const { adapter, calls } = setup(() => jsonResponse(201, AUTHORIZED));
    await adapter.hold({ ...hold, description: "Bánh mì ×2 · Mai's Bakery" });
    expect(calls).toHaveLength(1);
    const [c] = calls;
    expect(c.url).toBe("https://apitest.cybersource.com/pts/v2/payments");
    expect(c.init.method).toBe("POST");
    expect(c.body).toEqual({
      clientReferenceInformation: { code: ORDER_ID, comments: "Banh mi 2 Mai's Bakery" },
      processingInformation: { capture: false },
      orderInformation: { amountDetails: { totalAmount: "18.00", currency: "USD" }, billTo: { ...DEMO_BILL_TO } },
      paymentInformation: {
        card: { number: "4111111111111111", expirationMonth: "12", expirationYear: "2031", type: "001" },
      },
    });
  });

  it("signs exactly the bytes it sends (digest + HMAC recomputed independently)", async () => {
    const { adapter, calls } = setup(() => jsonResponse(201, AUTHORIZED));
    await adapter.hold(hold);
    const [c] = calls;
    const sent = String(c.init.body);
    expect(c.headers["content-type"]).toBe("application/json");
    expect(c.headers["v-c-merchant-id"]).toBe("open_sign_test");
    expect(c.headers.date).toBe("Fri, 16 Oct 2026 19:30:00 GMT");
    expect(c.headers["v-c-date"]).toBe(c.headers.date);
    const digest = `SHA-256=${createHash("sha256").update(sent).digest("base64")}`;
    expect(c.headers.digest).toBe(digest);
    const signingString = [
      "host: apitest.cybersource.com",
      "date: Fri, 16 Oct 2026 19:30:00 GMT",
      "request-target: post /pts/v2/payments",
      `digest: ${digest}`,
      "v-c-merchant-id: open_sign_test",
    ].join("\n");
    const expected = createHmac("sha256", secretBytes).update(signingString).digest("base64");
    expect(c.headers.signature).toBe(
      `keyid="11111111-2222-3333-4444-555555555555", algorithm="HmacSHA256", headers="host date request-target digest v-c-merchant-id", signature="${expected}"`,
    );
  });

  it("maps 201 AUTHORIZED → ok with the auth id, card last4 and a PAN-free raw", async () => {
    const { adapter } = setup(() => jsonResponse(201, AUTHORIZED));
    const r = await adapter.hold(hold);
    expect(r).toMatchObject({ ok: true, mode: "sandbox", id: AUTH_ID, status: "AUTHORIZED", cardLast4: "1111" });
    expect(r.ok && r.raw).toMatchObject({ httpStatus: 201, status: "AUTHORIZED", clientReferenceInformation: { code: ORDER_ID } });
    expect(JSON.stringify(r)).not.toContain("4111111111111111");
    expect(JSON.stringify(r)).not.toContain(secretBytes.toString("base64"));
  });

  it("maps 201 DECLINED → declined, not retryable", async () => {
    const { adapter } = setup(() =>
      jsonResponse(201, {
        id: "7609478419816525104999",
        status: "DECLINED",
        errorInformation: { reason: "PROCESSOR_DECLINED", message: "Decline - General decline of the card." },
      }),
    );
    const r = await adapter.hold(hold);
    expect(r).toMatchObject({ ok: false, mode: "sandbox", code: "declined", retryable: false });
    expect(!r.ok && r.message).toContain("PROCESSOR_DECLINED");
  });

  it("maps 201 AUTHORIZED_RISK_DECLINED → declined", async () => {
    const { adapter } = setup(() =>
      jsonResponse(201, { id: AUTH_ID, status: "AUTHORIZED_RISK_DECLINED", errorInformation: { reason: "SCORE_EXCEEDS_THRESHOLD" } }),
    );
    expect(await adapter.hold(hold)).toMatchObject({ ok: false, code: "declined", retryable: false });
  });

  it("maps 400 INVALID_REQUEST → invalid_request with the field details", async () => {
    const { adapter } = setup(() =>
      jsonResponse(400, {
        submitTimeUtc: "2026-10-16T19:30:01Z",
        status: "INVALID_REQUEST",
        reason: "MISSING_FIELD",
        message: "Declined - The request is missing one or more fields",
        details: [{ field: "orderInformation.billTo.email", reason: "MISSING_FIELD" }],
      }),
    );
    const r = await adapter.hold(hold);
    expect(r).toMatchObject({ ok: false, code: "invalid_request", retryable: false });
    expect(!r.ok && r.raw).toMatchObject({ details: [{ field: "orderInformation.billTo.email", reason: "MISSING_FIELD" }] });
  });

  it("maps 502 SERVER_ERROR and non-JSON 5xx → upstream_error, retryable", async () => {
    const a = setup(() => jsonResponse(502, { status: "SERVER_ERROR", reason: "SYSTEM_ERROR", message: "Error - General system failure." }));
    expect(await a.adapter.hold(hold)).toMatchObject({ ok: false, code: "upstream_error", retryable: true });
    const b = setup(() => new Response("<html>Bad Gateway</html>", { status: 503 }));
    expect(await b.adapter.hold(hold)).toMatchObject({ ok: false, code: "upstream_error", retryable: true });
  });

  it("maps 401 → auth_failed, not retryable", async () => {
    const { adapter } = setup(() => jsonResponse(401, { response: { rmsg: "Authentication Failed" } }));
    const r = await adapter.hold(hold);
    expect(r).toMatchObject({ ok: false, code: "auth_failed", retryable: false });
    expect(!r.ok && r.message).toContain("Authentication Failed");
  });

  it("times out after timeoutMs → timeout, retryable", async () => {
    const { adapter } = setup(
      (c) =>
        new Promise<Response>((_, reject) => {
          c.init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      { timeoutMs: 20 },
    );
    const r = await adapter.hold(hold);
    expect(r).toMatchObject({ ok: false, code: "timeout", retryable: true });
  });

  it("maps a thrown fetch → network_error, retryable", async () => {
    const { adapter } = setup(() => {
      throw new TypeError("fetch failed");
    });
    expect(await adapter.hold(hold)).toMatchObject({ ok: false, code: "network_error", retryable: true });
  });

  it("never throws: an internal error becomes a PaymentResult", async () => {
    const { adapter, fetchMock } = setup(() => jsonResponse(201, AUTHORIZED), { now: () => new Date(Number.NaN) });
    const r = await adapter.charge({ orderId: ORDER_ID, authId: AUTH_ID, amountCents: 100, currency: "USD" });
    expect(r).toMatchObject({ ok: false, code: "unexpected_response", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bad input locally without calling Visa", async () => {
    const { adapter, fetchMock } = setup(() => jsonResponse(201, AUTHORIZED));
    for (const bad of [
      { ...hold, amountCents: 0 },
      { ...hold, amountCents: 18.5 },
      { ...hold, amountCents: -100 },
      { ...hold, orderId: "" },
      { ...hold, card: { ...DEMO_TEST_CARD, number: "4111111111111112" } }, // fails Luhn
      { ...hold, card: { ...DEMO_TEST_CARD, expirationYear: "2020" } },
    ]) {
      expect(await adapter.hold(bad)).toMatchObject({ ok: false, mode: "sandbox", code: "invalid_input" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("charge (capture)", () => {
  const capture = { orderId: ORDER_ID, authId: AUTH_ID, amountCents: 1800, currency: "USD" as const };

  it("POSTs to /pts/v2/payments/{id}/captures and treats 201 PENDING as CAPTURED", async () => {
    const { adapter, calls } = setup(() =>
      jsonResponse(201, {
        id: "7609478500000000000001",
        status: "PENDING",
        clientReferenceInformation: { code: ORDER_ID },
        orderInformation: { amountDetails: { totalAmount: "18.00", currency: "USD" } },
      }),
    );
    const r = await adapter.charge({ ...capture, heldAmountCents: 1800 });
    expect(calls[0].url).toBe(`https://apitest.cybersource.com/pts/v2/payments/${AUTH_ID}/captures`);
    expect(calls[0].body).toEqual({
      clientReferenceInformation: { code: ORDER_ID },
      orderInformation: { amountDetails: { totalAmount: "18.00", currency: "USD" } },
    });
    expect(calls[0].headers.signature).toContain('headers="host date request-target digest v-c-merchant-id"');
    expect(r).toMatchObject({ ok: true, mode: "sandbox", id: "7609478500000000000001", status: "CAPTURED" });
    expect(r.ok && r.raw).toMatchObject({ status: "PENDING" });
  });

  it("rejects a capture above the held amount locally", async () => {
    const { adapter, fetchMock } = setup(() => jsonResponse(201, {}));
    const r = await adapter.charge({ ...capture, amountCents: 1801, heldAmountCents: 1800 });
    expect(r).toMatchObject({ ok: false, code: "exceeds_hold", retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows a partial capture (below the hold)", async () => {
    const { adapter, calls } = setup(() => jsonResponse(201, { id: "7609478500000000000002", status: "PENDING" }));
    expect(await adapter.charge({ ...capture, amountCents: 450, heldAmountCents: 1800 })).toMatchObject({ ok: true });
    expect(calls[0].body).toMatchObject({ orderInformation: { amountDetails: { totalAmount: "4.50" } } });
  });

  it("refuses simulated ids and path-unsafe ids without calling Visa", async () => {
    const { adapter, fetchMock } = setup(() => jsonResponse(201, {}));
    expect(await adapter.charge({ ...capture, authId: "SIM-0123456789ABCDEF" })).toMatchObject({ code: "mode_mismatch" });
    expect(await adapter.charge({ ...capture, authId: "../reversals" })).toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Visa's follow-on rejections to stable codes", async () => {
    const reasons: Array<[string, string]> = [
      ["EXCEEDS_AUTH_AMOUNT", "exceeds_hold"],
      ["AUTH_ALREADY_REVERSED", "already_finalized"],
      ["TRANSACTION_ALREADY_SETTLED", "already_finalized"],
      ["MISSING_AUTH", "unknown_authorization"],
      ["INVALID_PAYMENT_ID", "unknown_authorization"],
      ["DUPLICATE_REQUEST", "duplicate_request"],
    ];
    for (const [reason, code] of reasons) {
      const { adapter } = setup(() => jsonResponse(400, { status: "INVALID_REQUEST", reason, message: "x" }));
      expect(await adapter.charge(capture)).toMatchObject({ ok: false, code, retryable: false });
    }
  });
});

describe("release (authorization reversal)", () => {
  const release = { orderId: ORDER_ID, authId: AUTH_ID, amountCents: 1800, currency: "USD" as const, reason: "no_show" as const };

  it("POSTs the full amount to /reversals and maps 201 REVERSED", async () => {
    const { adapter, calls } = setup(() =>
      jsonResponse(201, {
        id: "7609478600000000000003",
        status: "REVERSED",
        clientReferenceInformation: { code: ORDER_ID },
        processorInformation: { responseCode: "200" },
        reversalAmountDetails: { reversedAmount: "18.00", currency: "USD" },
      }),
    );
    const r = await adapter.release(release);
    expect(calls[0].url).toBe(`https://apitest.cybersource.com/pts/v2/payments/${AUTH_ID}/reversals`);
    expect(calls[0].body).toEqual({
      clientReferenceInformation: { code: ORDER_ID, comments: "Open Sign: no-show, hold released" },
      reversalInformation: { amountDetails: { totalAmount: "18.00", currency: "USD" } },
    });
    expect(r).toMatchObject({ ok: true, mode: "sandbox", id: "7609478600000000000003", status: "REVERSED" });
    expect(r.ok && r.raw).toMatchObject({ reversalAmountDetails: { reversedAmount: "18.00" } });
  });

  it("maps an already-reversed authorization to already_finalized", async () => {
    const { adapter } = setup(() => jsonResponse(400, { status: "INVALID_REQUEST", reason: "AUTH_ALREADY_REVERSED" }));
    expect(await adapter.release(release)).toMatchObject({ ok: false, code: "already_finalized" });
  });

  it("validates the reason locally", async () => {
    const { adapter, fetchMock } = setup(() => jsonResponse(201, {}));
    expect(await adapter.release({ ...release, reason: "fraud" as never })).toMatchObject({ code: "invalid_input" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("mapResponse edge cases", () => {
  it("never treats a 201 failure status as success", () => {
    expect(mapResponse("hold", 201, { id: "1", status: "SERVER_ERROR", reason: "PROCESSOR_TIMEOUT" })).toMatchObject({
      ok: false,
      code: "upstream_error",
      retryable: true,
    });
    expect(mapResponse("hold", 201, { id: "1", status: "INVALID_REQUEST", errorInformation: { reason: "INVALID_MERCHANT_CONFIGURATION" } })).toMatchObject({
      ok: false,
      code: "invalid_request",
    });
    expect(mapResponse("hold", 201, { id: "1", status: "PARTIAL_AUTHORIZED" })).toMatchObject({ ok: false, code: "declined" });
    expect(mapResponse("release", 201, { id: "1", status: "PENDING" })).toMatchObject({ ok: false, code: "unexpected_response" });
    expect(mapResponse("hold", 201, { status: "AUTHORIZED" })).toMatchObject({ ok: false, code: "unexpected_response" });
  });

  it("accepts AUTHORIZED_PENDING_REVIEW (issuer approved, flagged) as a hold", () => {
    expect(mapResponse("hold", 201, { id: "1", status: "AUTHORIZED_PENDING_REVIEW" })).toMatchObject({ ok: true, status: "AUTHORIZED" });
  });
});

describe("config", () => {
  it("normalizes the host and refuses production hosts or malformed secrets", () => {
    expect(normalizeHost(" https://apitest.cybersource.com/ ")).toBe("apitest.cybersource.com");
    const cfg = { merchantId: "m", keyId: "k", sharedSecret: secretBytes.toString("base64"), host: "apitest.cybersource.com" };
    expect(createCybersourceAdapter(cfg).mode).toBe("sandbox");
    expect(() => createCybersourceAdapter({ ...cfg, host: "api.cybersource.com" })).toThrow(/sandbox/);
    expect(() => createCybersourceAdapter({ ...cfg, sharedSecret: "%%%" })).toThrow(/base64/);
    expect(() => createCybersourceAdapter({ ...cfg, merchantId: "" })).toThrow(/required/);
  });

  it("plainText keeps free text ASCII, single-line and bounded", () => {
    expect(plainText("Phở  bò\n×2", 256)).toBe("Pho bo 2");
    expect(plainText("x".repeat(300), 256)).toHaveLength(256);
  });
});
