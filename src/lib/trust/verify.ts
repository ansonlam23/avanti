import { verify, type KeyObject } from "node:crypto";
import { isInnerList, parseDictionary, type Dictionary } from "structured-headers";
import type { BlockReason } from "@/lib/types";
import {
  COVERED_COMPONENTS,
  DEFAULT_MAX_SKEW_SECONDS,
  MAX_WINDOW_SECONDS,
  REQUIRED_PARAMS,
  SIGNATURE_ALG,
  SIGNATURE_LABEL,
  SIGNATURE_TAG,
} from "./constants";
import { digestMatches, parseContentDigest } from "./digest";
import { publicKeyFromJwk } from "./keys";
import {
  buildSignatureBase,
  foundLabels,
  isByteSequence,
  parseHttpUrl,
  parseSignatureInput,
  SignatureFormatError,
  type ParsedSignatureInput,
} from "./signature-base";
import type { VerifyInput, VerifyResult } from "./types";

/** Longest keyid / nonce accepted (a thumbprint is 43 chars, a TAP-style nonce ~88). */
const MAX_PARAM_LENGTH = 256;
const BROWSING_TAG = "agent-browser-auth";

/**
 * Verifies a TAP-style signed agent request (CONTRACTS.md §7). Checks run cheap →
 * expensive, and the nonce is only recorded once the signature and body check out:
 *   1 unsigned · 2 malformed · 3 expired / not_yet_valid · 4 unknown_agent ·
 *   5 bad_signature (or wrong_target) · 6 digest_mismatch · 7 replayed
 * Never throws for a bad request; it only throws if the directory / nonce store
 * fails (fail closed) or `url` isn't an absolute http(s) URL (a caller bug).
 */
export async function verifyRequest(input: VerifyInput): Promise<VerifyResult> {
  const now = Math.floor(input.now ?? Date.now() / 1000);
  const skew = input.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS;
  const url = parseHttpUrl(input.url);
  const { headers } = input;

  // 1. Unsigned
  const signatureInputHeader = nonEmpty(headers.get("signature-input"));
  const signatureHeader = nonEmpty(headers.get("signature"));
  if (signatureInputHeader === null && signatureHeader === null) {
    return blocked("unsigned", "No Signature or Signature-Input header: this request isn't signed by an agent.");
  }
  if (signatureInputHeader === null) return blocked("malformed", "There's a Signature header but no Signature-Input header.");
  if (signatureHeader === null) return blocked("malformed", "There's a Signature-Input header but no Signature header.");

  // 2. Malformed: structure, covered components, parameters, alg, tag
  const parsed = parseSignature(signatureInputHeader, signatureHeader, { method: input.method, url, headers });
  if (!parsed.ok) return blocked("malformed", parsed.detail);
  const { created, expires, keyId, nonce, signature } = parsed;

  // 3. Time window
  if (now > expires) return blocked("expired", `The signature expired ${duration(now - expires)} ago.`);
  if (expires - created > MAX_WINDOW_SECONDS) {
    return blocked("expired", `The signature is valid for ${expires - created}s; the limit is ${MAX_WINDOW_SECONDS}s.`);
  }
  if (created > now + skew) {
    return blocked("not_yet_valid", `The signature was created ${duration(created - now)} in the future (allowed clock skew: ${skew}s).`);
  }

  // 4. Agent directory
  const agent = await input.directory.lookup(keyId);
  if (agent === null) return blocked("unknown_agent", `No verified agent in the directory has keyid ${show(keyId)}.`);
  if (!agent.verified) return blocked("unknown_agent", `Agent ${show(agent.name)} is in the directory but isn't verified.`);
  let publicKey: KeyObject;
  try {
    publicKey = publicKeyFromJwk(agent.publicJwk);
  } catch {
    return blocked("unknown_agent", `The directory has no valid Ed25519 public key for agent ${show(agent.name)}.`);
  }

  // 5. Ed25519 signature over the RFC 9421 signature base of *this* request
  if (signature.length !== 64) {
    return blocked("bad_signature", `The signature is ${signature.length} bytes; Ed25519 signatures are 64 bytes.`);
  }
  if (!ed25519Verifies(parsed.base, publicKey, signature)) {
    // RFC 9421 never sends the signed values, so a signature made for another host looks
    // forged. If the request's own Host / X-Forwarded-Host names a host the signature
    // *does* verify for, it was addressed elsewhere: say so precisely.
    const signedFor = addressedHosts(url, headers).find((host) => {
      try {
        const elsewhere = new URL(`${url.protocol}//${host}${url.pathname}${url.search}`);
        const base = buildSignatureBase({ method: input.method, url: elsewhere, headers }, parsed.components, parsed.signatureParams);
        return ed25519Verifies(base, publicKey, signature);
      } catch {
        return false;
      }
    });
    if (signedFor) return blocked("wrong_target", `Signed for ${signedFor}, but this endpoint is ${url.host}.`);
    return blocked(
      "bad_signature",
      `The signature doesn't match this request (${input.method.toUpperCase()} ${url.host}${url.pathname}) under ${agent.name}'s key: it was forged, altered, or made for a different request.`,
    );
  }

  // 6. Body vs. the (signed) Content-Digest: catches an edited amount
  if (!digestMatches(parsed.digests, input.body)) {
    return blocked("digest_mismatch", `The body doesn't match its signed Content-Digest: it was changed after ${agent.name} signed it.`);
  }

  // 7. Nonce: first use only (recorded until the signature expires)
  if (!(await input.nonces.consume(nonce, keyId, new Date(expires * 1000)))) {
    return blocked("replayed", `Nonce ${show(nonce)} was already used: this is a replay of an earlier request.`);
  }
  return { ok: true, agent, keyId, nonce, created, expires };
}

type ParsedSignature =
  | { ok: false; detail: string }
  | {
      ok: true;
      components: string[];
      signatureParams: string;
      base: string;
      signature: Buffer;
      digests: Map<string, Buffer>;
      created: number;
      expires: number;
      keyId: string;
      nonce: string;
    };

function parseSignature(
  signatureInputHeader: string,
  signatureHeader: string,
  request: { method: string; url: URL; headers: Headers },
): ParsedSignature {
  const fail = (detail: string): ParsedSignature => ({ ok: false, detail });

  let input: ParsedSignatureInput;
  try {
    input = parseSignatureInput(signatureInputHeader, SIGNATURE_LABEL);
  } catch (error) {
    return fail(formatErrorText(error));
  }

  let signatures: Dictionary;
  try {
    signatures = parseDictionary(signatureHeader);
  } catch {
    return fail("The Signature header isn't a valid structured header (RFC 8941).");
  }
  const entry = signatures.get(SIGNATURE_LABEL);
  if (entry === undefined) return fail(`The Signature header has no ${show(SIGNATURE_LABEL)} entry${foundLabels(signatures)}.`);
  if (isInnerList(entry) || !isByteSequence(entry[0])) return fail(`Signature ${show(SIGNATURE_LABEL)} must be a byte sequence (:base64:).`);

  const { components, params } = input;
  const missing = COVERED_COMPONENTS.filter((name) => !components.includes(name));
  if (missing.length > 0) {
    return fail(`The signature must cover ${quoteAll(missing)}; it covers ${components.length ? quoteAll(components) : "nothing"}.`);
  }

  // Also validates every covered component (supported, unique, present, ASCII).
  let base: string;
  try {
    base = buildSignatureBase(request, components, input.signatureParams);
  } catch (error) {
    return fail(formatErrorText(error));
  }

  const absent = REQUIRED_PARAMS.find((name) => !params.has(name));
  if (absent) return fail(`Signature-Input is missing the ${show(absent)} parameter.`);
  const created = params.get("created");
  const expires = params.get("expires");
  const keyId = params.get("keyid");
  const nonce = params.get("nonce");
  const alg = params.get("alg");
  const tag = params.get("tag");
  if (!isTimestamp(created)) return fail(`"created" must be an integer UNIX timestamp.`);
  if (!isTimestamp(expires)) return fail(`"expires" must be an integer UNIX timestamp.`);
  if (expires <= created) return fail(`"expires" (${expires}) must be later than "created" (${created}).`);
  if (!isShortString(keyId)) return fail(`"keyid" must be a quoted string of 1–${MAX_PARAM_LENGTH} characters.`);
  if (!isShortString(nonce)) return fail(`"nonce" must be a quoted string of 1–${MAX_PARAM_LENGTH} characters.`);
  if (typeof alg !== "string") return fail(`"alg" must be a quoted string, like "${SIGNATURE_ALG}".`);
  if (alg.toLowerCase() !== SIGNATURE_ALG) return fail(`alg is ${show(alg)}; only "${SIGNATURE_ALG}" is accepted.`);
  if (typeof tag !== "string") return fail(`"tag" must be a quoted string, like "${SIGNATURE_TAG}".`);
  if (tag !== SIGNATURE_TAG) {
    return fail(
      tag === BROWSING_TAG
        ? `tag is "${BROWSING_TAG}" (a browsing signature); placing an order needs "${SIGNATURE_TAG}".`
        : `tag is ${show(tag)}; placing an order needs "${SIGNATURE_TAG}".`,
    );
  }

  let digests: Map<string, Buffer>;
  try {
    digests = parseContentDigest(request.headers.get("content-digest") ?? "");
  } catch (error) {
    return fail(formatErrorText(error));
  }

  return {
    ok: true,
    components,
    signatureParams: input.signatureParams,
    base,
    signature: Buffer.from(entry[0]),
    digests,
    created,
    expires,
    keyId,
    nonce,
  };
}

function ed25519Verifies(base: string, publicKey: KeyObject, signature: Buffer): boolean {
  try {
    return verify(null, Buffer.from(base, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}

/** Hosts the request itself says it was sent to (Host, X-Forwarded-Host) other than `url`'s. */
function addressedHosts(url: URL, headers: Headers): string[] {
  const hosts: string[] = [];
  for (const name of ["host", "x-forwarded-host"]) {
    const raw = headers.get(name)?.split(",")[0]?.trim();
    if (!raw) continue;
    try {
      const host = new URL(`${url.protocol}//${raw}`).host;
      if (host && host !== url.host && !hosts.includes(host)) hosts.push(host);
    } catch {
      // not a host; ignore
    }
  }
  return hosts;
}

function blocked(reason: BlockReason, detail: string): VerifyResult {
  return { ok: false, reason, detail };
}

function nonEmpty(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_PARAM_LENGTH;
}

/** Bad input must end in a block, never a 500: unexpected errors become a generic detail. */
function formatErrorText(error: unknown): string {
  return error instanceof SignatureFormatError ? error.message : "The signature headers couldn't be processed.";
}

/** Quoted and shortened: these values come from the (untrusted) request. */
function show(value: string, max = 24): string {
  return JSON.stringify(value.length > max ? `${value.slice(0, max - 1)}…` : value);
}

function quoteAll(names: readonly string[]): string {
  return names.map((name) => show(name)).join(" ");
}

function duration(seconds: number): string {
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 2 * 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 2 * 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}
