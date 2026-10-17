import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db/server";
import { generateAgentKeyPair, loadAgentSignerFromEnv, signRequest } from "@/lib/trust";
import type { BlockReason, OrderRequest } from "@/lib/types";

// The bot simulator fires real HTTP requests at the shop's order endpoint,
// the same door real agents use. Each bot plays a known attack:
//   unsigned       – a card-testing script with no signature at all
//   unknown agent  – signed, but by a key that isn't in the agent directory
//   replayed       – a captured, once-valid request sent again (nonce already used)
//   edited amount  – a captured, validly signed request with the amount changed
// None of them may create an order, so none can reach Visa. We prove that by
// counting the shop's orders before and after.

export type BotKind = "unsigned" | "unknown_agent" | "replayed" | "edited_amount";

const MIX: [BotKind, number][] = [
  ["unsigned", 0.4],
  ["unknown_agent", 0.2],
  ["replayed", 0.2],
  ["edited_amount", 0.2],
];

export interface BotRunResult {
  sent: number;
  blocked: number;
  reached_visa: number;
  by_reason: Partial<Record<BlockReason, number>>;
  by_bot: Partial<Record<BotKind, number>>;
  unexpected: { kind: BotKind; status: number }[];
}

export async function simulateBotAttack(opts: { origin: string; slug: string; count?: number }): Promise<BotRunResult> {
  const db = getDb();
  const count = Math.min(Math.max(opts.count ?? 50, 4), 100);
  const url = `${opts.origin}/api/shops/${encodeURIComponent(opts.slug)}/orders`;

  const { data: shop } = await db.from("shops").select("id").eq("slug", opts.slug).single<{ id: string }>();
  if (!shop) throw new Error("Shop not found");
  const { data: item } = await db
    .from("items")
    .select("id, price_cents")
    .eq("shop_id", shop.id)
    .not("price_cents", "is", null)
    .limit(1)
    .maybeSingle<{ id: string; price_cents: number }>();
  // A plausible target even for a shop with no priced items yet.
  const target = item ?? { id: randomUUID(), price_cents: 100 };

  const agent = loadAgentSignerFromEnv();
  const rogue = generateAgentKeyPair().signer;

  const { count: before } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shop.id);

  const kinds: BotKind[] = [];
  for (const [kind, share] of MIX) for (let i = 0; i < Math.round(count * share); i++) kinds.push(kind);

  const order = (): OrderRequest => ({
    item_id: target.id,
    qty: 1,
    amount_cents: target.price_cents,
    pickup_time: null,
    customer_name: null,
    idempotency_key: `bot-${randomUUID()}`,
  });

  async function buildBot(kind: BotKind): Promise<{ headers: Record<string, string>; body: string }> {
    const body = JSON.stringify(order());
    switch (kind) {
      case "unsigned":
        return { headers: { "content-type": "application/json" }, body };
      case "unknown_agent":
        return { headers: { ...signRequest({ method: "POST", url, body, signer: rogue }) }, body };
      case "replayed": {
        // A request that was valid once: its nonce is already spent.
        const nonce = randomUUID().replace(/-/g, "");
        const headers = signRequest({ method: "POST", url, body, signer: agent, nonce });
        const { error } = await db.from("agent_nonces").insert({
          nonce,
          key_id: agent.keyId,
          expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
        // Without the spent nonce this would be a VALID order: never send it.
        if (error) throw new Error(`Couldn't prepare the replay bot: ${error.message}`);
        return { headers: { ...headers }, body };
      }
      case "edited_amount": {
        // Captured with a valid signature, then the amount was changed (card-testing $1).
        const headers = signRequest({ method: "POST", url, body, signer: agent });
        const tampered = target.price_cents === 100 ? 1 : 100;
        const edited = JSON.stringify({ ...JSON.parse(body), amount_cents: tampered });
        if (edited === body) throw new Error("Edited-amount bot produced an unchanged body");
        return { headers: { ...headers }, body: edited };
      }
    }
  }

  const result: BotRunResult = { sent: 0, blocked: 0, reached_visa: 0, by_reason: {}, by_bot: {}, unexpected: [] };
  const bots = await Promise.all(kinds.map(async (kind) => ({ kind, req: await buildBot(kind) })));

  // Fire in waves of 10, like a script would.
  for (let i = 0; i < bots.length; i += 10) {
    await Promise.all(
      bots.slice(i, i + 10).map(async ({ kind, req }) => {
        result.sent++;
        result.by_bot[kind] = (result.by_bot[kind] ?? 0) + 1;
        const res = await fetch(url, {
          method: "POST",
          headers: { ...req.headers, "user-agent": `card-tester/0.${kind.length}` },
          body: req.body,
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { error?: { reason?: BlockReason } };
        if (res.status === 401 && json.error?.reason) {
          result.blocked++;
          result.by_reason[json.error.reason] = (result.by_reason[json.error.reason] ?? 0) + 1;
        } else {
          result.unexpected.push({ kind, status: res.status });
        }
      }),
    );
  }

  const { count: after } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shop.id);
  result.reached_visa = Math.max(0, (after ?? 0) - (before ?? 0));
  return result;
}
