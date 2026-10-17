"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ms, prefersReducedMotion } from "./motion-prefs";
import { sfx } from "./sfx";

// CONTRACT (props are frozen; optional props may be added). The names keep
// their neon-era spelling so every caller keeps compiling.
export type NeonState = "off" | "flickering-on" | "on" | "sputtering-off";
/** Kept for callers: in ink every tone is the brand teal. */
export type NeonTone = "neon" | "ai" | "sodium" | "violet";

export interface NeonSignProps {
  text?: string; // default "OPEN" (all-caps words are set lowercase, like the wordmark)
  /** off = not inked yet · flickering-on = inking in · on = open · sputtering-off = taken down. */
  state?: NeonState; // default "on"
  tone?: NeonTone;
  size?: "sm" | "md" | "lg" | "xl";
  /** Fires exactly when the sign has finished inking in. */
  onLit?: () => void;
  className?: string;
  /** A slightly deeper shadow (hero use). */
  spill?: boolean;
  /** "plate" (default): the plaque hangs from a nail on two strings · "bare": the plaque only. */
  mount?: "plate" | "bare";
  /** Soft sounds while it inks in (only when sound is globally on). Default true. */
  sound?: boolean;
}
export type OpenSignProps = NeonSignProps;

const SIZE = {
  sm: "text-[26px]",
  md: "text-[52px]",
  lg: "text-[84px]",
  xl: "text-[clamp(96px,min(33vw,30svh),176px)]", // capped by height too (landscape)
} as const;

const SOUND_GAIN = { sm: 0.35, md: 0.6, lg: 0.9, xl: 1 } as const;

const INK = "cubic-bezier(0.22, 1, 0.36, 1)"; // the landing's calm rise
const PLAQUE = 0.9; // s: the plaque settles in
const WORD_DELAY = 0.3; // s: then the word is brushed on, left to right
const WORD = 0.85; // s

/** "OPEN" → "open" (all-caps words read like the wordmark); names keep their case. */
function inkText(text: string): string {
  return /[A-Z]/.test(text) && text === text.toUpperCase() ? text.toLowerCase() : text;
}

/**
 * The shop's sign, in ink: a paper plaque with a double teal rule and the
 * word in Marcellus. "plate" hangs it from a nail on two hairline strings.
 * flickering-on: the plaque settles in (0.9 s) and the word is brushed on
 * left to right, then onLit fires (≈1.2 s). sputtering-off: it's taken down
 * (fades and drops a little). off: an un-inked plaque, a faint dashed outline.
 * Replay: set state "off" → "flickering-on" again, or remount with a new key.
 */
export function OpenSign({
  text = "OPEN",
  state = "on",
  size = "lg",
  onLit,
  className,
  spill = false,
  mount = "plate",
  sound = true,
}: NeonSignProps) {
  const plaqueRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const onLitRef = useRef(onLit);
  useLayoutEffect(() => {
    onLitRef.current = onLit;
  });

  useLayoutEffect(() => {
    const plaque = plaqueRef.current;
    const word = wordRef.current;
    if (!plaque || !word) return;
    const reduced = prefersReducedMotion();
    const gain = SOUND_GAIN[size];
    const anims: Animation[] = [];
    let alive = true;

    if (state === "flickering-on") {
      if (reduced) {
        queueMicrotask(() => {
          if (alive) onLitRef.current?.();
        });
      } else {
        anims.push(
          plaque.animate(
            [
              { opacity: 0, transform: "translateY(-0.1em)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: ms(PLAQUE), easing: INK, fill: "both" },
          ),
        );
        const brush = word.animate(
          [
            { opacity: 0, clipPath: "inset(0 100% 0 0)" },
            { opacity: 1, clipPath: "inset(0 0% 0 0)" },
          ],
          { duration: ms(WORD), delay: ms(WORD_DELAY), easing: INK, fill: "both" },
        );
        anims.push(brush);
        if (sound) {
          sfx.play("printer", { duration: PLAQUE, gain: gain * 0.6 });
          sfx.play("tear", { delay: WORD_DELAY + WORD * 0.8, gain: gain * 0.4 });
        }
        brush.finished.then(
          () => {
            if (alive) onLitRef.current?.();
          },
          () => {
            /* cancelled: the state changed mid-script */
          },
        );
      }
    } else if (state === "sputtering-off" && !reduced) {
      // Taken down: the plaque lifts off its nail and fades away.
      anims.push(
        plaque.animate(
          [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "translateY(0.22em)" },
          ],
          { duration: ms(0.62), easing: "cubic-bezier(0.55, 0, 0.75, 0.2)", fill: "both" },
        ),
      );
      if (sound) sfx.play("tear", { gain: gain * 0.5 });
    }

    return () => {
      alive = false;
      for (const a of anims) a.cancel();
    };
  }, [state, text, size, sound, mount]);

  const words = state === "on" ? "on" : state === "off" ? "off" : state === "flickering-on" ? "going up" : "taken down";
  return (
    <span
      role="img"
      aria-label={`${text} sign, ${words}`}
      data-state={state}
      data-size={size}
      data-mount={mount}
      data-spill={spill ? "true" : undefined}
      className={cn("open-sign", SIZE[size], className)}
    >
      {mount === "plate" ? (
        <span aria-hidden className="open-sign-hanger">
          <svg viewBox="0 0 100 10" preserveAspectRatio="none">
            <polyline
              points="8,10 50,0.6 92,10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="open-sign-nail" />
        </span>
      ) : null}
      <span ref={plaqueRef} aria-hidden className="open-sign-plaque">
        <span ref={wordRef} className="open-sign-word">
          {inkText(text)}
        </span>
      </span>
    </span>
  );
}

/** The neon-era name, kept so every caller (and CONTRACTS §8) keeps working. */
export const NeonSign = OpenSign;
