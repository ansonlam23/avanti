// Test fixtures for the MCP server (imported only by *.test.ts).
import { demoStreet, item, shop } from "@/lib/ai/tools/fixtures";
import type { ShopWithItems } from "@/lib/ai/tools/views";

export { NOW } from "@/lib/ai/tools/fixtures";

/** The shopper-tool demo street plus one visitor's private sandbox (listed = false). */
export function mcpStreet() {
  const street = demoStreet();
  const secret = shop({ slug: "secret-cakes", name: "Secret Cakes", listed: false });
  secret.items = [item(secret.id, { name: "Birthday cake", price_cents: 1500, stock: 2, sort: 1 })];
  return { ...street, secret, all: [...street.all, secret] };
}

/** What the DB-backed isListedShop answers, for fixture shops. */
export function listedIn(shops: ShopWithItems[]) {
  return async (slug: string) => shops.some((s) => s.slug === slug && s.listed === true);
}
