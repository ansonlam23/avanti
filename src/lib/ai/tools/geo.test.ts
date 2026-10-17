import { describe, expect, it } from "vitest";
import { distanceMeters, SHOPPER_LOCATION, walkMinutes } from "./geo";

describe("walkMinutes", () => {
  it("is null when the shop has no coordinates", () => {
    expect(walkMinutes(null, null)).toBeNull();
    expect(walkMinutes(47.66, null)).toBeNull();
    expect(walkMinutes(Number.NaN, -122.3)).toBeNull();
    expect(walkMinutes(123, -122.3)).toBeNull(); // not a latitude
  });

  it("is at least 1 minute, even next door", () => {
    expect(walkMinutes(SHOPPER_LOCATION.lat, SHOPPER_LOCATION.lng)).toBe(1);
  });

  it("walks ~80 m per minute from UW campus", () => {
    // 0.0072° of latitude ≈ 800 m due north → 10 min
    expect(distanceMeters(SHOPPER_LOCATION, { lat: SHOPPER_LOCATION.lat + 0.0072, lng: SHOPPER_LOCATION.lng })).toBeCloseTo(800, -1);
    expect(walkMinutes(SHOPPER_LOCATION.lat + 0.0072, SHOPPER_LOCATION.lng)).toBe(10);
    expect(walkMinutes(SHOPPER_LOCATION.lat + 0.0027, SHOPPER_LOCATION.lng)).toBe(4);
  });

  it("measures east-west distance with the latitude correction", () => {
    // The Ave (University Way NE) is ~700 m west of the HUB area.
    const m = distanceMeters(SHOPPER_LOCATION, { lat: SHOPPER_LOCATION.lat, lng: -122.3129 });
    expect(m).toBeGreaterThan(650);
    expect(m).toBeLessThan(760);
  });
});
