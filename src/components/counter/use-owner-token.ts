"use client";

import { useEffect, useState } from "react";

export const ownerStorageKey = (slug: string) => `os_owner_${slug}`;

/**
 * The owner link is /shop/<slug>?k=<token>. On first visit we move the token
 * into localStorage and strip it from the URL (so it never shows on camera).
 * Returns undefined while resolving, null when this device has no token.
 */
export function useOwnerToken(slug: string): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let value: string | null = null;
    try {
      const url = new URL(window.location.href);
      const k = url.searchParams.get("k");
      if (k) {
        localStorage.setItem(ownerStorageKey(slug), k);
        url.searchParams.delete("k");
        window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
      }
      value = k ?? localStorage.getItem(ownerStorageKey(slug));
    } catch {
      value = null;
    }
    // Reading browser-only storage has to happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value);
  }, [slug]);

  return token;
}
