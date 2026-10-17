"use client";

import { DUR } from "@/lib/motion";
import { ms, prefersReducedMotion } from "./motion-prefs";
import { sfx } from "./sfx";

/** Distance from `root`'s top edge to `el`'s top edge, in layout px (ignores transforms/scale). */
function topWithin(el: HTMLElement, root: HTMLElement): number {
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return y;
}

export interface FeedOptions {
  /** Called every frame with how much paper (px from the top) has come out. */
  apply: (px: number) => void;
  /** The paper is all out. */
  done: () => void;
  /** Printer chatter (only when sound is globally on). Default true. */
  sound?: boolean;
  /** Seconds of feed per printed row (default DUR.feed). */
  step?: number;
  /** Paper already out before the first row (px). */
  from?: number;
}

/**
 * Feeds paper out of the printer row by row: one `[data-row]` per step, each
 * step a quick advance that settles (EASE.feed-like cubic), with the print
 * head's tiny sideways jitter. Pure DOM + rAF so it runs the same on iOS
 * Safari. Reduced motion: done on the next tick, nothing moves.
 * `root` must be positioned (it's the rows' offset parent). Returns a cancel.
 */
export function runFeed(root: HTMLElement, { apply, done, sound = true, step = DUR.feed, from = 12 }: FeedOptions): () => void {
  if (prefersReducedMotion()) {
    const t = setTimeout(done, 0);
    return () => clearTimeout(t);
  }
  const height = root.offsetHeight;
  const stops = [...root.querySelectorAll<HTMLElement>("[data-row]")].map((el) =>
    Math.min(height, topWithin(el, root) + el.offsetHeight + 4),
  );
  stops.push(height);
  const each = ms(step);
  const total = each * stops.length;
  if (sound) sfx.play("printer", { duration: total / 1000 });

  let raf = 0;
  const start = performance.now();
  apply(from);
  const tick = (now: number) => {
    const elapsed = now - start;
    const i = Math.min(stops.length - 1, Math.floor(elapsed / each));
    const within = Math.min(1, (elapsed - i * each) / (each * 0.6));
    const prev = i === 0 ? from : stops[i - 1];
    const eased = 1 - Math.pow(1 - within, 3);
    apply(prev + (stops[i] - prev) * eased);
    root.style.translate = `${i % 2 ? 0.45 : -0.45}px 0`; // the print head's tiny jitter
    if (elapsed < total) raf = requestAnimationFrame(tick);
    else {
      root.style.removeProperty("translate");
      done();
    }
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    root.style.removeProperty("translate");
  };
}

export interface RevealOptions {
  /** Every row has risen in. */
  done: () => void;
  /** Soft printer chatter while the rows arrive (only when sound is globally on). Default true. */
  sound?: boolean;
  /** Seconds between one row and the next (default 0.09). */
  step?: number;
  /** Seconds each row takes to rise in (default 0.6). */
  rise?: number;
}

/**
 * Ink's calm version of the feed: each `[data-row]` inside `root` rises and
 * fades in after the one before it (EASE cubic-bezier(.22,1,.36,1)). Rows
 * should start hidden (style them from a `data-revealing` attribute or give
 * them opacity 0) — the animations fill backwards, so they never flash.
 * Reduced motion: done on the next tick, nothing moves. Returns a cancel.
 */
export function runReveal(root: HTMLElement, { done, sound = true, step = 0.09, rise = 0.6 }: RevealOptions): () => void {
  if (prefersReducedMotion()) {
    const t = setTimeout(done, 0);
    return () => clearTimeout(t);
  }
  const rows = [...root.querySelectorAll<HTMLElement>("[data-row]")];
  const each = ms(step);
  const len = ms(rise);
  const anims = rows.map((el, i) =>
    el.animate(
      [
        { opacity: 0, transform: "translate3d(0, 8px, 0)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: len, delay: i * each, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" },
    ),
  );
  const total = Math.max(0, rows.length - 1) * each + len;
  if (sound) sfx.play("printer", { duration: Math.min(1.2, total / 1000) });
  const t = setTimeout(done, total);
  return () => {
    clearTimeout(t);
    for (const a of anims) a.cancel();
  };
}
