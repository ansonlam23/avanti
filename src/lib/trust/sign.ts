import { randomBytes, sign } from "node:crypto";
import { serializeDictionary, serializeInnerList, type BareItem, type Dictionary, type InnerList, type Item } from "structured-headers";
import { COVERED_COMPONENTS, DEFAULT_TTL_SECONDS, SIGNATURE_ALG, SIGNATURE_LABEL, SIGNATURE_TAG } from "./constants";
import { contentDigest } from "./digest";
import { buildSignatureBase, parseHttpUrl } from "./signature-base";
import type { SignedHeaders, SignInput } from "./types";

/**
 * Deliberate deviations from the Open Sign profile. Only for tests and the bot
 * simulator, which need correctly signed requests that the verifier must still refuse
 * (a browsing tag, a missing component, an RSA alg, another label).
 */
export interface SignOverrides {
  label?: string;
  components?: readonly string[];
  alg?: string;
  tag?: string;
}

/** 32 random bytes, base64url (43 chars). */
export function newNonce(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Signs an agent request: RFC 9530 Content-Digest of the body + an RFC 9421
 * Ed25519 signature labelled `sig1` covering @method, @authority, @path,
 * content-type and content-digest, with created/expires/keyid/nonce/alg/tag.
 * Send all four returned headers, and the body byte-for-byte as given.
 */
export function signRequest(input: SignInput, overrides: SignOverrides = {}): SignedHeaders {
  const { signer } = input;
  if (signer.privateKey.type !== "private" || signer.privateKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError("signRequest needs an Ed25519 private key.");
  }
  const url = parseHttpUrl(input.url);
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isSafeInteger(ttl) || ttl <= 0) throw new RangeError("ttlSeconds must be a positive integer.");
  const created = Math.floor(input.now ?? Date.now() / 1000);
  const contentType = input.contentType ?? "application/json";
  const digest = contentDigest(input.body);
  const components = overrides.components ?? COVERED_COMPONENTS;

  const signatureParams: InnerList = [
    components.map((name): Item => [name, new Map()]),
    new Map<string, BareItem>([
      ["created", created],
      ["expires", created + ttl],
      ["keyid", signer.keyId],
      ["nonce", input.nonce ?? newNonce()],
      ["alg", overrides.alg ?? SIGNATURE_ALG],
      ["tag", overrides.tag ?? SIGNATURE_TAG],
    ]),
  ];
  const base = buildSignatureBase(
    { method: input.method, url, headers: new Headers({ "content-type": contentType, "content-digest": digest }) },
    components,
    serializeInnerList(signatureParams),
  );
  const signature = sign(null, Buffer.from(base, "utf8"), signer.privateKey);

  const label = overrides.label ?? SIGNATURE_LABEL;
  const signatureItem: Item = [signature, new Map()];
  const signatureInput: Dictionary = new Map<string, InnerList>([[label, signatureParams]]);
  const signatureValue: Dictionary = new Map<string, Item>([[label, signatureItem]]);
  return {
    "content-type": contentType,
    "content-digest": digest,
    "signature-input": serializeDictionary(signatureInput),
    signature: serializeDictionary(signatureValue),
  };
}
