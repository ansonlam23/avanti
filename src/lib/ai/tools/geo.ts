// Walking distance from the shopper's fixed demo location. Pure.

/** The shopper is on the UW campus (the demo has no shopper GPS). */
export const SHOPPER_LOCATION = { lat: 47.6553, lng: -122.3035, label: "UW campus" } as const;
export const WALK_METERS_PER_MINUTE = 80;

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isCoord(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
}

/** Whole walking minutes (≥ 1) from the shopper, or null when the shop has no coordinates. */
export function walkMinutes(lat: number | null | undefined, lng: number | null | undefined): number | null {
  if (!isCoord(lat, 90) || !isCoord(lng, 180)) return null;
  const meters = distanceMeters(SHOPPER_LOCATION, { lat, lng });
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE));
}
