// Ink motion for the owner's screens (/open and /shop/[slug]): the landing's
// calm rise and fade. One curve, 0.6–0.9 s; reduced motion is handled by
// MotionConfig (Providers) and the global CSS rule.

import { motionSpeed } from "@/lib/motion";

/** cubic-bezier(.22, 1, .36, 1): every entrance on the owner's side. */
export const INK_EASE = [0.22, 1, 0.36, 1] as const;

/** Seconds at the current retake speed (?speed=0.5 slows everything). */
const at = (s: number) => s / motionSpeed();

/** Props for a calm rise: 14px up and in, `delay` seconds after mount. */
export function inkRise(delay = 0, duration = 0.8) {
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: at(duration), ease: INK_EASE, delay: at(delay) },
  } as const;
}
