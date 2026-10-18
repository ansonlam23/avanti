"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import type { WhySource } from "./why";

// The order card's "Why this shop?" line reads only what the chat is already
// showing: each shop, menu and "own words" card shares its tool result here
// while it's on screen, and lets go when it leaves (so "New chat" clears it).
// Oldest first: when two cards disagree, the newest one wins (why.ts).

const shown = new Map<number, WhySource>();
const listeners = new Set<() => void>();
let snapshot: readonly WhySource[] = [];
let seq = 0;

function publish() {
  snapshot = [...shown.values()]; // a Map keeps insertion order, and ids only grow
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const NONE: readonly WhySource[] = [];

/** A card shares the tool result it shows (pass a stable object: memoize it on the result). */
export function useShareWhy(source: WhySource | null) {
  // Before paint, so an order card mounting with it never flashes without its line.
  useLayoutEffect(() => {
    if (!source) return;
    const id = ++seq;
    shown.set(id, source);
    publish();
    return () => {
      shown.delete(id);
      publish();
    };
  }, [source]);
}

/** Every tool result on screen right now, oldest first. */
export function useWhySources(): readonly WhySource[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => NONE,
  );
}
