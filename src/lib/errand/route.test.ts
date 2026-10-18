import { describe, expect, it } from "vitest";
import { SHOPPER_LOCATION, walkMinutes } from "@/lib/ai/tools/geo";
import { isSpot, planRoute, walkMinutesBetween, type RouteStop } from "./route";

// The listed demo shops on the Ave (lat/lng as published in their agent.json).
const RABBIT = { id: "rabbit-rook-prints", spot: { lat: 47.6573, lng: -122.3128 } };
const PETAL = { id: "petal-cart", spot: { lat: 47.6583, lng: -122.3129 } };
const MAI = { id: "mais-bakery", spot: { lat: 47.6595, lng: -122.313 } };
const CIELITO = { id: "cielito-taco-truck", spot: { lat: 47.665, lng: -122.3141 } };

const ids = (r: { stops: RouteStop[] }) => r.stops.map((s) => s.id);

describe("walkMinutesBetween", () => {
  it("matches the walk_minutes the cards show from UW campus", () => {
    for (const s of [RABBIT, PETAL, MAI, CIELITO]) {
      expect(walkMinutesBetween(SHOPPER_LOCATION, s.spot)).toBe(walkMinutes(s.spot.lat, s.spot.lng));
    }
  });

  it("is at least a minute, even next door", () => {
    expect(walkMinutesBetween(PETAL.spot, PETAL.spot)).toBe(1);
  });
});

describe("planRoute", () => {
  it("walks from campus to the nearest shop first, then up the Ave", () => {
    const r = planRoute([MAI, PETAL, RABBIT]);
    expect(ids(r)).toEqual(["rabbit-rook-prints", "petal-cart", "mais-bakery"]);
    expect(r.legs).toEqual([9, 1, 2]);
    expect(r.totalMinutes).toBe(12);
  });

  it("never walks a longer way than the order it was given", () => {
    const given = [CIELITO, RABBIT, MAI, PETAL];
    const r = planRoute(given);
    const sum = (order: typeof given) => {
      let at = SHOPPER_LOCATION as { lat: number; lng: number };
      return order.reduce((m, s) => {
        const d = walkMinutesBetween(at, s.spot);
        at = s.spot;
        return m + d;
      }, 0);
    };
    expect(r.totalMinutes).toBeLessThanOrEqual(sum(given));
    expect(ids(r)[0]).toBe("rabbit-rook-prints");
    expect(ids(r).at(-1)).toBe("cielito-taco-truck");
  });

  it("breaks a tie in walking time by putting the earlier pickup first", () => {
    // Two shops at the same corner: same walk either way, so pickup time decides.
    const early = { id: "early", spot: { lat: 47.6583, lng: -122.3129 }, pickupAt: Date.parse("2026-10-18T00:30:00Z") };
    const late = { id: "late", spot: { lat: 47.6583, lng: -122.3129 }, pickupAt: Date.parse("2026-10-18T00:45:00Z") };
    expect(ids(planRoute([late, early]))).toEqual(["early", "late"]);
    expect(ids(planRoute([early, late]))).toEqual(["early", "late"]);
  });

  it("puts shops without coordinates last, with unknown legs and no total", () => {
    const r = planRoute([{ id: "nowhere", spot: null }, MAI, PETAL]);
    expect(ids(r)).toEqual(["petal-cart", "mais-bakery", "nowhere"]);
    expect(r.legs).toEqual([10, 2, null]);
    expect(r.totalMinutes).toBeNull();
  });

  it("handles one stop and no stops", () => {
    expect(planRoute([PETAL])).toMatchObject({ legs: [10], totalMinutes: 10 });
    expect(planRoute([])).toEqual({ stops: [], legs: [], totalMinutes: 0 });
  });

  it("stays quick past the exact limit (nearest shop next)", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, spot: { lat: 47.656 + i * 0.001, lng: -122.313 } }));
    const r = planRoute([...many].reverse());
    expect(ids(r)).toEqual(many.map((s) => s.id));
    expect(r.legs.every((l) => typeof l === "number" && l >= 1)).toBe(true);
  });
});

describe("isSpot", () => {
  it("accepts real coordinates only", () => {
    expect(isSpot({ lat: 47.6, lng: -122.3 })).toBe(true);
    expect(isSpot({ lat: null, lng: -122.3 })).toBe(false);
    expect(isSpot({ lat: 91, lng: 0 })).toBe(false);
    expect(isSpot({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isSpot(null)).toBe(false);
  });
});
