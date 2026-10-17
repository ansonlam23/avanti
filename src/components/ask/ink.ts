// Ink motion for /ask: calm rise/fade on the landing's curve (DESIGN.md · Ink).

/** cubic-bezier(.22, 1, .36, 1): every entrance on /ask. */
export const RISE = [0.22, 1, 0.36, 1] as const;

/** Seconds: one element rising in (0.6–0.9 s per the Ink brief). */
export const RISE_S = 0.7;
