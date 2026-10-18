"use client";

import { useEffect, useState } from "react";
import { isSpot, type Spot } from "@/lib/errand/route";

// Where each shop on an errand is, for the walking route: read from the shop's
// own published agent menu (/s/<slug>/agent.json → shop.location), our host only.
// Cached per page load; a shop that can't be read counts as "no coordinates".

const cache = new Map<string, Promise<Spot | null>>();

function spotOf(slug: string): Promise<Spot | null> {
  let p = cache.get(slug);
  if (!p) {
    p = fetch(`/s/${encodeURIComponent(slug)}/agent.json`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ shop?: { location?: { lat?: unknown; lng?: unknown } } }>) : null))
      .then((m) => {
        const loc = m?.shop?.location;
        return loc && isSpot(loc) ? { lat: loc.lat as number, lng: loc.lng as number } : null;
      })
      .catch(() => null);
    // a failed read may succeed next time
    void p.then((spot) => spot === null && cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}

/** slug → its spot (null = none published); null until every shop has answered. */
export function useSpots(slugs: readonly string[]): Record<string, Spot | null> | null {
  const key = [...new Set(slugs)].sort().join(",");
  const [found, setFound] = useState<{ key: string; spots: Record<string, Spot | null> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const list = key.split(",");
    void Promise.all(list.map(spotOf)).then((spots) => {
      if (live) setFound({ key, spots: Object.fromEntries(list.map((s, i) => [s, spots[i]])) });
    });
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return {};
  return found?.key === key ? found.spots : null;
}
