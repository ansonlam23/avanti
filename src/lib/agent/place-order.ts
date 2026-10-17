import "server-only";
import { loadAgentSignerFromEnv, signRequest } from "@/lib/trust";
import type { OrderRequest } from "@/lib/types";

/**
 * The "avanti shopper" agent placing an order with a shop, over real HTTP,
 * exactly like an outside agent would: the JSON body is signed (RFC 9421 +
 * Content-Digest) with the agent's Ed25519 key, then POSTed to the shop's
 * order endpoint, which verifies it before anything else.
 */
export async function placeSignedOrder(opts: {
  origin: string; // e.g. https://open-sign.vercel.app
  slug: string;
  request: OrderRequest;
}): Promise<{ status: number; body: unknown }> {
  const url = `${opts.origin}/api/shops/${encodeURIComponent(opts.slug)}/orders`;
  const body = JSON.stringify(opts.request);
  const headers = signRequest({ method: "POST", url, body, signer: loadAgentSignerFromEnv() });
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "user-agent": "AvantiShopper/1.0" },
    body,
    cache: "no-store",
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
