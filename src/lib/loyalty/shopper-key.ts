// The shopper's device key for stamp cards (CONTRACTS §17). No accounts:
// the browser keeps a random id in localStorage ("os_shopper_id") and sends
// only its SHA-256 hex (computed here with WebCrypto) along with Confirm &
// hold. avanti never sees, stores or logs the id itself. Browser-safe; the
// storage and crypto are injectable so this stays unit-testable.

export const SHOPPER_ID_STORAGE = "os_shopper_id";
export const SHOPPER_KEY_PATTERN = /^[0-9a-f]{64}$/;

export function isShopperKey(v: unknown): v is string {
  return typeof v === "string" && SHOPPER_KEY_PATTERN.test(v);
}

type CryptoLike = Pick<Crypto, "getRandomValues"> & { subtle?: Pick<SubtleCrypto, "digest"> };
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** 32 random bytes as 64 hex characters. */
export function newShopperId(c: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  return hex(c.getRandomValues(new Uint8Array(32)));
}

/**
 * SHA-256 hex of the id. null without WebCrypto: `crypto.subtle` only exists
 * in secure contexts (https, localhost), so a phone testing over LAN http just
 * gets no stamp card.
 */
export async function shopperKeyOf(id: string, c: CryptoLike | undefined = globalThis.crypto): Promise<string | null> {
  const subtle = c?.subtle;
  if (!subtle || typeof subtle.digest !== "function") return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(id));
  return hex(new Uint8Array(digest));
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // storage blocked (Safari with all cookies blocked throws here)
  }
}

/**
 * This device's key, making the id on first use. Storage that's blocked still
 * gets a key, for this page only (nothing accumulates, by the person's choice).
 * null when the key can't be computed.
 */
export async function deviceShopperKey(
  opts: { storage?: StorageLike | null; crypto?: CryptoLike } = {},
): Promise<string | null> {
  const c = opts.crypto ?? globalThis.crypto;
  if (!c?.subtle || typeof c.getRandomValues !== "function") return null;
  const storage = opts.storage === undefined ? browserStorage() : opts.storage;
  let id: string | null = null;
  try {
    id = storage?.getItem(SHOPPER_ID_STORAGE) ?? null;
  } catch {
    id = null;
  }
  if (!id || id.length < 16 || id.length > 128) {
    id = newShopperId(c);
    try {
      storage?.setItem(SHOPPER_ID_STORAGE, id);
    } catch {
      // private mode / quota: keep it for this page only
    }
  }
  try {
    return await shopperKeyOf(id, c);
  } catch {
    return null;
  }
}
