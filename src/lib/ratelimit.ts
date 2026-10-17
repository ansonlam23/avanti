import "server-only";
import { getDb } from "@/lib/db/server";
import { jsonError } from "@/lib/http";

// Per-IP fixed-window rate limits for the public demo (protects the free AI
// quota and the sandbox). Fails OPEN on DB errors: a hiccup should never lock
// judges out of the demo.

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/** Returns a 429 Response when over the limit, otherwise null. */
export async function rateLimit(
  req: Request,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<Response | null> {
  try {
    const { data, error } = await getDb().rpc("hit_rate_limit", {
      p_key: `${bucket}:${clientIp(req)}`,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error || data !== false) return null;
    return jsonError(429, "rate_limited", "That's a lot of tries in a short time. Give it a minute and try again.");
  } catch {
    return null;
  }
}

/** Shared limits so every route uses the same numbers. */
export const LIMITS = {
  // Generous on purpose: venue Wi-Fi puts many people behind one IP.
  onboard: [30, 3600], // Gemini photo+voice reads per IP per hour (room for video retakes)
  chat: [150, 600], // shopper chat turns per IP per 10 min
  createShop: [20, 3600],
  demoCopy: [30, 3600],
  confirm: [60, 600],
  bots: [30, 600],
} as const satisfies Record<string, readonly [number, number]>;
