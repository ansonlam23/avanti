import { isInnerList, parseDictionary, serializeInnerList, serializeString, type Dictionary, type Parameters } from "structured-headers";
import { SIGNATURE_LABEL } from "./constants";

// RFC 9421 mechanics, independent of Open Sign's policy (that lives in verify.ts):
// derived components (§2.2), field components (§2.1), the signature base (§2.5)
// and parsing Signature-Input (§4.1) with RFC 8941 structured fields.

/** A Signature-Input / signature base problem. The message is safe to show in the agent log. */
export class SignatureFormatError extends Error {
  override name = "SignatureFormatError";
}

export interface HttpRequestParts {
  method: string;
  url: string | URL;
  headers: Headers;
}

export interface ParsedSignatureInput {
  label: string;
  /** Covered component names, in the signer's order. */
  components: string[];
  /** Signature parameters (created, expires, keyid, …) as parsed. */
  params: Parameters;
  /** The `@signature-params` value: the parsed inner list re-serialized (RFC 9421 §3.2 step 7). */
  signatureParams: string;
}

const DERIVED_COMPONENTS = new Set(["@method", "@authority", "@path"]);
const METHOD = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/; // RFC 9110 token
const FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/; // lowercase token (RFC 9421 §2.1)
const ASCII_VALUE = /^[\t\x20-\x7e]*$/;

/** True for the derived components we can compute and for lowercase HTTP field names. */
export function isSupportedComponent(name: string): boolean {
  return name.startsWith("@") ? DERIVED_COMPONENTS.has(name) : FIELD_NAME.test(name);
}

export function isByteSequence(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer || Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

/** Parses an absolute http(s) URL; throws TypeError otherwise (a caller bug, not a bad request). */
export function parseHttpUrl(url: string | URL): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(`Expected an absolute URL, got ${JSON.stringify(String(url))}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError(`Expected an http(s) URL, got ${JSON.stringify(parsed.protocol)}`);
  }
  return parsed;
}

/**
 * The value of one covered component (RFC 9421 §2.1 / §2.2):
 * - `@method`: the method, uppercased
 * - `@authority`: lowercase host[:port], default port omitted (RFC 9110 §4.2.3; WHATWG URL does this)
 * - `@path`: the absolute path, still percent-encoded, without the query; "" becomes "/"
 * - field names: the header value (multiple instances already joined with ", " by `Headers`)
 */
export function componentValue(name: string, request: HttpRequestParts): string {
  const url = parseHttpUrl(request.url);
  let value: string;
  if (name === "@method") {
    if (!METHOD.test(request.method)) throw new SignatureFormatError(`${JSON.stringify(request.method)} isn't an HTTP method`);
    value = request.method.toUpperCase();
  } else if (name === "@authority") {
    value = url.host;
  } else if (name === "@path") {
    value = url.pathname || "/";
  } else if (name.startsWith("@")) {
    throw new SignatureFormatError(`Unsupported derived component ${JSON.stringify(name)}.`);
  } else {
    if (!FIELD_NAME.test(name)) throw new SignatureFormatError(`${JSON.stringify(name)} isn't a lowercase header name.`);
    const header = request.headers.get(name);
    if (header === null) throw new SignatureFormatError(`The signature covers ${name}, but the request has no ${name} header.`);
    value = header;
  }
  if (!ASCII_VALUE.test(value)) throw new SignatureFormatError(`The value of ${name} contains non-ASCII characters.`);
  return value;
}

/**
 * RFC 9421 §2.5 signature base: one `"<name>": <value>` line per covered component, in order,
 * then `"@signature-params": <signatureParams>`. Lines are joined with "\n"; no trailing newline.
 */
export function buildSignatureBase(request: HttpRequestParts, components: readonly string[], signatureParams: string): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const name of components) {
    if (name === "@signature-params") throw new SignatureFormatError(`"@signature-params" can't be a covered component.`);
    if (seen.has(name)) throw new SignatureFormatError(`${JSON.stringify(name)} is covered twice.`);
    seen.add(name);
    lines.push(`${serializeString(name)}: ${componentValue(name, request)}`);
  }
  lines.push(`"@signature-params": ${signatureParams}`);
  return lines.join("\n");
}

/** Parses the `label` member of a Signature-Input header. Throws SignatureFormatError. */
export function parseSignatureInput(header: string, label: string = SIGNATURE_LABEL): ParsedSignatureInput {
  let dictionary: Dictionary;
  try {
    dictionary = parseDictionary(header);
  } catch (error) {
    throw new SignatureFormatError(`Signature-Input isn't a valid structured header (RFC 8941): ${errorText(error)}.`);
  }
  const member = dictionary.get(label);
  if (member === undefined) {
    throw new SignatureFormatError(`Signature-Input has no ${JSON.stringify(label)} signature${foundLabels(dictionary)}.`);
  }
  if (!isInnerList(member)) {
    throw new SignatureFormatError(`Signature-Input ${JSON.stringify(label)} must be a list of covered components, like ("@method" "@path").`);
  }
  const [items, params] = member;
  const components: string[] = [];
  for (const [value, componentParams] of items) {
    if (typeof value !== "string") {
      throw new SignatureFormatError(`Covered components must be quoted strings, like "@method".`);
    }
    if (componentParams.size > 0) {
      const first = componentParams.keys().next().value;
      throw new SignatureFormatError(`Component parameters (like ;${first} on ${JSON.stringify(value)}) aren't supported.`);
    }
    components.push(value);
  }
  let signatureParams: string;
  try {
    signatureParams = serializeInnerList(member);
  } catch {
    throw new SignatureFormatError(`Signature-Input ${JSON.stringify(label)} can't be re-serialized as an RFC 8941 inner list.`);
  }
  return { label, components, params, signatureParams };
}

/** Recomputes the signature base of a signed request (handy for debugging and demos). */
export function signatureBase(request: HttpRequestParts, label: string = SIGNATURE_LABEL): string {
  const header = request.headers.get("signature-input");
  if (header === null) throw new SignatureFormatError("The request has no Signature-Input header.");
  const parsed = parseSignatureInput(header, label);
  return buildSignatureBase(request, parsed.components, parsed.signatureParams);
}

/** " (found: sig2, sig3)" for error messages; labels are attacker-controlled, so keep it short. */
export function foundLabels(dictionary: Dictionary): string {
  const labels = [...dictionary.keys()];
  if (labels.length === 0) return "";
  const shown = labels.slice(0, 3).map((l) => (l.length > 20 ? `${l.slice(0, 19)}…` : l));
  return ` (found: ${shown.join(", ")}${labels.length > 3 ? ", …" : ""})`;
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Parse error:\s*/i, "").replace(/\.$/, "");
}
