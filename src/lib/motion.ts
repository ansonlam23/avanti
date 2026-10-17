// Motion tokens (lead-owned). Use these instead of ad-hoc values so the
// whole product moves with one rhythm. Spring/ease values tuned for camera.
// Physical metaphors only (DESIGN.md §4): paper feeds, tears, lands; stamps
// thunk; tickets swing on the rail.

/** Global speed for retakes: ?speed=0.5 slows every token-based animation. */
export function motionSpeed(): number {
  if (typeof window === "undefined") return 1;
  const v = Number(new URLSearchParams(window.location.search).get("speed"));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export const EASE = {
  out: [0.16, 1, 0.3, 1], // every entrance
  inOut: [0.65, 0, 0.35, 1], // two-way changes
  in: [0.7, 0, 0.84, 0], // exits
  pop: [0.19, 1.51, 0.29, 0.99], // overshoot: tags, tickets, receipts landing
  slide: [0.55, 0, 0.1, 1], // camera-like moves, wipes
  feed: [0.33, 0, 0.2, 1], // one printer step: a quick advance that settles
} as const;

/** Seconds. Divide by motionSpeed() when you need retake control. */
export const DUR = {
  micro: 0.24, // chips, hovers, toggles
  element: 0.6, // one element entering
  scene: 1.2, // a whole screen / hero moment
  stamp: 0.25, // stamp slam
  flicker: 1.6, // (legacy neon) kept for old branches
  feed: 0.075, // paper advanced per printed row
  print: 1.15, // the OPEN sign feeding out of the printer
  tear: 0.22, // paper torn off at the cutter
} as const;

export const SPRING = {
  ui: { type: "spring", stiffness: 420, damping: 34 }, // panels, sheets
  resize: { type: "spring", stiffness: 220, damping: 26 }, // layout changes
  tag: { type: "spring", stiffness: 260, damping: 18 }, // price labels landing (one overshoot)
  stamp: { type: "spring", stiffness: 700, damping: 22 }, // slam from scale 1.6
  count: { type: "spring", stiffness: 140, damping: 24 }, // counters stay readable
  swing: { type: "spring", stiffness: 120, damping: 7 }, // a ticket swinging on the rail (2–3 visible swings)
  paper: { type: "spring", stiffness: 300, damping: 24 }, // a slip settling on the counter
} as const;

export const STAGGER = { line: 0.08, chip: 0.04, tag: 0.12 } as const;

/** What reduced motion gets instead of any of the above. */
export const REDUCED = { duration: 0.15, ease: "linear" } as const;
