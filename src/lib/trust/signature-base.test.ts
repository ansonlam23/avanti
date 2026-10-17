import { createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSignatureBase,
  componentValue,
  parseSignatureInput,
  signatureBase,
  SignatureFormatError,
} from "./signature-base";

// RFC 9421 Appendix B.2 "test-request" (the body isn't part of these bases).
const RFC_REQUEST = {
  method: "POST",
  url: "https://example.com/foo?param=Value&Pet=dog",
  headers: new Headers({
    host: "example.com",
    date: "Tue, 20 Apr 2021 02:07:55 GMT",
    "content-type": "application/json",
    "content-digest":
      "sha-512=:WZDPaVn/7XgHaAy8pmojAkGWoRx2UFChF41A2svX+TaPm+AbwAgBWnrIiYllu7BNNyealdVLvRwEmTHWXvJwew==:",
    "content-length": "18",
  }),
};

// RFC 9421 Appendix B.1.4 test-key-ed25519: PUBLIC half only (JWK "x").
const RFC_ED25519_PUBLIC_X = "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs";

describe("RFC 9421 Appendix B.2.6 (Ed25519)", () => {
  // B.2.6 covers date/@method/@path/@authority/content-type/content-length with only
  // created + keyid, so it can't go through our sig1 profile (which demands
  // content-digest, nonce, alg, tag). Instead it checks the same generic pieces the
  // verifier is built from: Signature-Input parsing, re-serialization, the base, Ed25519.
  const signatureInput =
    'sig-b26=("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"';
  const signature =
    "wqcAqbmYJ2ji2glfAMaRy4gruYYnx2nEFN2HN6jrnDnQCK1u02Gb04v9EDgwUPiu4A0w6vuQv5lIp5WPpBKRCw==";
  const expectedBase = [
    '"date": Tue, 20 Apr 2021 02:07:55 GMT',
    '"@method": POST',
    '"@path": /foo',
    '"@authority": example.com',
    '"content-type": application/json',
    '"content-length": 18',
    '"@signature-params": ("date" "@method" "@path" "@authority" "content-type" "content-length");created=1618884473;keyid="test-key-ed25519"',
  ].join("\n");

  it("parses Signature-Input and rebuilds the RFC's exact signature base", () => {
    const parsed = parseSignatureInput(signatureInput, "sig-b26");
    expect(parsed.components).toEqual(["date", "@method", "@path", "@authority", "content-type", "content-length"]);
    expect(parsed.signatureParams).toBe(signatureInput.slice("sig-b26=".length));
    expect(buildSignatureBase(RFC_REQUEST, parsed.components, parsed.signatureParams)).toBe(expectedBase);
  });

  it("verifies the RFC's signature with the RFC's public key over our base", () => {
    const parsed = parseSignatureInput(signatureInput, "sig-b26");
    const base = buildSignatureBase(RFC_REQUEST, parsed.components, parsed.signatureParams);
    const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: RFC_ED25519_PUBLIC_X }, format: "jwk" });
    expect(verify(null, Buffer.from(base), publicKey, Buffer.from(signature, "base64"))).toBe(true);
    // Any change to the base (here: one more space) breaks it.
    expect(verify(null, Buffer.from(base.replace("POST", "POST ")), publicKey, Buffer.from(signature, "base64"))).toBe(false);
  });

  it("signatureBase() recomputes it straight from the request headers", () => {
    const headers = new Headers(RFC_REQUEST.headers);
    headers.set("signature-input", signatureInput);
    expect(signatureBase({ ...RFC_REQUEST, headers }, "sig-b26")).toBe(expectedBase);
  });
});

describe("RFC 9421 §2.5 Figure 1 (our derived components + content-digest)", () => {
  it("builds the RFC's signature base", () => {
    const components = ["@method", "@authority", "@path", "content-digest", "content-length", "content-type"];
    const params = '("@method" "@authority" "@path" "content-digest" "content-length" "content-type");created=1618884473;keyid="test-key-rsa-pss"';
    expect(buildSignatureBase(RFC_REQUEST, components, params)).toBe(
      [
        '"@method": POST',
        '"@authority": example.com',
        '"@path": /foo',
        '"content-digest": sha-512=:WZDPaVn/7XgHaAy8pmojAkGWoRx2UFChF41A2svX+TaPm+AbwAgBWnrIiYllu7BNNyealdVLvRwEmTHWXvJwew==:',
        '"content-length": 18',
        '"content-type": application/json',
        '"@signature-params": ("@method" "@authority" "@path" "content-digest" "content-length" "content-type");created=1618884473;keyid="test-key-rsa-pss"',
      ].join("\n"),
    );
  });
});

describe("componentValue", () => {
  const at = (url: string, method = "POST", headers = new Headers()) => ({ method, url, headers });

  it("@method is uppercased", () => {
    expect(componentValue("@method", at("https://a.test/", "post"))).toBe("POST");
  });

  it("@authority is lowercase with the default port dropped", () => {
    expect(componentValue("@authority", at("https://Shop.EXAMPLE:443/x"))).toBe("shop.example");
    expect(componentValue("@authority", at("http://shop.example:80/x"))).toBe("shop.example");
    expect(componentValue("@authority", at("http://localhost:3000/x"))).toBe("localhost:3000");
    expect(componentValue("@authority", at("https://shop.example:80/x"))).toBe("shop.example:80");
    expect(componentValue("@authority", at("http://[::1]:3000/x"))).toBe("[::1]:3000");
  });

  it("@path has no query, keeps percent-encoding, and is never empty", () => {
    expect(componentValue("@path", at("https://a.test/api/shops/mais-bakery/orders?x=1#f"))).toBe("/api/shops/mais-bakery/orders");
    expect(componentValue("@path", at("https://a.test/caf%C3%A9"))).toBe("/caf%C3%A9");
    expect(componentValue("@path", at("https://a.test"))).toBe("/");
  });

  it("header fields use the combined field value", () => {
    const headers = new Headers();
    headers.append("x-list", "a");
    headers.append("x-list", "b");
    expect(componentValue("x-list", at("https://a.test/", "GET", headers))).toBe("a, b");
  });

  it("throws SignatureFormatError for missing headers and unsupported components", () => {
    expect(() => componentValue("content-digest", at("https://a.test/"))).toThrow(SignatureFormatError);
    expect(() => componentValue("@query", at("https://a.test/?q"))).toThrow(/Unsupported derived component/);
    expect(() => componentValue("Content-Type", at("https://a.test/"))).toThrow(/lowercase/);
  });
});

describe("buildSignatureBase", () => {
  const request = { method: "GET", url: "https://a.test/p", headers: new Headers({ "content-type": "text/plain" }) };

  it("has one line per component, the params line last and no trailing newline", () => {
    const base = buildSignatureBase(request, ["@method", "content-type"], '("@method" "content-type");created=1');
    expect(base).toBe('"@method": GET\n"content-type": text/plain\n"@signature-params": ("@method" "content-type");created=1');
    expect(base.endsWith("\n")).toBe(false);
  });

  it("rejects duplicate components and @signature-params", () => {
    expect(() => buildSignatureBase(request, ["@method", "@method"], "()")).toThrow(/covered twice/);
    expect(() => buildSignatureBase(request, ["@signature-params"], "()")).toThrow(SignatureFormatError);
  });
});

describe("parseSignatureInput", () => {
  it("re-serializes canonically (optional whitespace dropped)", () => {
    const parsed = parseSignatureInput('sig1=( "@method"  "@path" );created=1; keyid="k"');
    expect(parsed.signatureParams).toBe('("@method" "@path");created=1;keyid="k"');
  });

  it("explains what's wrong", () => {
    expect(() => parseSignatureInput("sig1=(")).toThrow(/valid structured header/);
    expect(() => parseSignatureInput('sig2=("@method");created=1')).toThrow(/no "sig1" signature \(found: sig2\)/);
    expect(() => parseSignatureInput('sig1="@method"')).toThrow(/list of covered components/);
    expect(() => parseSignatureInput("sig1=(method)")).toThrow(/quoted strings/);
    expect(() => parseSignatureInput('sig1=("content-type";sf)')).toThrow(/Component parameters/);
  });
});
