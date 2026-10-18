import { describe, expect, it } from "vitest";
import {
  cardAt,
  earnedLine,
  ordinal,
  regularLine,
  rewardDue,
  sealColumns,
  toGoLine,
  visitNumber,
  visitsByOrder,
  type KeyedOrder,
} from "./stamps";

const A = "a".repeat(64);
const B = "b".repeat(64);
const row = (id: string, status: KeyedOrder["status"], created: string, paid: string | null = null, key = A): KeyedOrder => ({
  id,
  shopper_key: key,
  status,
  created_at: `2026-10-17T${created}:00.000Z`,
  paid_at: paid ? `2026-10-17T${paid}:00.000Z` : null,
});

describe("visit and reward", () => {
  it("visit = paid_before + 1", () => {
    expect(visitNumber(0)).toBe(1);
    expect(visitNumber(2)).toBe(3);
    expect(visitNumber(-1)).toBe(1);
  });

  it("the reward is due when visit % every === 0", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map((v) => rewardDue(v, 5))).toEqual([false, false, false, false, true, false, true]);
    expect(rewardDue(2, 2)).toBe(true);
    expect(rewardDue(null, 5)).toBe(false);
    expect(rewardDue(0, 5)).toBe(false);
  });
});

describe("cardAt", () => {
  it("fills one seal per pickup and says how many to go", () => {
    expect(cardAt(1, 5)).toEqual({ filled: 1, toGo: 4, complete: false });
    expect(cardAt(3, 5)).toEqual({ filled: 3, toGo: 2, complete: false });
    expect(cardAt(4, 5)).toEqual({ filled: 4, toGo: 1, complete: false });
  });

  it("the pickup that earns it fills the card; the next one starts a fresh card", () => {
    expect(cardAt(5, 5)).toEqual({ filled: 5, toGo: 0, complete: true });
    expect(cardAt(6, 5)).toEqual({ filled: 1, toGo: 4, complete: false });
    expect(cardAt(10, 5)).toEqual({ filled: 5, toGo: 0, complete: true });
  });

  it("an empty card before any pickup", () => {
    expect(cardAt(0, 5)).toEqual({ filled: 0, toGo: 5, complete: false });
  });
});

describe("visitsByOrder", () => {
  it("numbers paid orders by pickup time, then held orders by when they were placed", () => {
    const visits = visitsByOrder([
      row("p2", "paid", "10:00", "12:00"), // placed first, picked up second
      row("p1", "paid", "11:00", "11:30"),
      row("h2", "held", "14:00"),
      row("h1", "held", "13:00"),
    ]);
    expect(Object.fromEntries(visits)).toEqual({ p1: 1, p2: 2, h1: 3, h2: 4 });
  });

  it("counts each device key separately", () => {
    const visits = visitsByOrder([
      row("a1", "paid", "10:00", "10:10"),
      row("b1", "paid", "10:05", "10:20", B),
      row("a2", "held", "11:00"),
      row("b2", "held", "11:05", null, B),
    ]);
    expect(Object.fromEntries(visits)).toEqual({ a1: 1, a2: 2, b1: 1, b2: 2 });
  });

  it("released, failed and pending orders aren't pickups", () => {
    const visits = visitsByOrder([
      row("p1", "paid", "10:00", "10:30"),
      row("r1", "released", "11:00"),
      row("f1", "failed", "11:10"),
      row("n1", "pending", "11:20"),
      row("h1", "held", "12:00"),
    ]);
    expect(Object.fromEntries(visits)).toEqual({ p1: 1, h1: 2 });
  });

  it("is stable for identical times (ties go by id)", () => {
    const visits = visitsByOrder([row("y", "paid", "10:00", "10:30"), row("x", "paid", "10:00", "10:30")]);
    expect(Object.fromEntries(visits)).toEqual({ x: 1, y: 2 });
  });

  it("the 5th pickup of every 5 is the one with the reward", () => {
    const rows = [1, 2, 3, 4].map((i) => row(`p${i}`, "paid", `1${i}:00`, `1${i}:30`));
    const visits = visitsByOrder([...rows, row("h", "held", "15:00")]);
    expect(visits.get("h")).toBe(5);
    expect(rewardDue(visits.get("h"), 5)).toBe(true);
    expect(rewardDue(visits.get("p4"), 5)).toBe(false);
  });
});

describe("copy", () => {
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });

  it("the owner's quiet line", () => {
    expect(regularLine(1)).toBe("First pickup");
    expect(regularLine(3)).toBe("Regular · 3rd pickup");
    expect(regularLine(null)).toBeNull();
    expect(regularLine(undefined)).toBeNull();
  });

  it("the shopper's card lines", () => {
    expect(toGoLine(2, "a free cookie")).toBe("2 more for a free cookie");
    expect(earnedLine("a free cookie")).toBe("This one's on the house: a free cookie");
  });

  it("lays seals out in even rows of at most 6", () => {
    expect([2, 5, 6, 7, 8, 9, 10, 12, 13, 15, 20].map(sealColumns)).toEqual([2, 5, 6, 4, 4, 5, 5, 6, 5, 5, 5]);
  });
});
