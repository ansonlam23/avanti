// Cybersource REST "HTTP Signature" authentication (shared-secret key).
// Written from the developer guide (Getting Started with REST → Construct
// Messages Using HTTP Signature Security, steps 3A–3D):
//
//   digest    = "SHA-256=" + base64(sha256(utf8 body))           (not for GET)
//   signing   = "host: <host>\n" + "date: <RFC 7231 date>\n" +
//               "request-target: <lowercase method> <path>\n" +
//               "digest: <digest>\n" + "v-c-merchant-id: <merchant id>"
//               (one "name: value" line per signed header, joined by "\n",
//                no trailing newline; request-target WITHOUT parentheses)
//   signature = base64(HMAC-SHA256(signing, base64decode(shared secret)))
//   header    = keyid="<key id>", algorithm="HmacSHA256",
//               headers="host date request-target digest v-c-merchant-id",
//               signature="<signature>"
//
// The guide names the date header `v-c-date` in one table and `date` in the
// signing string, so we send both (same value) and sign it as `date`.
// Pure and deterministic given (date, body, secret). Never log the secret.

import { createHash, createHmac } from "node:crypto";

export const SIGNATURE_ALGORITHM = "HmacSHA256";
const HEADERS_WITH_BODY = ["host", "date", "request-target", "digest", "v-c-merchant-id"] as const;
const HEADERS_WITHOUT_BODY = ["host", "date", "request-target", "v-c-merchant-id"] as const;

export interface HttpSignatureInput {
  method: string; // "POST", "GET", …
  host: string; // e.g. "apitest.cybersource.com" (must equal the request's Host)
  path: string; // e.g. "/pts/v2/payments" (exactly as sent, incl. any query)
  body?: string; // exact text that will be sent; required unless GET/DELETE
  merchantId: string;
  keyId: string;
  sharedSecret: string; // base64, as issued in the Business Center
  date: Date;
}

export interface HttpSignatureHeaders {
  host: string;
  date: string;
  "v-c-date": string;
  "v-c-merchant-id": string;
  digest?: string;
  signature: string;
}

/** RFC 7231 IMF-fixdate, e.g. "Thu, 18 Jul 2019 00:18:03 GMT". */
export function httpDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("httpDate: invalid date");
  return date.toUTCString();
}

/** `digest` header value: "SHA-256=" + base64 of the SHA-256 of the UTF-8 body. */
export function bodyDigest(body: string): string {
  return `SHA-256=${createHash("sha256").update(body, "utf8").digest("base64")}`;
}

function hasBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "DELETE" && m !== "HEAD";
}

/** Decode the Business Center shared secret (base64) into HMAC key bytes. */
export function decodeSharedSecret(sharedSecret: string): Buffer {
  const s = sharedSecret.trim();
  if (!s || !/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4 === 1) {
    throw new Error("Visa shared secret is not valid base64 (copy it again from the Business Center)");
  }
  const key = Buffer.from(s, "base64");
  if (key.length === 0) throw new Error("Visa shared secret decodes to zero bytes");
  return key;
}

export interface SigningParts {
  host: string;
  date: string;
  requestTarget: string; // "post /pts/v2/payments"
  digest?: string;
  merchantId: string;
}

/** The exact string that gets HMAC'd. Header order is fixed and matches `headers=`. */
export function signingString(parts: SigningParts): string {
  const lines = [`host: ${parts.host}`, `date: ${parts.date}`, `request-target: ${parts.requestTarget}`];
  if (parts.digest !== undefined) lines.push(`digest: ${parts.digest}`);
  lines.push(`v-c-merchant-id: ${parts.merchantId}`);
  return lines.join("\n");
}

/** Build every auth header Cybersource needs for one request. */
export function signHttpRequest(input: HttpSignatureInput): HttpSignatureHeaders {
  const { host, merchantId, keyId } = input;
  if (!host || /[\s/]/.test(host)) throw new Error("signHttpRequest: host must be a bare host name");
  if (!input.path.startsWith("/")) throw new Error("signHttpRequest: path must start with '/'");
  if (!merchantId || !keyId) throw new Error("signHttpRequest: merchantId and keyId are required");

  const withBody = hasBody(input.method);
  if (withBody && input.body === undefined) {
    throw new Error(`signHttpRequest: ${input.method.toUpperCase()} needs the exact body text`);
  }
  const date = httpDate(input.date);
  const digest = withBody ? bodyDigest(input.body ?? "") : undefined;
  const requestTarget = `${input.method.toLowerCase()} ${input.path}`;
  const text = signingString({ host, date, requestTarget, digest, merchantId });
  const signature = createHmac("sha256", decodeSharedSecret(input.sharedSecret))
    .update(text, "utf8")
    .digest("base64");
  const signed = (withBody ? HEADERS_WITH_BODY : HEADERS_WITHOUT_BODY).join(" ");

  const headers: HttpSignatureHeaders = {
    host,
    date,
    "v-c-date": date,
    "v-c-merchant-id": merchantId,
    signature: `keyid="${keyId}", algorithm="${SIGNATURE_ALGORITHM}", headers="${signed}", signature="${signature}"`,
  };
  if (digest !== undefined) headers.digest = digest;
  return headers;
}
