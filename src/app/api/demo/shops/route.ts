import { listListedShops } from "@/lib/demo/copy";
import { serverError } from "@/lib/http";

export const dynamic = "force-dynamic";

// The public demo shops (listed). Visitor sandboxes are never listed here.
export async function GET() {
  try {
    const shops = await listListedShops();
    return Response.json({ shops }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return serverError(err);
  }
}
