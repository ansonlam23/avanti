// A multi-shop errand's walking route: from the shopper (UW campus) through
// every shop in the order with the shortest walk. Pure.
import { distanceMeters, SHOPPER_LOCATION, WALK_METERS_PER_MINUTE } from "@/lib/ai/tools/geo";

export interface Spot {
  lat: number;
  lng: number;
}

export interface RouteStop {
  /** One stop per shop (its slug). */
  id: string;
  /** null = the shop published no coordinates: it goes last, with an unknown leg. */
  spot: Spot | null;
  /** Earliest pickup at this stop (epoch ms). Breaks ties: earlier pickups first. */
  pickupAt?: number | null;
}

export interface Route<T> {
  /** The visiting order. */
  stops: T[];
  /** Walking minutes into each stop: from the origin, then from the stop before. null = unknown. */
  legs: Array<number | null>;
  /** The sum of the legs; null when any leg is unknown. */
  totalMinutes: number | null;
}

export function isSpot(v: unknown): v is Spot {
  if (!v || typeof v !== "object") return false;
  const { lat, lng } = v as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180
  );
}

/** Whole walking minutes between two points (at least 1), the same pace as `walk_minutes`. */
export function walkMinutesBetween(a: Spot, b: Spot): number {
  return Math.max(1, Math.round(distanceMeters(a, b) / WALK_METERS_PER_MINUTE));
}

/** Every visiting order is tried up to this many stops (7! = 5040); past it, nearest-next. */
const MAX_EXACT = 7;

interface Score {
  minutes: number; // what the shopper reads: the sum of rounded legs
  inversions: number; // later pickups visited before earlier ones
  meters: number;
}

function better(a: Score, b: Score): boolean {
  if (a.minutes !== b.minutes) return a.minutes < b.minutes;
  if (a.inversions !== b.inversions) return a.inversions < b.inversions;
  return a.meters < b.meters - 1e-6;
}

function score<T extends RouteStop>(order: readonly T[], origin: Spot): Score {
  let minutes = 0;
  let meters = 0;
  let prev = origin;
  for (const s of order) {
    const spot = s.spot as Spot;
    minutes += walkMinutesBetween(prev, spot);
    meters += distanceMeters(prev, spot);
    prev = spot;
  }
  let inversions = 0;
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const a = order[i].pickupAt;
      const b = order[j].pickupAt;
      if (typeof a === "number" && typeof b === "number" && a > b) inversions++;
    }
  }
  return { minutes, inversions, meters };
}

/** Permutations in lexicographic order of the input (so the given order wins a full tie). */
function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i], ...tail];
  }
}

function bestOrder<T extends RouteStop>(stops: readonly T[], origin: Spot): T[] {
  let best: T[] = [...stops];
  let bestScore = score(best, origin);
  for (const order of permutations(stops)) {
    const s = score(order, origin);
    if (better(s, bestScore)) {
      best = order;
      bestScore = s;
    }
  }
  return best;
}

function nearestNext<T extends RouteStop>(stops: readonly T[], origin: Spot): T[] {
  const left = [...stops];
  const out: T[] = [];
  let at = origin;
  while (left.length) {
    let k = 0;
    for (let i = 1; i < left.length; i++) {
      if (distanceMeters(at, left[i].spot as Spot) < distanceMeters(at, left[k].spot as Spot)) k = i;
    }
    const [next] = left.splice(k, 1);
    out.push(next);
    at = next.spot as Spot;
  }
  return out;
}

/**
 * The walking order through every stop, starting at `origin` (the shopper on
 * UW campus) and ending at the last shop: the fewest walking minutes, then the
 * order that keeps earlier pickups first, then the fewest meters. Stops without
 * coordinates keep their order at the end, with unknown legs.
 */
export function planRoute<T extends RouteStop>(stops: readonly T[], origin: Spot = SHOPPER_LOCATION): Route<T> {
  const located = stops.filter((s) => isSpot(s.spot));
  const unlocated = stops.filter((s) => !isSpot(s.spot));
  const order = located.length <= MAX_EXACT ? bestOrder(located, origin) : nearestNext(located, origin);

  const legs: Array<number | null> = [];
  let prev = origin;
  for (const s of order) {
    legs.push(walkMinutesBetween(prev, s.spot as Spot));
    prev = s.spot as Spot;
  }
  for (let i = 0; i < unlocated.length; i++) legs.push(null);

  const known = legs.every((l): l is number => l !== null);
  return {
    stops: [...order, ...unlocated],
    legs,
    totalMinutes: known ? legs.reduce<number>((sum, l) => sum + (l ?? 0), 0) : null,
  };
}
