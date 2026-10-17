import { createHash, timingSafeEqual } from "node:crypto";
import { isInnerList, parseDictionary, type Dictionary } from "structured-headers";
import { isByteSequence, SignatureFormatError } from "./signature-base";

// RFC 9530 Content-Digest. The digest is over the raw body bytes (UTF-8 of the
// string we send / `await req.text()` on the server), so editing a single
// character of the JSON (e.g. the amount) changes it.

/** Digest algorithms we can check: RFC 9530 key → node:crypto hash. */
const ALGORITHMS = new Map([
  ["sha-256", "sha256"],
  ["sha-512", "sha512"],
]);

/** `sha-256=:<base64>:` for the body (RFC 9530 §2). */
export function contentDigest(body: string): string {
  return `sha-256=:${createHash("sha256").update(body, "utf8").digest("base64")}:`;
}

/**
 * Parses a Content-Digest header into { algorithm → digest bytes }, keeping the
 * algorithms we support (unknown ones are ignored, per RFC 9530 §2).
 * Throws SignatureFormatError if it isn't a dictionary or has no supported digest.
 */
export function parseContentDigest(header: string): Map<string, Buffer> {
  let dictionary: Dictionary;
  try {
    dictionary = parseDictionary(header);
  } catch {
    throw new SignatureFormatError("Content-Digest isn't a valid structured header (expected sha-256=:<base64>:).");
  }
  const digests = new Map<string, Buffer>();
  for (const [algorithm, member] of dictionary) {
    if (!ALGORITHMS.has(algorithm)) continue;
    if (isInnerList(member) || !isByteSequence(member[0])) {
      throw new SignatureFormatError(`Content-Digest ${algorithm} must be a byte sequence (:base64:).`);
    }
    digests.set(algorithm, Buffer.from(member[0]));
  }
  if (digests.size === 0) throw new SignatureFormatError("Content-Digest has no sha-256 or sha-512 digest.");
  return digests;
}

/** True if every supported digest in the header matches the body. */
export function digestMatches(digests: Map<string, Buffer>, body: string): boolean {
  if (digests.size === 0) return false;
  for (const [algorithm, claimed] of digests) {
    const hash = ALGORITHMS.get(algorithm);
    if (!hash) return false;
    const actual = createHash(hash).update(body, "utf8").digest();
    if (claimed.length !== actual.length || !timingSafeEqual(claimed, actual)) return false;
  }
  return true;
}
