import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentDigest } from "./digest";
import { generateAgentKeyPair, publicKeyFromJwk } from "./keys";
import { signRequest } from "./sign";
import { signatureBase } from "./signature-base";

const URL_A = "https://open-sign.example/api/shops/mais-bakery/orders";
const NOW = 1_760_000_000;
const BODY = JSON.stringify({ item_id: "item-1", qty: 1, amount_cents: 1800, pickup_time: null, customer_name: null, idempotency_key: "k-1" });

describe("signRequest", () => {
  const { signer, publicJwk } = generateAgentKeyPair();

  it("produces sig1 over the five components with all six parameters", () => {
    const headers = signRequest({ method: "POST", url: URL_A, body: BODY, signer, now: NOW, nonce: "n-123" });
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["content-digest"]).toBe(contentDigest(BODY));
    expect(headers["signature-input"]).toBe(
      `sig1=("@method" "@authority" "@path" "content-type" "content-digest");created=${NOW};expires=${NOW + 60};keyid="${signer.keyId}";nonce="n-123";alg="ed25519";tag="agent-payer-auth"`,
    );
    expect(headers.signature).toMatch(/^sig1=:[A-Za-z0-9+/]{86}==:$/); // 64 bytes
  });

  it("signs exactly the RFC 9421 signature base of the request", () => {
    const headers = signRequest({ method: "post", url: `${URL_A}?ignored=1`, body: BODY, signer, now: NOW, nonce: "n-123" });
    const base = signatureBase({ method: "POST", url: URL_A, headers: new Headers(headers) });
    expect(base).toBe(
      [
        '"@method": POST',
        '"@authority": open-sign.example',
        '"@path": /api/shops/mais-bakery/orders',
        '"content-type": application/json',
        `"content-digest": ${contentDigest(BODY)}`,
        `"@signature-params": ${headers["signature-input"].slice("sig1=".length)}`,
      ].join("\n"),
    );
    const signature = Buffer.from(headers.signature.slice("sig1=:".length, -1), "base64");
    expect(verify(null, Buffer.from(base), publicKeyFromJwk(publicJwk), signature)).toBe(true);
  });

  it("is deterministic for the same inputs and picks a fresh nonce by default", () => {
    const input = { method: "POST", url: URL_A, body: BODY, signer, now: NOW };
    expect(signRequest({ ...input, nonce: "same" })).toEqual(signRequest({ ...input, nonce: "same" }));
    const a = signRequest(input)["signature-input"];
    const b = signRequest(input)["signature-input"];
    expect(a).not.toBe(b);
    expect(a).toMatch(/;nonce="[A-Za-z0-9_-]{43}";/);
  });

  it("honours contentType and ttlSeconds", () => {
    const headers = signRequest({ method: "POST", url: URL_A, body: "x", contentType: "text/plain", signer, now: NOW, ttlSeconds: 300 });
    expect(headers["content-type"]).toBe("text/plain");
    expect(headers["signature-input"]).toContain(`;expires=${NOW + 300};`);
  });

  it("refuses bad input", () => {
    const base = { method: "POST", url: URL_A, body: BODY, signer };
    expect(() => signRequest({ ...base, url: "/api/shops/x/orders" })).toThrow(TypeError);
    expect(() => signRequest({ ...base, url: "ftp://open-sign.example/x" })).toThrow(TypeError);
    expect(() => signRequest({ ...base, ttlSeconds: 0 })).toThrow(RangeError);
    expect(() => signRequest({ ...base, ttlSeconds: 1.5 })).toThrow(RangeError);
    const notEd25519 = { keyId: "k", privateKey: generateKeyPairSync("x25519").privateKey };
    expect(() => signRequest({ ...base, signer: notEd25519 })).toThrow(/Ed25519/);
  });
});
