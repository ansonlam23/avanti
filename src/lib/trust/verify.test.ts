import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { COVERED_COMPONENTS } from "./constants";
import { contentDigest } from "./digest";
import { generateAgentKeyPair } from "./keys";
import { signRequest, type SignOverrides } from "./sign";
import { memoryDirectory, memoryNonceStore } from "./stores";
import type { AgentDirectory, DirectoryAgent, NonceStore, SignedHeaders, SignInput, VerifyInput, VerifyResult } from "./types";
import { verifyRequest } from "./verify";

// Keys are generated at runtime (never commit key material). The clock is fixed via `now`.

const URL_A = "https://open-sign.example/api/shops/mais-bakery/orders";
const URL_B = "https://open-sign.example/api/shops/pho-hoa/orders";
const NOW = 1_760_000_000;
const order = (amount_cents: number) =>
  JSON.stringify({ item_id: "5f0c-item", qty: 1, amount_cents, pickup_time: null, customer_name: "Sam", idempotency_key: "idem-1" });
const BODY = order(1800);

function setup() {
  const { signer, publicJwk } = generateAgentKeyPair();
  const agent: DirectoryAgent = { id: "agent-1", name: "Open Sign Shopper", keyId: signer.keyId, publicJwk, verified: true };
  const directory = memoryDirectory([agent]);
  const nonces = memoryNonceStore();
  const sign = (input: Partial<SignInput> = {}, overrides?: SignOverrides): SignedHeaders =>
    signRequest({ method: "POST", url: URL_A, body: BODY, signer, now: NOW, ...input }, overrides);
  const verify = (headers: HeadersInit, input: Partial<VerifyInput> = {}): Promise<VerifyResult> =>
    verifyRequest({ method: "POST", url: URL_A, headers: new Headers(headers), body: BODY, directory, nonces, now: NOW, ...input });
  return { signer, publicJwk, agent, directory, nonces, sign, verify };
}

function expectBlocked(result: VerifyResult, reason: string, detail?: RegExp) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.reason).toBe(reason);
  if (detail) expect(result.detail).toMatch(detail);
}

/** Flip one bit of the signature bytes. */
function tamper(signature: string): string {
  const bytes = Buffer.from(signature.slice("sig1=:".length, -1), "base64");
  bytes[10] ^= 0x01;
  return `sig1=:${bytes.toString("base64")}:`;
}

const spyDirectory = (inner: AgentDirectory) => ({ lookup: vi.fn((keyId: string) => inner.lookup(keyId)) });
const spyNonces = (inner: NonceStore) => ({
  consume: vi.fn((nonce: string, keyId: string, expiresAt: Date) => inner.consume(nonce, keyId, expiresAt)),
});

describe("verifyRequest: valid requests", () => {
  it("accepts a correctly signed order", async () => {
    const { sign, verify, agent } = setup();
    const result = await verify(sign({ nonce: "nonce-1" }));
    expect(result).toEqual({ ok: true, agent, keyId: agent.keyId, nonce: "nonce-1", created: NOW, expires: NOW + 60 });
  });

  it("accepts TAP-style alg=\"Ed25519\" (alg is case-insensitive)", async () => {
    const { sign, verify } = setup();
    expect((await verify(sign({}, { alg: "Ed25519" }))).ok).toBe(true);
  });

  it("accepts the components in any order", async () => {
    const { sign, verify } = setup();
    expect((await verify(sign({}, { components: [...COVERED_COMPONENTS].reverse() }))).ok).toBe(true);
  });

  it("allows up to 30s of clock skew on created", async () => {
    const { sign, verify } = setup();
    expect((await verify(sign({ now: NOW + 30 }))).ok).toBe(true);
  });

  it("accepts a window of exactly MAX_WINDOW_SECONDS", async () => {
    const { sign, verify } = setup();
    expect((await verify(sign({ ttlSeconds: 480 }))).ok).toBe(true);
  });

  it("normalizes @authority (case, default port) on both sides", async () => {
    const { sign, verify } = setup();
    expect((await verify(sign({ url: "https://OPEN-SIGN.example:443/api/shops/mais-bakery/orders" }))).ok).toBe(true);
  });

  it("doesn't cover the query string", async () => {
    const { sign, verify } = setup();
    expect((await verify(sign(), { url: `${URL_A}?utm=x` })).ok).toBe(true);
  });

  it("still verifies when a proxy rewrote the Host header", async () => {
    const { sign, verify } = setup();
    expect((await verify({ ...sign(), host: "internal:8080" })).ok).toBe(true);
  });

  it("works with the exact Request → verifyRequest wiring the order route uses", async () => {
    const { sign, directory, nonces } = setup();
    const req = new Request(URL_A, { method: "POST", headers: sign(), body: BODY });
    const result = await verifyRequest({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: await req.text(),
      directory,
      nonces,
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("survives a real HTTP round trip (fetch → node:http)", async () => {
    const { signer, directory, nonces } = setup();
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(name, value);
          else if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
        }
        const result = await verifyRequest({
          method: req.method ?? "",
          url: `http://${req.headers.host}${req.url}`,
          headers,
          body: Buffer.concat(chunks).toString("utf8"),
          directory,
          nonces,
        });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(result));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${port}/api/shops/mais-bakery/orders`;
      const headers = signRequest({ method: "POST", url, body: BODY, signer });
      const result = (await (await fetch(url, { method: "POST", headers, body: BODY })).json()) as VerifyResult;
      expect(result.ok).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("verifyRequest: 1 unsigned", () => {
  it("blocks a request without signature headers", async () => {
    const { verify } = setup();
    expectBlocked(await verify({ "content-type": "application/json" }), "unsigned", /No Signature or Signature-Input header/);
    expectBlocked(await verify({ signature: " ", "signature-input": "" }), "unsigned");
  });
});

describe("verifyRequest: 2 malformed", () => {
  it("blocks when one of the two headers is missing", async () => {
    const { sign, verify } = setup();
    const { signature, ...withoutSignature } = sign();
    expectBlocked(await verify(withoutSignature), "malformed", /no Signature header/);
    expectBlocked(await verify({ signature }), "malformed", /no Signature-Input header/);
  });

  it("blocks headers that aren't RFC 8941 dictionaries", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify({ ...sign(), "signature-input": "sig1=((" }), "malformed", /Signature-Input isn't a valid structured header/);
    expectBlocked(await verify({ ...sign(), signature: "sig1=:not base64!:" }), "malformed", /Signature header isn't a valid structured header/);
  });

  it("blocks TAP-sample style keyId= (RFC 8941 keys are lowercase)", async () => {
    const { sign, verify } = setup();
    const headers = sign();
    expectBlocked(await verify({ ...headers, "signature-input": headers["signature-input"].replace(";keyid=", ";keyId=") }), "malformed");
  });

  it("blocks a signature under another label", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({}, { label: "sig2" })), "malformed", /no "sig1" signature \(found: sig2\)/);
    const headers = sign();
    expectBlocked(await verify({ ...headers, signature: headers.signature.replace("sig1=", "sig2=") }), "malformed", /no "sig1" entry/);
  });

  it("blocks a Signature that isn't a byte sequence", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify({ ...sign(), signature: 'sig1="c2ln"' }), "malformed", /byte sequence/);
  });

  it("blocks a signature that doesn't cover content-digest", async () => {
    const { sign, verify } = setup();
    const headers = sign({}, { components: ["@method", "@authority", "@path", "content-type"] });
    expectBlocked(await verify(headers), "malformed", /must cover "content-digest"/);
  });

  it("blocks covered components it can't compute", async () => {
    const { sign, verify } = setup();
    const headers = sign();
    const withQuery = headers["signature-input"].replace('"content-digest")', '"content-digest" "@query")');
    expectBlocked(await verify({ ...headers, "signature-input": withQuery }), "malformed", /Unsupported derived component "@query"/);
    const withoutContentType = new Headers(headers);
    withoutContentType.delete("content-type");
    expectBlocked(await verify(withoutContentType), "malformed", /no content-type header/);
  });

  it("blocks a missing parameter", async () => {
    const { sign, verify } = setup();
    const headers = sign({ nonce: "abc" });
    expectBlocked(await verify({ ...headers, "signature-input": headers["signature-input"].replace(';nonce="abc"', "") }), "malformed", /missing the "nonce" parameter/);
  });

  it("blocks bad parameter values", async () => {
    const { sign, verify } = setup();
    const headers = sign();
    const input = headers["signature-input"];
    expectBlocked(await verify({ ...headers, "signature-input": input.replace(`;expires=${NOW + 60}`, `;expires=${NOW - 1}`) }), "malformed", /must be later than "created"/);
    expectBlocked(await verify({ ...headers, "signature-input": input.replace(`;created=${NOW}`, ';created="now"') }), "malformed", /"created" must be an integer/);
    expectBlocked(await verify({ ...headers, "signature-input": input.replace(/;keyid="[^"]+"/, ';keyid=""') }), "malformed", /"keyid" must be/);
  });

  it("blocks algorithms other than ed25519", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({}, { alg: "rsa-pss-sha512" })), "malformed", /alg is "rsa-pss-sha512"; only "ed25519"/);
  });

  it("blocks a browsing (agent-browser-auth) or other tag", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({}, { tag: "agent-browser-auth" })), "malformed", /a browsing signature/);
    expectBlocked(await verify(sign({}, { tag: "web-bot-auth" })), "malformed", /tag is "web-bot-auth"/);
  });

  it("blocks an unusable Content-Digest", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify({ ...sign(), "content-digest": "md5=:AAAA:" }), "malformed", /no sha-256 or sha-512/);
  });
});

describe("verifyRequest: 3 time window", () => {
  it("blocks an expired signature", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({ now: NOW - 61 })), "expired", /expired 1s ago/);
    expectBlocked(await verify(sign({ now: NOW - 3 * 3600 })), "expired", /expired 3 h ago/);
  });

  it("blocks a window longer than MAX_WINDOW_SECONDS", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({ ttlSeconds: 481 })), "expired", /valid for 481s; the limit is 480s/);
  });

  it("blocks a signature created in the future", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({ now: NOW + 90 })), "not_yet_valid", /created 90s in the future \(allowed clock skew: 30s\)/);
    expectBlocked(await verify(sign({ now: NOW + 600 })), "not_yet_valid", /created 10 min in the future/);
    expectBlocked(await verify(sign({ now: NOW + 31 })), "not_yet_valid");
    expect((await verify(sign({ now: NOW + 31 }), { maxSkewSeconds: 60 })).ok).toBe(true);
  });
});

describe("verifyRequest: 4 unknown agent", () => {
  it("blocks a key that isn't in the directory", async () => {
    const { verify } = setup();
    const stranger = generateAgentKeyPair().signer;
    const headers = signRequest({ method: "POST", url: URL_A, body: BODY, signer: stranger, now: NOW });
    expectBlocked(await verify(headers), "unknown_agent", /No verified agent in the directory has keyid/);
  });

  it("blocks an agent that isn't verified (revoked)", async () => {
    const { sign, agent } = setup();
    const headers = new Headers(sign());
    const base = { method: "POST", url: URL_A, headers, body: BODY, nonces: memoryNonceStore(), now: NOW };
    const revoked = { ...agent, verified: false };
    expectBlocked(await verifyRequest({ ...base, directory: memoryDirectory([revoked]) }), "unknown_agent");
    const custom: AgentDirectory = { lookup: async () => revoked };
    expectBlocked(await verifyRequest({ ...base, directory: custom }), "unknown_agent", /isn't verified/);
  });

  it("blocks when the directory key is broken", async () => {
    const { sign, agent } = setup();
    const broken = { ...agent, publicJwk: { ...agent.publicJwk, x: "nope" } };
    const result = await verifyRequest({
      method: "POST",
      url: URL_A,
      headers: new Headers(sign()),
      body: BODY,
      directory: { lookup: async () => broken },
      nonces: memoryNonceStore(),
      now: NOW,
    });
    expectBlocked(result, "unknown_agent", /no valid Ed25519 public key/);
  });
});

describe("verifyRequest: 5 bad signature", () => {
  it("blocks a tampered signature", async () => {
    const { sign, verify } = setup();
    const headers = sign();
    expectBlocked(await verify({ ...headers, signature: tamper(headers.signature) }), "bad_signature", /doesn't match this request/);
  });

  it("blocks a forgery: someone else's key under our keyid", async () => {
    const { verify, agent } = setup();
    const forger = { keyId: agent.keyId, privateKey: generateAgentKeyPair().signer.privateKey };
    const headers = signRequest({ method: "POST", url: URL_A, body: BODY, signer: forger, now: NOW });
    expectBlocked(await verify(headers), "bad_signature", /under Open Sign Shopper's key/);
  });

  it("blocks a truncated signature", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify({ ...sign(), signature: `sig1=:${Buffer.alloc(32).toString("base64")}:` }), "bad_signature", /32 bytes/);
  });

  it("blocks an edited body whose Content-Digest was recomputed (the digest is signed)", async () => {
    const { sign, verify } = setup();
    const edited = order(1);
    expectBlocked(await verify({ ...sign(), "content-digest": contentDigest(edited) }, { body: edited }), "bad_signature");
  });

  it("blocks a changed method or content-type", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign(), { method: "PUT" }), "bad_signature", /\(PUT open-sign\.example/);
    expectBlocked(await verify({ ...sign(), "content-type": "text/plain" }), "bad_signature");
  });

  it("blocks a signature made for another path (another shop's order endpoint)", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({ url: URL_A }), { url: URL_B }), "bad_signature", /POST open-sign\.example\/api\/shops\/pho-hoa\/orders/);
  });

  it("blocks a signature made for another authority", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign({ url: "https://evil.example/api/shops/mais-bakery/orders" })), "bad_signature");
  });

  it("names the other authority (wrong_target) when Host / X-Forwarded-Host shows where it was sent", async () => {
    const { sign, verify } = setup();
    const headers = sign({ url: "https://evil.example/api/shops/mais-bakery/orders" });
    expectBlocked(await verify({ ...headers, host: "evil.example" }), "wrong_target", /Signed for evil\.example, but this endpoint is open-sign\.example/);
    expectBlocked(await verify({ ...headers, "x-forwarded-host": "EVIL.example:443" }), "wrong_target", /Signed for evil\.example/);
    // Same Host trick, but the signature is also for another path: still just a bad signature.
    expectBlocked(await verify({ ...headers, host: "evil.example" }, { url: URL_B }), "bad_signature");
  });
});

describe("verifyRequest: 6 digest mismatch", () => {
  it("blocks an edited amount", async () => {
    const { sign, verify } = setup();
    expectBlocked(await verify(sign(), { body: order(1) }), "digest_mismatch", /changed after Open Sign Shopper signed it/);
  });
});

describe("verifyRequest: 7 replay", () => {
  it("blocks the same signed request the second time", async () => {
    const { sign, verify } = setup();
    const headers = sign({ nonce: "once" });
    expect((await verify(headers)).ok).toBe(true);
    expectBlocked(await verify(headers, { now: NOW + 10 }), "replayed", /Nonce "once" was already used/);
  });

  it("blocks a fresh signature that reuses a nonce", async () => {
    const { sign, verify } = setup();
    expect((await verify(sign({ nonce: "dup" }))).ok).toBe(true);
    expectBlocked(await verify(sign({ nonce: "dup", now: NOW + 5 }), { now: NOW + 5 }), "replayed");
  });
});

describe("verifyRequest: check order", () => {
  it("never touches the directory or nonces for unsigned / malformed / expired requests", async () => {
    const { sign, directory, nonces } = setup();
    const dir = spyDirectory(directory);
    const store = spyNonces(nonces);
    const run = (headers: HeadersInit) =>
      verifyRequest({ method: "POST", url: URL_A, headers: new Headers(headers), body: BODY, directory: dir, nonces: store, now: NOW });
    expectBlocked(await run({}), "unsigned");
    expectBlocked(await run(sign({}, { tag: "agent-browser-auth" })), "malformed");
    expectBlocked(await run(signRequest({ method: "POST", url: URL_A, body: BODY, signer: generateAgentKeyPair().signer, now: NOW - 600 })), "expired");
    expect(dir.lookup).not.toHaveBeenCalled();
    expect(store.consume).not.toHaveBeenCalled();
  });

  it("only consumes the nonce after the signature and digest check out", async () => {
    const { sign, directory, nonces, agent } = setup();
    const store = spyNonces(nonces);
    const headers = sign({ nonce: "keep-me" });
    const run = (h: HeadersInit, body = BODY) =>
      verifyRequest({ method: "POST", url: URL_A, headers: new Headers(h), body, directory, nonces: store, now: NOW });
    expectBlocked(await run({ ...headers, signature: tamper(headers.signature) }), "bad_signature");
    expectBlocked(await run(headers, order(1)), "digest_mismatch");
    expect(store.consume).not.toHaveBeenCalled();
    // The attacker's failed attempts didn't burn the agent's nonce:
    expect((await run(headers)).ok).toBe(true);
    expect(store.consume).toHaveBeenCalledTimes(1);
    expect(store.consume).toHaveBeenCalledWith("keep-me", agent.keyId, new Date((NOW + 60) * 1000));
  });

  it("reports a bad signature before a replayed nonce", async () => {
    const { sign, verify } = setup();
    const headers = sign({ nonce: "n" });
    expect((await verify(headers)).ok).toBe(true);
    expectBlocked(await verify({ ...headers, signature: tamper(headers.signature) }), "bad_signature");
  });

  it("reports expiry before replay", async () => {
    const { sign, verify } = setup();
    const headers = sign({ nonce: "late" });
    expect((await verify(headers)).ok).toBe(true);
    expectBlocked(await verify(headers, { now: NOW + 61 }), "expired");
  });

  it("propagates directory failures instead of guessing (fail closed)", async () => {
    const { sign } = setup();
    const failing: AgentDirectory = {
      lookup: async () => {
        throw new Error("db down");
      },
    };
    await expect(
      verifyRequest({ method: "POST", url: URL_A, headers: new Headers(sign()), body: BODY, directory: failing, nonces: memoryNonceStore(), now: NOW }),
    ).rejects.toThrow("db down");
  });

  it("throws on a caller bug (relative url)", async () => {
    const { sign, directory, nonces } = setup();
    await expect(
      verifyRequest({ method: "POST", url: "/api/shops/x/orders", headers: new Headers(sign()), body: BODY, directory, nonces, now: NOW }),
    ).rejects.toThrow(TypeError);
  });
});
