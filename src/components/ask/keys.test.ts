import { describe, expect, it } from "vitest";
import { newIdempotencyKey } from "./keys";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newIdempotencyKey", () => {
  it("uses crypto.randomUUID when there is one", () => {
    expect(newIdempotencyKey()).toMatch(V4);
  });

  it("falls back to getRandomValues outside secure contexts (phone on LAN http)", () => {
    const insecure = { getRandomValues: <T extends ArrayBufferView>(a: T) => crypto.getRandomValues(a) };
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey(insecure as never)));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(V4);
  });
});
