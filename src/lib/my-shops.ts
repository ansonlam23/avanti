"use client";

// Which shops belong to this browser (public demo sandboxes). Shared by /open
// (after creating a shop), /demo (after copying a demo shop) and /ask (sent as
// `my_shops` so the AI can find your own private shop).

const MY_SHOPS = "os_my_shops";
const ownerKey = (slug: string) => `os_owner_${slug}`;

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MY_SHOPS) ?? "[]");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function getMyShops(): string[] {
  return read();
}

/** Remember a shop this browser owns (most recent first) and its owner token. */
export function rememberMyShop(slug: string, ownerToken?: string): void {
  try {
    const next = [slug, ...read().filter((s) => s !== slug)].slice(0, 12);
    localStorage.setItem(MY_SHOPS, JSON.stringify(next));
    if (ownerToken) localStorage.setItem(ownerKey(slug), ownerToken);
  } catch {
    /* private mode: the owner link still works */
  }
}

export function hasOwnerToken(slug: string): boolean {
  try {
    return Boolean(localStorage.getItem(ownerKey(slug)));
  } catch {
    return false;
  }
}
