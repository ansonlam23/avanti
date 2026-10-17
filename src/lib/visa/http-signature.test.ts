import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bodyDigest, decodeSharedSecret, httpDate, signHttpRequest, signingString } from "./http-signature";

// Key material is generated at runtime (public repo: never commit keys).
const secretBytes = randomBytes(32);
const sharedSecret = secretBytes.toString("base64");
const DOCS_DATE = new Date(Date.UTC(2019, 6, 18, 0, 18, 3)); // date used in the Cybersource guide
const BODY = '{"clientReferenceInformation":{"code":"TC50171_3"}}';

const base = {
  method: "POST",
  host: "apitest.cybersource.com",
  path: "/pts/v2/payments",
  body: BODY,
  merchantId: "open_sign_test",
  keyId: "11111111-2222-3333-4444-555555555555",
  sharedSecret,
  date: DOCS_DATE,
};

function parseSignatureHeader(header: string): Record<string, string> {
  return Object.fromEntries([...header.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

describe("httpDate", () => {
  it("formats RFC 7231 IMF-fixdate like the docs", () => {
    expect(httpDate(DOCS_DATE)).toBe("Thu, 18 Jul 2019 00:18:03 GMT");
    expect(httpDate(new Date(Date.UTC(2026, 9, 5, 7, 4, 9)))).toBe("Mon, 05 Oct 2026 07:04:09 GMT");
  });
});

describe("bodyDigest", () => {
  it("is SHA-256= + base64(sha256(body)) (values from openssl)", () => {
    expect(bodyDigest(BODY)).toBe("SHA-256=8/r3xgd0zzJf7lzdmDJ0phW/UOyPt23n++R+PbYNQeU=");
    expect(bodyDigest("")).toBe("SHA-256=47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=");
  });
});

describe("signingString", () => {
  it("is one 'name: value' line per signed header, joined by \\n, no trailing newline", () => {
    expect(
      signingString({
        host: "apitest.cybersource.com",
        date: "Thu, 18 Jul 2019 00:18:03 GMT",
        requestTarget: "post /pts/v2/payments",
        digest: "SHA-256=abc=",
        merchantId: "mymerchantid",
      }),
    ).toBe(
      "host: apitest.cybersource.com\n" +
        "date: Thu, 18 Jul 2019 00:18:03 GMT\n" +
        "request-target: post /pts/v2/payments\n" +
        "digest: SHA-256=abc=\n" +
        "v-c-merchant-id: mymerchantid",
    );
  });
});

describe("signHttpRequest", () => {
  it("produces the documented headers and signature format", () => {
    const h = signHttpRequest(base);
    expect(h.host).toBe("apitest.cybersource.com");
    expect(h.date).toBe("Thu, 18 Jul 2019 00:18:03 GMT");
    expect(h["v-c-date"]).toBe(h.date);
    expect(h["v-c-merchant-id"]).toBe("open_sign_test");
    expect(h.digest).toBe("SHA-256=8/r3xgd0zzJf7lzdmDJ0phW/UOyPt23n++R+PbYNQeU=");
    expect(h.signature).toMatch(
      /^keyid="11111111-2222-3333-4444-555555555555", algorithm="HmacSHA256", headers="host date request-target digest v-c-merchant-id", signature="[A-Za-z0-9+/]{43}="$/,
    );
  });

  it("signs HMAC-SHA256(signing string, base64-decoded secret) — independent recomputation", () => {
    const h = signHttpRequest(base);
    const expected = createHmac("sha256", secretBytes)
      .update(
        [
          "host: apitest.cybersource.com",
          "date: Thu, 18 Jul 2019 00:18:03 GMT",
          "request-target: post /pts/v2/payments",
          `digest: ${h.digest}`,
          "v-c-merchant-id: open_sign_test",
        ].join("\n"),
      )
      .digest("base64");
    expect(parseSignatureHeader(h.signature).signature).toBe(expected);
  });

  it("is deterministic for the same (date, body, secret) and changes when any of them changes", () => {
    const sig = (over: Partial<typeof base>) => parseSignatureHeader(signHttpRequest({ ...base, ...over }).signature).signature;
    const a = sig({});
    expect(sig({})).toBe(a);
    expect(sig({ body: BODY.replace("TC50171_3", "TC50171_4") })).not.toBe(a);
    expect(sig({ date: new Date(DOCS_DATE.getTime() + 1000) })).not.toBe(a);
    expect(sig({ sharedSecret: randomBytes(32).toString("base64") })).not.toBe(a);
    expect(sig({ path: "/pts/v2/payments/123/captures" })).not.toBe(a);
  });

  it("lowercases the method in request-target and omits digest for GET", () => {
    const h = signHttpRequest({ ...base, method: "GET", path: "/pts/v2/payments/123", body: undefined });
    expect(h.digest).toBeUndefined();
    const params = parseSignatureHeader(h.signature);
    expect(params.headers).toBe("host date request-target v-c-merchant-id");
    const expected = createHmac("sha256", secretBytes)
      .update(
        "host: apitest.cybersource.com\ndate: Thu, 18 Jul 2019 00:18:03 GMT\nrequest-target: get /pts/v2/payments/123\nv-c-merchant-id: open_sign_test",
      )
      .digest("base64");
    expect(params.signature).toBe(expected);
  });

  it("rejects inputs that would silently produce a bad signature", () => {
    expect(() => signHttpRequest({ ...base, body: undefined })).toThrow(/body/);
    expect(() => signHttpRequest({ ...base, host: "https://apitest.cybersource.com" })).toThrow(/host/);
    expect(() => signHttpRequest({ ...base, path: "pts/v2/payments" })).toThrow(/path/);
    expect(() => signHttpRequest({ ...base, sharedSecret: "not base64!" })).toThrow(/base64/);
  });
});

describe("decodeSharedSecret", () => {
  it("base64-decodes the Business Center secret and never echoes it in errors", () => {
    expect(decodeSharedSecret(sharedSecret).equals(secretBytes)).toBe(true);
    const bad = "zz%%" + sharedSecret.slice(4);
    expect(() => decodeSharedSecret(bad)).toThrow();
    try {
      decodeSharedSecret(bad);
    } catch (e) {
      expect((e as Error).message).not.toContain(bad);
    }
  });
});
