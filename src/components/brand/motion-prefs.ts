"use client";

import { motionSpeed } from "@/lib/motion";

/** True when the OS asks for reduced motion (read at the moment a script starts). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Seconds → milliseconds at the current retake speed (?speed=0.5 doubles every duration). */
export function ms(seconds: number): number {
  return (seconds * 1000) / motionSpeed();
}

/** Seconds at the current retake speed (for Motion transitions). */
export function sec(seconds: number): number {
  return seconds / motionSpeed();
}

/** A SPRING token slowed/sped up with ?speed= (time-scaled: k·s², c·s), so retakes slow springs too. */
export function spring<T extends { stiffness: number; damping: number }>(s: T): T {
  const v = motionSpeed();
  return { ...s, stiffness: s.stiffness * v * v, damping: s.damping * v };
}
