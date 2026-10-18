import { describe, expect, it } from "vitest";
import { cleanReward, loyaltyOf, parseLoyaltyInput, sameRule } from "./rules";

describe("loyaltyOf", () => {
  it("reads a stored rule", () => {
    expect(loyaltyOf({ loyalty: { every: 5, reward: "a free cookie" } })).toEqual({ every: 5, reward: "a free cookie" });
  });

  it("absent, null or broken means no loyalty program", () => {
    expect(loyaltyOf({})).toBeNull();
    expect(loyaltyOf({ loyalty: null })).toBeNull();
    expect(loyaltyOf(null)).toBeNull();
    expect(loyaltyOf(undefined)).toBeNull();
    expect(loyaltyOf({ loyalty: "every 5" })).toBeNull();
    expect(loyaltyOf({ loyalty: { every: 1, reward: "x" } })).toBeNull();
    expect(loyaltyOf({ loyalty: { every: 21, reward: "x" } })).toBeNull();
    expect(loyaltyOf({ loyalty: { every: 5.5, reward: "x" } })).toBeNull();
    expect(loyaltyOf({ loyalty: { every: "5", reward: "x" } })).toBeNull();
    expect(loyaltyOf({ loyalty: { every: 5, reward: "   " } })).toBeNull();
    expect(loyaltyOf({ loyalty: { every: 5, reward: "x".repeat(41) } })).toBeNull();
  });

  it("cleans the reward's whitespace", () => {
    expect(loyaltyOf({ loyalty: { every: 2, reward: "  a  free\ncookie " } })).toEqual({ every: 2, reward: "a free cookie" });
    expect(cleanReward(" tea ")).toBe("tea");
  });
});

describe("parseLoyaltyInput", () => {
  it("accepts every 2–20 and a reward up to 40 letters", () => {
    expect(parseLoyaltyInput("5", " free cookie ")).toEqual({ ok: true, rule: { every: 5, reward: "free cookie" } });
    expect(parseLoyaltyInput("2", "x")).toMatchObject({ ok: true });
    expect(parseLoyaltyInput("20", "x".repeat(40))).toMatchObject({ ok: true });
  });

  it("says which field is off", () => {
    expect(parseLoyaltyInput("1", "cookie")).toMatchObject({ ok: false, field: "every" });
    expect(parseLoyaltyInput("21", "cookie")).toMatchObject({ ok: false, field: "every" });
    expect(parseLoyaltyInput("", "cookie")).toMatchObject({ ok: false, field: "every" });
    expect(parseLoyaltyInput("5.5", "cookie")).toMatchObject({ ok: false, field: "every" });
    expect(parseLoyaltyInput("five", "cookie")).toMatchObject({ ok: false, field: "every" });
    expect(parseLoyaltyInput("5", "  ")).toMatchObject({ ok: false, field: "reward", message: "Name the reward." });
    expect(parseLoyaltyInput("5", "x".repeat(41))).toMatchObject({ ok: false, field: "reward" });
  });
});

describe("sameRule", () => {
  it("compares rules by value", () => {
    expect(sameRule({ every: 5, reward: "a" }, { every: 5, reward: "a" })).toBe(true);
    expect(sameRule({ every: 5, reward: "a" }, { every: 4, reward: "a" })).toBe(false);
    expect(sameRule(null, null)).toBe(true);
    expect(sameRule(null, { every: 5, reward: "a" })).toBe(false);
  });
});
