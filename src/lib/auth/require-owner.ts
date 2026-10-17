import "server-only";
import { getDb } from "@/lib/db/server";
import { jsonError } from "@/lib/http";
import { ownerTokenFrom, ownerTokenMatches } from "@/lib/auth/owner";

export type OwnerCheck =
  | { ok: true; shopId: string; slug: string }
  | { ok: false; response: Response };

/** Resolve a shop by slug or id and verify the caller's owner token. */
export async function requireOwner(
  req: Request,
  by: { slug: string } | { shopId: string },
): Promise<OwnerCheck> {
  const db = getDb();
  const query = db.from("shops").select("id, slug, owner_token_hash");
  const { data, error } =
    "slug" in by ? await query.eq("slug", by.slug).maybeSingle() : await query.eq("id", by.shopId).maybeSingle();
  if (error) return { ok: false, response: jsonError(500, "db_error", error.message) };
  if (!data) return { ok: false, response: jsonError(404, "not_found", "Shop not found") };
  if (!ownerTokenMatches(ownerTokenFrom(req), data.owner_token_hash)) {
    return { ok: false, response: jsonError(403, "not_owner", "This needs the shop's owner link") };
  }
  return { ok: true, shopId: data.id, slug: data.slug };
}
