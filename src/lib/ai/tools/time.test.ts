import { describe, expect, it } from "vitest";
import { NOW } from "./fixtures";
import {
  checkPickup,
  clockLabel,
  dayTimeLabel,
  earliestPickup,
  fromWallClock,
  insideWindow,
  parseHHMM,
  parseShopTime,
  wallClock,
  windowLabel,
} from "./time";

const W = { start: "08:00", end: "18:00" };
const at = (iso: string) => new Date(iso);

describe("wall clock in America/Los_Angeles", () => {
  it("converts LA wall time to the right instant in PDT and PST", () => {
    expect(fromWallClock(2026, 10, 16, 18, 0).toISOString()).toBe("2026-10-17T01:00:00.000Z"); // PDT −7
    expect(fromWallClock(2026, 11, 2, 18, 0).toISOString()).toBe("2026-11-03T02:00:00.000Z"); // PST −8
    expect(fromWallClock(2026, 11, 1, 12, 0).toISOString()).toBe("2026-11-01T20:00:00.000Z"); // DST ended 2 AM
  });

  it("reads the LA clock for an instant", () => {
    const w = wallClock(NOW);
    expect([w.year, w.month, w.day, w.hour, w.minute, w.weekday]).toEqual([2026, 10, 16, 15, 12, "Friday"]);
  });

  it("parses HH:MM", () => {
    expect(parseHHMM("08:00")).toBe(480);
    expect(parseHHMM("6:30")).toBe(390);
    expect(parseHHMM("18:00:00")).toBe(1080);
    expect(parseHHMM("25:00")).toBeNull();
    expect(parseHHMM("6pm")).toBeNull();
  });
});

describe("parseShopTime", () => {
  it("reads HH:MM as the next time the LA clock shows it", () => {
    expect(parseShopTime("18:00", NOW)?.toISOString()).toBe("2026-10-17T01:00:00.000Z"); // today 6 PM
    expect(parseShopTime("09:00", NOW)?.toISOString()).toBe("2026-10-17T16:00:00.000Z"); // tomorrow 9 AM
  });

  it("reads 12-hour times", () => {
    expect(parseShopTime("6pm", NOW)?.toISOString()).toBe("2026-10-17T01:00:00.000Z");
    expect(parseShopTime("5:30 PM", NOW)?.toISOString()).toBe("2026-10-17T00:30:00.000Z");
    expect(parseShopTime("12 am", NOW)?.toISOString()).toBe("2026-10-17T07:00:00.000Z"); // midnight tonight
  });

  it("reads ISO with or without an offset", () => {
    expect(parseShopTime("2026-10-16T17:30:00-07:00", NOW)?.toISOString()).toBe("2026-10-17T00:30:00.000Z");
    expect(parseShopTime("2026-10-17T00:30:00Z", NOW)?.toISOString()).toBe("2026-10-17T00:30:00.000Z");
    expect(parseShopTime("2026-10-16T17:30", NOW)?.toISOString()).toBe("2026-10-17T00:30:00.000Z"); // LA wall time
  });

  it("rejects junk", () => {
    expect(parseShopTime("soon-ish", NOW)).toBeNull();
    expect(parseShopTime("", NOW)).toBeNull();
    expect(parseShopTime("13pm", NOW)).toBeNull();
  });
});

describe("pickup windows", () => {
  it("knows what's inside the window", () => {
    expect(insideWindow(W, at("2026-10-16T22:12:00Z"))).toBe(true); // 3:12 PM
    expect(insideWindow(W, at("2026-10-17T01:00:00Z"))).toBe(true); // 6:00 PM (end is inclusive)
    expect(insideWindow(W, at("2026-10-17T01:01:00Z"))).toBe(false); // 6:01 PM
    expect(insideWindow(W, at("2026-10-16T14:59:00Z"))).toBe(false); // 7:59 AM
  });

  it("handles windows that run past midnight", () => {
    const late = { start: "18:00", end: "02:00" };
    expect(insideWindow(late, at("2026-10-17T08:30:00Z"))).toBe(true); // 1:30 AM
    expect(insideWindow(late, at("2026-10-17T10:00:00Z"))).toBe(false); // 3 AM
  });

  it("earliest pickup = now + 10 min, rounded up to 5", () => {
    expect(earliestPickup(W, NOW)?.toISOString()).toBe("2026-10-16T22:25:00.000Z"); // 3:25 PM
  });

  it("earliest pickup waits for opening, or rolls to tomorrow after close", () => {
    expect(earliestPickup(W, at("2026-10-16T13:00:00Z"))?.toISOString()).toBe("2026-10-16T15:00:00.000Z"); // 6 AM → 8 AM
    expect(earliestPickup(W, at("2026-10-17T03:00:00Z"))?.toISOString()).toBe("2026-10-17T15:00:00.000Z"); // 8 PM → 8 AM
  });

  it("labels windows and times like a shop sign", () => {
    expect(windowLabel(W)).toBe("8 AM–6 PM");
    expect(clockLabel(17 * 60 + 30)).toBe("5:30 PM");
    expect(dayTimeLabel(at("2026-10-17T00:30:00Z"), NOW)).toBe("5:30 PM");
    expect(dayTimeLabel(at("2026-10-17T16:00:00Z"), NOW)).toBe("tomorrow 9 AM");
    expect(dayTimeLabel(at("2026-10-18T16:00:00Z"), NOW)).toBe("Sunday 9 AM");
  });
});

describe("checkPickup", () => {
  it("accepts a time inside the window", () => {
    const r = checkPickup(W, "17:30", NOW);
    expect(r.ok && r.at.toISOString()).toBe("2026-10-17T00:30:00.000Z");
  });

  it("asap / empty = earliest slot", () => {
    for (const v of ["asap", "", null, undefined]) {
      const r = checkPickup(W, v, NOW);
      expect(r.ok && r.at.toISOString()).toBe("2026-10-16T22:25:00.000Z");
    }
  });

  it("rejects times outside the window, unreadable or too far ahead", () => {
    expect(checkPickup(W, "19:00", NOW)).toMatchObject({ ok: false, error: "outside_window" });
    expect(checkPickup(W, "07:00", NOW)).toMatchObject({ ok: false, error: "outside_window" }); // tomorrow 7 AM
    expect(checkPickup(W, "whenever", NOW)).toMatchObject({ ok: false, error: "bad_time" });
    expect(checkPickup(W, "2026-10-30T12:00:00-07:00", NOW)).toMatchObject({ ok: false, error: "too_far" });
  });

  it("rejects explicit past times but tolerates a few minutes of skew", () => {
    expect(checkPickup(W, "2026-10-16T14:00:00-07:00", NOW)).toMatchObject({ ok: false, error: "past_time" });
    expect(checkPickup(W, "2026-10-16T15:10:00-07:00", NOW).ok).toBe(true);
  });
});
