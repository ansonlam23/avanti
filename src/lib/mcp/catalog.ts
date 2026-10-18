import "server-only";
import { SLUG_RE } from "@/lib/ai/tools/catalog";
import { getDb } from "@/lib/db/server";

/**
 * Is `slug` one of avanti's public (listed) shops? The MCP server is open to
 * any AI, so it only serves listed shops: visitors' private sandboxes
 * (CONTRACTS §11) stay out of it, even by slug.
 */
export async function isListedShop(slug: string): Promise<boolean> {
  if (!SLUG_RE.test(slug) || slug.length > 60) return false;
  const { data, error } = await getDb().from("shops").select("id").eq("slug", slug).eq("listed", true).maybeSingle();
  if (error) throw new Error(`check listed shop ${slug}: ${error.message}`);
  return data !== null;
}
