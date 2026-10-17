"use client";

import { useSyncExternalStore } from "react";

// Laptop/desktop widths (Tailwind `lg`, ≥ 1024 px): the order moves out of the
// conversation into the tray on the right. Phones keep everything inline.
// Server render = false (phone); only things that appear after a tap depend on it.

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
