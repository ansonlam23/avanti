import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { simulateBotAttack } from "@/lib/bots/simulate";
import { badRequest, serverError } from "@/lib/http";
import { notifyShop } from "@/lib/realtime/server";
import { LIMITS, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ slug: z.string().min(1).max(60), count: z.number().int().min(4).max(100).optional() });

// Owner-only: send a wave of bad bots at your own shop and watch the door log.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { slug, count? }");
  const limited = await rateLimit(req, "bots", ...LIMITS.bots);
  if (limited) return limited;
  try {
    const owner = await requireOwner(req, { slug: parsed.data.slug });
    if (!owner.ok) return owner.response;
    const result = await simulateBotAttack({
      origin: new URL(req.url).origin,
      slug: owner.slug,
      count: parsed.data.count,
    });
    await notifyShop(owner.slug, { kind: "blocked", reason: "unsigned", count: result.blocked });
    return Response.json(result);
  } catch (err) {
    return serverError(err);
  }
}
