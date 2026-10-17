import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateAgentKeyPair,
  isEd25519PublicJwk,
  jwkThumbprint,
  loadAgentSignerFromEnv,
  publicJwkFromKey,
  publicKeyFromJwk,
} from "./keys";

// Keys are generated at runtime. Never commit key material (the repo is public).

/** Same encoding as scripts/agent-key.ts writes to .env.local. */
function envFormat() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const x = (publicKey.export({ format: "jwk" }) as { x: string }).x;
  return { x, keyId: jwkThumbprint(x), pkcs8: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64") };
}

describe("jwkThumbprint (RFC 7638)", () => {
  it("matches RFC 8037 Appendix A.3", () => {
    expect(jwkThumbprint("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo")).toBe("kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k");
  });
});

describe("generateAgentKeyPair", () => {
  it("returns an Ed25519 signer keyed by its thumbprint", () => {
    const { signer, publicJwk } = generateAgentKeyPair();
    expect(signer.privateKey.asymmetricKeyType).toBe("ed25519");
    expect(isEd25519PublicJwk(publicJwk)).toBe(true);
    expect(signer.keyId).toBe(jwkThumbprint(publicJwk.x));
    expect(signer.keyId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(publicJwkFromKey(signer.privateKey)).toEqual(publicJwk);
  });

  it("round-trips through the public JWK", () => {
    const { signer, publicJwk } = generateAgentKeyPair();
    const data = Buffer.from("hello");
    expect(verify(null, data, publicKeyFromJwk(publicJwk), sign(null, data, signer.privateKey))).toBe(true);
  });
});

describe("isEd25519PublicJwk / publicKeyFromJwk", () => {
  it("rejects anything that isn't an Ed25519 public JWK", () => {
    const { publicJwk } = generateAgentKeyPair();
    expect(isEd25519PublicJwk({ ...publicJwk, crv: "X25519" })).toBe(false);
    expect(isEd25519PublicJwk({ ...publicJwk, kty: "EC" })).toBe(false);
    expect(isEd25519PublicJwk({ ...publicJwk, x: publicJwk.x.slice(1) })).toBe(false);
    expect(isEd25519PublicJwk(null)).toBe(false);
    expect(() => publicKeyFromJwk({ ...publicJwk, x: "not-a-key" })).toThrow(TypeError);
  });

  it("refuses to export a non-Ed25519 key", () => {
    const { publicKey } = generateKeyPairSync("x25519");
    expect(() => publicJwkFromKey(publicKey)).toThrow(/Ed25519/);
  });
});

describe("loadAgentSignerFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads the format written by pnpm keys:agent", () => {
    const { x, keyId, pkcs8 } = envFormat();
    vi.stubEnv("AGENT_KEY_ID", keyId);
    vi.stubEnv("AGENT_ED25519_PRIVATE_KEY", pkcs8);
    const signer = loadAgentSignerFromEnv();
    expect(signer.keyId).toBe(keyId);
    const data = Buffer.from("order");
    const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" });
    expect(verify(null, data, publicKey, sign(null, data, signer.privateKey))).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    const { keyId, pkcs8 } = envFormat();
    vi.stubEnv("AGENT_KEY_ID", ` ${keyId}\n`);
    vi.stubEnv("AGENT_ED25519_PRIVATE_KEY", `${pkcs8}\n`);
    expect(loadAgentSignerFromEnv().keyId).toBe(keyId);
  });

  it("explains a missing key", () => {
    vi.stubEnv("AGENT_KEY_ID", "");
    vi.stubEnv("AGENT_ED25519_PRIVATE_KEY", "");
    expect(() => loadAgentSignerFromEnv()).toThrow(/pnpm keys:agent/);
  });

  it("rejects a key id that isn't the key's thumbprint, without echoing the key", () => {
    const { pkcs8 } = envFormat();
    vi.stubEnv("AGENT_KEY_ID", envFormat().keyId);
    vi.stubEnv("AGENT_ED25519_PRIVATE_KEY", pkcs8);
    expect(() => loadAgentSignerFromEnv()).toThrow(/doesn't match/);
    try {
      loadAgentSignerFromEnv();
    } catch (error) {
      expect(String(error)).not.toContain(pkcs8);
    }
  });

  it("rejects garbage and non-Ed25519 keys", () => {
    vi.stubEnv("AGENT_KEY_ID", "k");
    vi.stubEnv("AGENT_ED25519_PRIVATE_KEY", "bm90IGEga2V5");
    expect(() => loadAgentSignerFromEnv()).toThrow(/PKCS#8/);

    const x25519 = generateKeyPairSync("x25519").privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    vi.stubEnv("AGENT_ED25519_PRIVATE_KEY", x25519);
    expect(() => loadAgentSignerFromEnv()).toThrow(/x25519 key/);
  });
});
