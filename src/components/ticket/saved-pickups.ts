"use client";

import { useSyncExternalStore } from "react";
import type { OrderStatus } from "@/lib/types";

// "Your pickups": the tickets this phone holds (CONTRACTS §18), in localStorage
// so they survive a closed tab. Only what the list shows is kept: the order id
// (the ticket's capability), shop, item, pickup time and status. Released or
// failed tickets drop off; picked-up ones stay a day so the stamp card can be seen.

export interface SavedPickup {
  id: string;
  shop: string;
  item: string;
  qty: number;
  pickup_time: string | null;
  status: OrderStatus;
  /** When the ticket was first saved (ms), to order the list and age out old ones. */
  saved: number;
  /** When it was picked up (ms), to keep it a day. */
  paid?: number;
}

export const KEY = "avanti:pickups";
const DAY = 24 * 60 * 60 * 1000;
const MAX = 12;

interface OrderLike {
  id: string;
  shop_name: string;
  item_name: string;
  qty: number;
  pickup_time: string | null;
  status: OrderStatus;
}

/** Add or update tickets from fresh orders (held or picked up only). Pure. */
export function upsertPickups(list: SavedPickup[], orders: OrderLike[], now: number): SavedPickup[] {
  const next = list.map((p) => ({ ...p }));
  for (const o of orders) {
    const at = next.findIndex((p) => p.id === o.id);
    if (at === -1) {
      if (o.status !== "held" && o.status !== "paid") continue;
      next.push({
        id: o.id,
        shop: o.shop_name,
        item: o.item_name,
        qty: o.qty,
        pickup_time: o.pickup_time,
        status: o.status,
        saved: now,
        ...(o.status === "paid" ? { paid: now } : {}),
      });
      continue;
    }
    const p = next[at];
    if (o.status === "paid" && p.status !== "paid") p.paid = now;
    p.status = o.status;
    p.pickup_time = o.pickup_time;
  }
  return prunePickups(next, now);
}

/** Drop released/failed tickets, picked-up ones after a day, and anything past the newest MAX. Pure. */
export function prunePickups(list: SavedPickup[], now: number): SavedPickup[] {
  return list
    .filter((p) => p.status === "held" || p.status === "pending" || (p.status === "paid" && now - (p.paid ?? p.saved) < DAY))
    .filter((p) => now - p.saved < 3 * DAY)
    .sort((a, b) => b.saved - a.saved)
    .slice(0, MAX);
}

/** What the strip shows first: tickets still waiting, then the ones just picked up. Pure. */
export function waitingFirst(list: SavedPickup[]): SavedPickup[] {
  return [...list].sort((a, b) => Number(a.status !== "held") - Number(b.status !== "held") || b.saved - a.saved);
}

// ── localStorage (every read and write tolerates a blocked or full store) ──

function read(): SavedPickup[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed.filter((p) => p && typeof p.id === "string") as SavedPickup[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();

function write(list: SavedPickup[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* a private window: the tickets still work, they just aren't remembered */
  }
  snapshot = JSON.stringify(list);
  listeners.forEach((l) => l());
}

/** Remember these orders on this phone (held → saved; status changes → updated). */
export function rememberOrders(orders: OrderLike[]) {
  if (typeof window === "undefined" || orders.length === 0) return;
  const before = read();
  const after = upsertPickups(before, orders, Date.now());
  if (JSON.stringify(after) !== JSON.stringify(before)) write(after);
}

let snapshot = "[]";
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      snapshot = JSON.stringify(read());
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}
function getSnapshot(): string {
  const fresh = JSON.stringify(prunePickups(read(), Date.now()));
  if (fresh !== snapshot) snapshot = fresh;
  return snapshot;
}

/** The saved tickets, live across tabs (empty on the server and before hydration). */
export function useSavedPickups(): SavedPickup[] {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  return waitingFirst(JSON.parse(raw) as SavedPickup[]);
}
