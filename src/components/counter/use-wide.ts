"use client";

import { useSyncExternalStore } from "react";

// Laptop/desktop widths (Tailwind `lg`, ≥ 1024 px): the counter becomes a
// dashboard (orders · menu · door side by side) instead of tabs. JS rather
// than CSS so each ticket/stamp mounts once (two copies would thunk twice).
// The view only renders after the owner data loads, so there's no flash.

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
