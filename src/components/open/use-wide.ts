"use client";

import { useSyncExternalStore } from "react";

// Laptop/desktop widths (Tailwind `lg`, ≥ 1024 px): the two-pane stage.
// Layout itself is CSS (open.css); this only picks WHERE a piece mounts when
// it can't be in two places at once (one layoutId, one fixed CTA). Server
// render = false (phone); those pieces only appear after the first tap.

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
