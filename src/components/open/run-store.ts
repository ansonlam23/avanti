"use client";

import type { OnboardDraft } from "@/lib/ai/onboard";
import type { CreateShopResponse } from "@/lib/db/shops";

// Keeps the LAST REAL run in sessionStorage so `?shot=tags|review|live`
// (development) can replay a beat for retakes. Nothing here is ever
// invented: no saved run → no shot.

export interface OnboardResponse {
  draft: OnboardDraft;
  photo_url: string | null;
  ms: number;
}

export interface RunSnapshot {
  v: 1;
  response: OnboardResponse;
  photo: { dataUrl: string; width: number; height: number };
  elapsedAtDraftMs: number;
  savedAt: string;
}

export interface LiveSnapshot {
  v: 1;
  result: CreateShopResponse;
  elapsedMs: number;
  savedAt: string;
}

const RUN_KEY = "os_open_last_run";
const LIVE_KEY = "os_open_last_live";

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { v?: number };
    return v && v.v === 1 ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode: shots just won't be available
  }
}

export const saveRun = (s: RunSnapshot) => write(RUN_KEY, s);
export const loadRun = () => read<RunSnapshot>(RUN_KEY);
export const saveLive = (s: LiveSnapshot) => write(LIVE_KEY, s);
export const loadLive = () => read<LiveSnapshot>(LIVE_KEY);
