// Pickup-time math in the shops' timezone (America/Los_Angeles). Pure, no deps.
// Shop windows are wall-clock "HH:MM" strings; orders store ISO instants.
import type { PickupWindow } from "@/lib/types";

export const SHOP_TZ = "America/Los_Angeles";
/** Earliest pickup we propose: now + this, rounded up to 5 minutes. */
export const PICKUP_LEAD_MINUTES = 10;
/** A pickup time this far in the past still counts as "now" (clock skew, slow taps). */
export const PAST_GRACE_MINUTES = 5;
/** We only hold orders for the next few days. */
export const MAX_DAYS_AHEAD = 6;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface WallClock {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: string; // "Friday"
}

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "long",
});

/** What a wall clock in Los Angeles shows at `date`. */
export function wallClock(date: Date): WallClock & { second: number } {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: p.weekday,
  };
}

/** LA offset from UTC at `date`, in ms (e.g. -7 h in PDT). */
function offsetMs(date: Date): number {
  const w = wallClock(date);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant an LA wall clock shows y-m-d hh:mm (handles DST; `day` may overflow). */
export function fromWallClock(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

/** "18:30" → 1110. Accepts "H:MM" too. null when malformed. */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function minutesOfDay(date: Date): number {
  const w = wallClock(date);
  return w.hour * 60 + w.minute;
}

function startOfLaDay(date: Date, plusDays = 0): Date {
  const w = wallClock(date);
  return fromWallClock(w.year, w.month, w.day + plusDays, 0, 0);
}

/** Pickup window for the LA day of `date` (+ `plusDays`). Overnight windows end the next day. */
export function windowOn(window: PickupWindow, date: Date, plusDays = 0): { start: Date; end: Date } | null {
  const s = parseHHMM(window.start);
  const e = parseHHMM(window.end);
  if (s === null || e === null) return null;
  const w = wallClock(startOfLaDay(date, plusDays));
  const start = fromWallClock(w.year, w.month, w.day, Math.floor(s / 60), s % 60);
  const endDay = e <= s ? w.day + 1 : w.day;
  const end = fromWallClock(w.year, w.month, endDay, Math.floor(e / 60), e % 60);
  return { start, end };
}

/** Is `t` inside the shop's pickup window (on its own LA day, or yesterday's overnight window)? */
export function insideWindow(window: PickupWindow, t: Date): boolean {
  for (const plus of [0, -1]) {
    const b = windowOn(window, t, plus);
    if (b && t >= b.start && t <= b.end) return true;
  }
  return false;
}

function roundUpTo5(t: number): number {
  const step = 5 * MINUTE;
  return Math.ceil(t / step) * step;
}

/** Earliest pickup we'd propose (now + lead, inside a window), looking a few days ahead. */
export function earliestPickup(window: PickupWindow, now: Date, leadMinutes = PICKUP_LEAD_MINUTES): Date | null {
  const ready = roundUpTo5(now.getTime() + leadMinutes * MINUTE);
  for (let d = -1; d <= MAX_DAYS_AHEAD; d++) {
    const b = windowOn(window, now, d);
    if (!b) return null;
    if (b.end.getTime() < ready) continue;
    return new Date(Math.max(ready, b.start.getTime()));
  }
  return null;
}

/**
 * Parse a time the model gave us. Accepts:
 *  - "HH:MM" (24 h) or "5:30 PM" / "6pm": the NEXT time an LA clock shows it
 *    (today if still ahead, give or take the grace period; else tomorrow)
 *  - ISO 8601 with offset/Z, or without (read as LA wall time)
 * Returns null when it can't be read.
 */
export function parseShopTime(input: string, now: Date): Date | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})[t ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (iso) {
    if (iso[7]) {
      const d = new Date(input.trim());
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return fromWallClock(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4]), Number(iso[5]));
  }

  let minutes: number | null = null;
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/.exec(s);
  if (ampm) {
    const h = Number(ampm[1]);
    const m = Number(ampm[2] ?? "0");
    if (h < 1 || h > 12 || m > 59) return null;
    const pm = ampm[3].startsWith("p");
    minutes = ((h % 12) + (pm ? 12 : 0)) * 60 + m;
  } else {
    minutes = parseHHMM(s);
  }
  if (minutes === null) return null;

  const w = wallClock(now);
  const today = fromWallClock(w.year, w.month, w.day, Math.floor(minutes / 60), minutes % 60);
  if (today.getTime() >= now.getTime() - PAST_GRACE_MINUTES * MINUTE) return today;
  return fromWallClock(w.year, w.month, w.day + 1, Math.floor(minutes / 60), minutes % 60);
}

/** Calendar days between the LA dates of `a` and `b` (b - a). */
export function laDayDiff(a: Date, b: Date): number {
  return Math.round((startOfLaDay(b).getTime() - startOfLaDay(a).getTime()) / DAY);
}

/** "08:00" → "8 AM", "17:30" → "5:30 PM" */
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

/** "5:30 PM" today, "tomorrow 9 AM", or "Sunday 9 AM". */
export function dayTimeLabel(t: Date, now: Date): string {
  const time = clockLabel(minutesOfDay(t));
  const diff = laDayDiff(now, t);
  if (diff === 0) return time;
  if (diff === 1) return `tomorrow ${time}`;
  return `${wallClock(t).weekday} ${time}`;
}

export function windowLabel(window: PickupWindow): string {
  const s = parseHHMM(window.start);
  const e = parseHHMM(window.end);
  if (s === null || e === null) return `${window.start}–${window.end}`;
  return `${clockLabel(s)}–${clockLabel(e)}`;
}

export type PickupCheck =
  | { ok: true; at: Date }
  | { ok: false; error: "bad_time" | "past_time" | "too_far" | "outside_window" | "window_over"; message: string };

/** Validate a requested pickup ("asap"/empty = earliest) against the window. */
export function checkPickup(window: PickupWindow, requested: string | null | undefined, now: Date): PickupCheck {
  const label = windowLabel(window);
  const raw = (requested ?? "").trim().toLowerCase();
  if (!raw || raw === "asap" || raw === "now" || raw === "soonest") {
    const at = earliestPickup(window, now);
    return at
      ? { ok: true, at }
      : { ok: false, error: "window_over", message: `No pickup slot in the next few days (window ${label}).` };
  }
  const at = parseShopTime(raw, now);
  if (!at) return { ok: false, error: "bad_time", message: `Couldn't read the pickup time "${requested}". Use "HH:MM".` };
  if (at.getTime() < now.getTime() - PAST_GRACE_MINUTES * MINUTE) {
    return { ok: false, error: "past_time", message: "That pickup time has already passed." };
  }
  if (at.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY) {
    return { ok: false, error: "too_far", message: "Pickups can be at most a few days ahead." };
  }
  if (!insideWindow(window, at)) {
    return { ok: false, error: "outside_window", message: `Pickup must be inside the shop's window (${label}).` };
  }
  return { ok: true, at };
}
