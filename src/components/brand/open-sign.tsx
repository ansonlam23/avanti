"use client";

import { useLayoutEffect, useRef } from "react";
import { DUR } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ms, prefersReducedMotion } from "./motion-prefs";
import { sfx } from "./sfx";

// CONTRACT (props are frozen; optional props may be added). The names keep
// their neon-era spelling so every caller keeps compiling.
export type NeonState = "off" | "flickering-on" | "on" | "sputtering-off";
/** "ai" prints in carbon blue; every shop tone prints in ink. */
export type NeonTone = "neon" | "ai" | "sodium" | "violet";

export interface NeonSignProps {
  text?: string; // default "OPEN"
  /** off = no paper · flickering-on = printing · on = printed · sputtering-off = torn away. */
  state?: NeonState; // default "on"
  tone?: NeonTone;
  size?: "sm" | "md" | "lg" | "xl";
  /** Fires exactly when the slip is printed and torn (end of the print script). */
  onLit?: () => void;
  className?: string;
  /** A deeper shadow on the counter (hero use). */
  spill?: boolean;
  /** "plate" (default): the printer + its slip · "bare": the slip only. */
  mount?: "plate" | "bare";
  /** Printer chatter + the tear (only when sound is globally on). Default true. */
  sound?: boolean;
}
export type OpenSignProps = NeonSignProps;

const SIZE = {
  sm: "text-[26px]",
  md: "text-[52px]",
  lg: "text-[84px]",
  xl: "text-[clamp(96px,min(33vw,30svh),176px)]", // capped by height too (landscape)
} as const;

/** Each size hangs at its own small angle (degrees): paper is never square to the screen. */
const REST = { sm: -2.4, md: -1.8, lg: -1.4, xl: -1.2 } as const;
const SOUND_GAIN = { sm: 0.35, md: 0.6, lg: 0.9, xl: 1 } as const;

/** The slip comes out in this many printer steps (advance → settle). */
const STEPS = 9;
const STEP_EASE = "cubic-bezier(0.33, 0, 0.2, 1)";

/**
 * The OPEN sign, printed. A thermal printer feeds a slip out of its slot,
 * row by row: a reverse-printed black block with OPEN in white. Then the
 * slip is torn at the cutter and hangs at a slight angle (onLit fires).
 * Sputter-off = the slip is torn away and falls. Off = no paper.
 * Script (DUR.print + DUR.tear ≈ 1.4 s): feed in 9 steps with the print
 * head's jitter → tear: a tug down, an overshooting swing to rest.
 * Replay: set state "off" → "flickering-on" again, or remount with a new key.
 */
export function OpenSign({
  text = "OPEN",
  state = "on",
  tone = "neon",
  size = "lg",
  onLit,
  className,
  spill = false,
  mount = "plate",
  sound = true,
}: NeonSignProps) {
  const mouthRef = useRef<HTMLSpanElement>(null);
  const slipRef = useRef<HTMLSpanElement>(null);
  const paperRef = useRef<HTMLSpanElement>(null);
  const onLitRef = useRef(onLit);
  useLayoutEffect(() => {
    onLitRef.current = onLit;
  });

  useLayoutEffect(() => {
    const slip = slipRef.current;
    const paper = paperRef.current;
    const mouth = mouthRef.current;
    if (!slip || !paper || !mouth) return;
    const reduced = prefersReducedMotion();
    const rest = REST[size];
    const gain = SOUND_GAIN[size];
    const bare = mount === "bare";
    const anims: Animation[] = [];
    let alive = true;

    if (state === "flickering-on") {
      if (reduced) {
        queueMicrotask(() => {
          if (alive) onLitRef.current?.();
        });
      } else {
        const feed = ms(DUR.print);
        const tear = ms(DUR.tear) * 2.6; // the tug + the swing settling
        // 1 · feed: the slip comes out of the slot one printer step at a time.
        const frames: Keyframe[] = [];
        for (let i = 0; i <= STEPS; i++) {
          const p = i / STEPS;
          const jitter = i === STEPS ? 0 : i % 2 ? 0.45 : -0.45;
          frames.push(
            bare
              ? { offset: p, clipPath: `inset(0 0 ${((1 - p) * 100).toFixed(2)}% 0)`, easing: STEP_EASE }
              : { offset: p, transform: `translateY(${(-95 * (1 - p)).toFixed(2)}%) translateX(${jitter}px)`, easing: STEP_EASE },
          );
        }
        const feedAnim = (bare ? paper : slip).animate(frames, { duration: feed, fill: "both" });
        anims.push(feedAnim);
        // the slip is out: stop clipping (so its shadow and the tear swing aren't cut)
        feedAnim.finished.then(
          () => {
            if (alive) mouth.dataset.out = "true";
          },
          () => {},
        );
        if (bare) anims.push(slip.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(0deg)" }], { duration: feed, fill: "both" }));
        // 2 · tear: a tug at the cutter, then the slip swings to rest.
        const tearAnim = slip.animate(
          [
            { transform: "translateY(0) rotate(0deg)" },
            { transform: `translateY(0.07em) rotate(${(rest * 2.1).toFixed(2)}deg)`, offset: 0.22 },
            { transform: `translateY(0.03em) rotate(${(rest * 0.55).toFixed(2)}deg)`, offset: 0.55 },
            { transform: `translateY(0.045em) rotate(${(rest * 1.15).toFixed(2)}deg)`, offset: 0.8 },
            { transform: `translateY(0.04em) rotate(${rest}deg)` },
          ],
          // "forwards", not "both": during its delay the feed must own the transform
          { duration: tear, delay: feed, fill: "forwards", easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
        );
        anims.push(tearAnim);
        if (sound) {
          sfx.play("printer", { duration: feed / 1000, gain });
          sfx.play("tear", { delay: feed / 1000, gain });
        }
        tearAnim.finished.then(
          () => {
            if (alive) onLitRef.current?.();
          },
          () => {
            /* cancelled: the state changed mid-script */
          },
        );
      }
    } else if (state === "sputtering-off" && !reduced) {
      // Torn away: the slip drops off the printer and falls out of frame.
      anims.push(
        slip.animate(
          [
            { transform: `translateY(0.04em) rotate(${rest}deg)`, opacity: 1 },
            { transform: `translateY(0.12em) rotate(${rest - 2}deg)`, opacity: 1, offset: 0.18 },
            { transform: `translate(0.18em, 1.5em) rotate(${rest + 11}deg)`, opacity: 0 },
          ],
          { duration: ms(0.62), fill: "both", easing: "cubic-bezier(0.7, 0, 0.84, 0)" },
        ),
      );
      if (sound) sfx.play("tear", { gain });
    }

    return () => {
      alive = false;
      delete mouth.dataset.out;
      for (const a of anims) a.cancel();
    };
  }, [state, text, size, sound, mount]);

  const words = state === "on" ? "on" : state === "off" ? "off" : state === "flickering-on" ? "printing" : "torn away";
  return (
    <span
      role="img"
      aria-label={`${text} sign, ${words}`}
      data-state={state}
      data-tone={tone}
      data-size={size}
      data-mount={mount}
      data-spill={spill ? "true" : undefined}
      className={cn("open-sign", SIZE[size], className)}
      style={{ "--rest": `${REST[size]}deg` } as React.CSSProperties}
    >
      {mount === "plate" ? (
        <span aria-hidden className="open-sign-printer">
          <span className="open-sign-led" />
        </span>
      ) : null}
      <span ref={mouthRef} aria-hidden className="open-sign-mouth">
        <span ref={slipRef} className="open-sign-slip">
          <span ref={paperRef} className="open-sign-paper paper edge-torn-y">
            <span className="open-sign-block">{text}</span>
          </span>
        </span>
      </span>
    </span>
  );
}

/** The neon-era name, kept so every caller (and CONTRACTS §8) keeps working. */
export const NeonSign = OpenSign;
