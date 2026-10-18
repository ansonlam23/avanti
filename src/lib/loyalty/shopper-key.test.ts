import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deviceShopperKey, isShopperKey, newShopperId, SHOPPER_ID_STORAGE, shopperKeyOf } from "./shopper-key";

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("shopper key", () => {
  it("is the SHA-256 hex of the id, computed with WebCrypto", async () => {
    expect(await shopperKeyOf("abc")).toBe(sha256("abc"));
    expect(isShopperKey(await shopperKeyOf("abc"))).toBe(true);
  });

  it("makes a random 64-hex id once per device and keeps it", async () => {
    const storage = memoryStorage();
    const first = await deviceShopperKey({ storage });
    const id = storage.data.get(SHOPPER_ID_STORAGE)!;
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(sha256(id));
    expect(first).not.toBe(id); // only the hash ever leaves the device
    expect(await deviceShopperKey({ storage })).toBe(first);
  });

  it("reuses an id already on the device", async () => {
    const id = newShopperId();
    expect(await deviceShopperKey({ storage: memoryStorage({ [SHOPPER_ID_STORAGE]: id }) })).toBe(sha256(id));
  });

  it("replaces a stored id that isn't one", async () => {
    const storage = memoryStorage({ [SHOPPER_ID_STORAGE]: "x" });
    const key = await deviceShopperKey({ storage });
    expect(storage.data.get(SHOPPER_ID_STORAGE)).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(sha256(storage.data.get(SHOPPER_ID_STORAGE)!));
  });

  it("still works for this page when storage is blocked", async () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(isShopperKey(await deviceShopperKey({ storage: blocked }))).toBe(true);
    expect(isShopperKey(await deviceShopperKey({ storage: null }))).toBe(true);
  });

  it("no WebCrypto (an http:// page on a phone): no key, no stamp card", async () => {
    const insecure = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
    expect(await deviceShopperKey({ storage: memoryStorage(), crypto: insecure })).toBeNull();
    expect(await shopperKeyOf("abc", insecure)).toBeNull();
  });

  it("checks the key format", () => {
    expect(isShopperKey("a".repeat(64))).toBe(true);
    expect(isShopperKey("A".repeat(64))).toBe(false);
    expect(isShopperKey("a".repeat(63))).toBe(false);
    expect(isShopperKey(null)).toBe(false);
  });
});
