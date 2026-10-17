import { z } from "zod";
import { copyDemoShop } from "@/lib/demo/copy";
import { badRequest, notFound, serverError } from "@/lib/http";
import { LIMITS, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({ slug: z.string().min(1).max(60) });

// Make a private, playable copy of a demo shop for this visitor.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { slug }");
  const limited = await rateLimit(req, "demo-copy", ...LIMITS.demoCopy);
  if (limited) return limited;
  try {
    const copy = await copyDemoShop(parsed.data.slug);
    if (!copy) return notFound("That demo shop doesn't exist");
    return Response.json(copy, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
