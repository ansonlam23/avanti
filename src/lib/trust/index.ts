// Trust library: TAP-style (Visa Trusted Agent Protocol style) signed agent requests.
// Ed25519 + RFC 9421 HTTP Message Signatures + RFC 9530 Content-Digest + RFC 7638 key ids.
// Pure TypeScript (no server-only, no env module): runs in route handlers, Vitest and tsx scripts.
// Contract: CONTRACTS.md §7.

export {
  COVERED_COMPONENTS,
  DEFAULT_MAX_SKEW_SECONDS,
  DEFAULT_TTL_SECONDS,
  MAX_WINDOW_SECONDS,
  REQUIRED_PARAMS,
  SIGNATURE_ALG,
  SIGNATURE_LABEL,
  SIGNATURE_TAG,
} from "./constants";
export { contentDigest, digestMatches, parseContentDigest } from "./digest";
export {
  generateAgentKeyPair,
  isEd25519PublicJwk,
  jwkThumbprint,
  loadAgentSignerFromEnv,
  publicJwkFromKey,
  publicKeyFromJwk,
} from "./keys";
export { newNonce, signRequest, type SignOverrides } from "./sign";
export {
  buildSignatureBase,
  componentValue,
  isSupportedComponent,
  parseSignatureInput,
  signatureBase,
  SignatureFormatError,
  type HttpRequestParts,
  type ParsedSignatureInput,
} from "./signature-base";
export { memoryDirectory, memoryNonceStore, supabaseDirectory, supabaseNonceStore } from "./stores";
export type {
  AgentDirectory,
  AgentSigner,
  DirectoryAgent,
  Ed25519PublicJwk,
  NonceStore,
  SignedHeaders,
  SignInput,
  VerifyInput,
  VerifyResult,
} from "./types";
export { verifyRequest } from "./verify";
