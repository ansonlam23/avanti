import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentDigest, digestMatches, parseContentDigest } from "./digest";

describe("contentDigest (RFC 9530)", () => {
  it("matches the RFC 9530 Appendix B examples", () => {
    // B.1: {"hello": "world"} plus a trailing newline (Content-Length: 19)
    expect(contentDigest('{"hello": "world"}\n')).toBe("sha-256=:RK/0qy18MlBSVnWgjwz6lZEWjP/lF5HF9bvEF8FabDg=:");
    // B.2: empty content
    expect(contentDigest("")).toBe("sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:");
  });

  it("hashes the UTF-8 bytes of the body", () => {
    const body = '{"customer_name":"Phở ☕"}';
    const expected = createHash("sha256").update(Buffer.from(body, "utf8")).digest("base64");
    expect(contentDigest(body)).toBe(`sha-256=:${expected}:`);
  });
});

describe("parseContentDigest + digestMatches", () => {
  it("checks our own header", () => {
    const body = '{"amount_cents":1800}';
    const digests = parseContentDigest(contentDigest(body));
    expect([...digests.keys()]).toEqual(["sha-256"]);
    expect(digestMatches(digests, body)).toBe(true);
    expect(digestMatches(digests, '{"amount_cents":1}')).toBe(false);
  });

  it("checks sha-512 (RFC 9421 Appendix B.2 test-request)", () => {
    const header = "sha-512=:WZDPaVn/7XgHaAy8pmojAkGWoRx2UFChF41A2svX+TaPm+AbwAgBWnrIiYllu7BNNyealdVLvRwEmTHWXvJwew==:";
    expect(digestMatches(parseContentDigest(header), '{"hello": "world"}')).toBe(true);
  });

  it("requires every supported digest to match and ignores unknown algorithms", () => {
    const body = "{}";
    const sha512 = createHash("sha512").update(body).digest("base64");
    expect(digestMatches(parseContentDigest(`md5=:AAAA:, ${contentDigest(body)}, sha-512=:${sha512}:`), body)).toBe(true);
    const wrong512 = createHash("sha512").update("{ }").digest("base64");
    expect(digestMatches(parseContentDigest(`${contentDigest(body)}, sha-512=:${wrong512}:`), body)).toBe(false);
  });

  it("rejects headers it can't use", () => {
    expect(() => parseContentDigest("sha-256=abc")).toThrow(/byte sequence/);
    expect(() => parseContentDigest("md5=:AAAA:")).toThrow(/no sha-256 or sha-512/);
    expect(() => parseContentDigest("sha-256=:AAAA")).toThrow(/valid structured header/);
    expect(() => parseContentDigest("")).toThrow(/no sha-256 or sha-512/);
  });
});
