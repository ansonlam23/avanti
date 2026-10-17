"use client";

import { useEffect, useEffectEvent } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ShopPing } from "@/lib/realtime/types";

let browser: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient | null {
  if (browser) return browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  browser = createClient(url, key, { auth: { persistSession: false } });
  return browser;
}

/**
 * Subscribe to pings for one or more shops. Also fires `onPing({kind:"poll"})`
 * every `pollMs` as a fallback, so screens stay correct even if realtime drops.
 */
export function useShopPings(
  slugs: string[],
  onPing: (ping: ShopPing | { kind: "poll" }, slug: string | null) => void,
  pollMs = 2500,
) {
  const handle = useEffectEvent(onPing);
  const key = [...slugs].sort().join(",");

  useEffect(() => {
    const db = getBrowserClient();
    const list = key ? key.split(",") : [];
    const channels = db
      ? list.map((slug) =>
          db
            .channel(`shop:${slug}`)
            .on("broadcast", { event: "*" }, (msg) => handle(msg.payload as ShopPing, slug))
            .subscribe(),
        )
      : [];
    const timer = pollMs > 0 ? setInterval(() => handle({ kind: "poll" }, null), pollMs) : null;
    return () => {
      if (timer) clearInterval(timer);
      channels.forEach((ch) => db?.removeChannel(ch));
    };
  }, [key, pollMs]);
}
