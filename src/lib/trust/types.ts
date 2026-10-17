import type { KeyObject } from "node:crypto";
import type { BlockReason } from "@/lib/types";

// Shapes from CONTRACTS.md §7. Data shapes the DB stores stay snake_case
// (see `agents` table); these are the camelCase code-side shapes.

/** Ed25519 public key as a JWK (RFC 8037). `x` = base64url of the raw 32-byte key. */
export interface Ed25519PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
}

/** The agent's signing identity: key id (RFC 7638 thumbprint) + Ed25519 private key. */
export interface AgentSigner {
  keyId: string;
  privateKey: KeyObject;
}

export interface SignInput {
  method: string;
  /** Absolute http(s) URL the request is sent to (exactly what you pass to fetch). */
  url: string;
  /** Raw body, exactly as it will be sent. */
  body: string;
  /** Defaults to "application/json". */
  contentType?: string;
  signer: AgentSigner;
  /** Unix seconds; defaults to the current time. */
  now?: number;
  /** Signature lifetime; defaults to DEFAULT_TTL_SECONDS. */
  ttlSeconds?: number;
  /** Defaults to 32 random bytes, base64url. */
  nonce?: string;
}

/**
 * Headers to send with the request (all four, unchanged). A type alias rather than an
 * interface so it's assignable to HeadersInit: `fetch(url, { headers: signed })`.
 */
export type SignedHeaders = {
  "content-type": string;
  "content-digest": string;
  "signature-input": string;
  signature: string;
};

export interface DirectoryAgent {
  id: string;
  name: string;
  keyId: string;
  publicJwk: Ed25519PublicJwk;
  verified: boolean;
}

export interface AgentDirectory {
  /** The verified agent for this key id, or null. */
  lookup(keyId: string): Promise<DirectoryAgent | null>;
}

export interface NonceStore {
  /** Records the nonce. Returns true on first use, false if it was already used. */
  consume(nonce: string, keyId: string, expiresAt: Date): Promise<boolean>;
}

export interface VerifyInput {
  method: string;
  /** Absolute URL of the request as received (in a route handler: `req.url`). */
  url: string;
  headers: Headers;
  /** Raw body text exactly as received (`await req.text()`). */
  body: string;
  directory: AgentDirectory;
  nonces: NonceStore;
  /** Unix seconds; defaults to the current time. */
  now?: number;
  /** Allowed clock skew for `created`; defaults to DEFAULT_MAX_SKEW_SECONDS. */
  maxSkewSeconds?: number;
}

export type VerifyResult =
  | { ok: true; agent: DirectoryAgent; keyId: string; nonce: string; created: number; expires: number }
  | { ok: false; reason: BlockReason; detail: string };
