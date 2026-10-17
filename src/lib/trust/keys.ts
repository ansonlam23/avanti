import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import type { AgentSigner, Ed25519PublicJwk } from "./types";

// Ed25519 keys (node:crypto), RFC 7638 thumbprints as key ids, and the env
// format written by `pnpm keys:agent` (scripts/agent-key.ts):
//   AGENT_KEY_ID              RFC 7638 thumbprint (base64url SHA-256)
//   AGENT_ED25519_PRIVATE_KEY base64 of the PKCS#8 DER private key, one line
//   AGENT_ED25519_PUBLIC_KEY  base64url raw 32-byte public key (JWK "x")

const JWK_X = /^[A-Za-z0-9_-]{43}$/;

/** RFC 7638 JWK thumbprint of an Ed25519 public key → base64url. Used as the agent's key id. */
export function jwkThumbprint(x: string): string {
  // Required members only (RFC 8037 §2), in lexicographic order, no whitespace (RFC 7638 §3.2).
  const canonical = JSON.stringify({ crv: "Ed25519", kty: "OKP", x });
  return createHash("sha256").update(canonical, "utf8").digest("base64url");
}

export function isEd25519PublicJwk(value: unknown): value is Ed25519PublicJwk {
  if (typeof value !== "object" || value === null) return false;
  const jwk = value as Record<string, unknown>;
  return (
    jwk.kty === "OKP" &&
    jwk.crv === "Ed25519" &&
    typeof jwk.x === "string" &&
    JWK_X.test(jwk.x) &&
    Buffer.from(jwk.x, "base64url").length === 32
  );
}

/** Imports an Ed25519 public JWK. Throws TypeError if it isn't one. */
export function publicKeyFromJwk(jwk: Ed25519PublicJwk): KeyObject {
  if (!isEd25519PublicJwk(jwk)) throw new TypeError("Not an Ed25519 public JWK ({ kty: OKP, crv: Ed25519, x }).");
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x }, format: "jwk" });
}

/** The public JWK of an Ed25519 key (private or public KeyObject). */
export function publicJwkFromKey(key: KeyObject): Ed25519PublicJwk {
  const publicKey = key.type === "private" ? createPublicKey(key) : key;
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError(`Expected an Ed25519 key, got ${publicKey.asymmetricKeyType ?? key.type}.`);
  }
  const { x } = publicKey.export({ format: "jwk" });
  if (typeof x !== "string") throw new TypeError("Could not export the Ed25519 public key.");
  return { kty: "OKP", crv: "Ed25519", x };
}

/** A fresh Ed25519 key pair whose key id is its RFC 7638 thumbprint. */
export function generateAgentKeyPair(): { signer: AgentSigner; publicJwk: Ed25519PublicJwk } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicJwk = publicJwkFromKey(publicKey);
  return { signer: { keyId: jwkThumbprint(publicJwk.x), privateKey }, publicJwk };
}

/**
 * Reads AGENT_KEY_ID + AGENT_ED25519_PRIVATE_KEY from process.env.
 * Throws (without ever echoing the private key) if they're missing, not an
 * Ed25519 PKCS#8 key, or the key id isn't that key's thumbprint.
 */
export function loadAgentSignerFromEnv(): AgentSigner {
  const keyId = (process.env.AGENT_KEY_ID ?? "").trim();
  const encoded = (process.env.AGENT_ED25519_PRIVATE_KEY ?? "").trim();
  if (!keyId || !encoded) {
    throw new Error("The agent signing key isn't configured: set AGENT_KEY_ID and AGENT_ED25519_PRIVATE_KEY (run `pnpm keys:agent`).");
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" });
  } catch {
    throw new Error("AGENT_ED25519_PRIVATE_KEY isn't a base64 PKCS#8 (DER) private key (run `pnpm keys:agent`).");
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`AGENT_ED25519_PRIVATE_KEY holds a ${privateKey.asymmetricKeyType ?? "non-Ed25519"} key; the agent needs an Ed25519 key.`);
  }
  const thumbprint = jwkThumbprint(publicJwkFromKey(privateKey).x);
  if (keyId !== thumbprint) {
    throw new Error(`AGENT_KEY_ID doesn't match the private key: its RFC 7638 thumbprint is ${thumbprint}.`);
  }
  return { keyId, privateKey };
}
