import "server-only";
import { getDb } from "@/lib/db/server";
import type { ShopPing } from "@/lib/realtime/types";

/**
 * Tell every open screen that something changed for a shop.
 * Pings are tiny on purpose ("go refetch"); no order data or pickup codes
 * travel over the public channel. Failures are logged, never thrown:
 * screens also poll every few seconds as a fallback.
 */
export async function notifyShop(slug: string, ping: ShopPing): Promise<void> {
  try {
    const db = getDb();
    const channel = db.channel(`shop:${slug}`);
    try {
      const res = await channel.httpSend(ping.kind, ping, { timeout: 3000 });
      if (!res.success) console.warn(`[realtime] ${slug} ${ping.kind}: ${res.status} ${res.error}`);
    } finally {
      await db.removeChannel(channel);
    }
  } catch (err) {
    console.warn(`[realtime] notify failed for ${slug}:`, (err as Error).message);
  }
}
