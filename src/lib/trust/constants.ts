// Protocol constants for avanti's TAP-style signed agent requests
// (Ed25519 + RFC 9421 HTTP Message Signatures + RFC 9530 Content-Digest).
// These are also advertised to agents in /s/<slug>/agent.json → ordering.auth.

/** Signature label in the Signature-Input / Signature dictionaries. */
export const SIGNATURE_LABEL = "sig1";

/**
 * RFC 9421 `tag` parameter. Visa TAP uses "agent-browser-auth" for browsing
 * and "agent-payer-auth" for checkout/payment; placing an order is the latter.
 */
export const SIGNATURE_TAG = "agent-payer-auth";

/** RFC 9421 `alg` value (HTTP Signature Algorithms registry). Accepted case-insensitively. */
export const SIGNATURE_ALG = "ed25519";

/** Every agent order must cover at least these components (signers use this order). */
export const COVERED_COMPONENTS = ["@method", "@authority", "@path", "content-type", "content-digest"] as const;

/** Signature parameters every agent order must carry (signers use this order). */
export const REQUIRED_PARAMS = ["created", "expires", "keyid", "nonce", "alg", "tag"] as const;

/** `expires - created` must be ≤ this (Visa TAP: 8 minutes). */
export const MAX_WINDOW_SECONDS = 480;

/** Default lifetime of a signature made by `signRequest`. */
export const DEFAULT_TTL_SECONDS = 60;

/** How far in the future `created` may be before a request is `not_yet_valid`. */
export const DEFAULT_MAX_SKEW_SECONDS = 30;
