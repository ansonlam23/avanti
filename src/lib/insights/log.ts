import "server-only";
import { after } from "next/server";
import type { SearchShopsResult } from "@/lib/ai/shopper-types";
import { getDb } from "@/lib/db/server";
import { searchLogRow } from "./queries";
import type { AiQueryInsert, AiQuerySource } from "./types";

/**
 * Log one search_shops call for the owners' insights (CONTRACTS §16). Fire and
 * forget: the insert runs after the response is sent, through Next's after()
 * (on Vercel it keeps the function alive until the insert is done), so it never
 * slows the tool, and a failure only prints a line. Outside a Next request
 * (tests, scripts) after() isn't available and nothing is logged.
 */
export function logSearch(
  source: AiQuerySource,
  args: { query?: unknown; needed_by?: unknown },
  result: Pick<SearchShopsResult, "shops" | "other_open_shops">,
): void {
  try {
    const row = searchLogRow(source, args, result);
    if (row) after(() => insertSearch(row));
  } catch {
    // No request scope, or a result we can't read: skip it. Logging never breaks a search.
  }
}

export async function insertSearch(row: AiQueryInsert): Promise<void> {
  try {
    const { error } = await getDb().from("ai_queries").insert(row);
    if (error) console.error("[insights] couldn't log a search:", error.message);
  } catch (err) {
    console.error("[insights] couldn't log a search:", err instanceof Error ? err.message : err);
  }
}
