import { z } from "zod";
import { badRequest, serverError } from "@/lib/http";
import { pickupOrder } from "@/lib/orders/lifecycle";

export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().regex(/^\d{4}$/) });

// Owner enters the customer's 4-digit code → Visa capture → PAID.
export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/pickup">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { code: \"1234\" }");
  try {
    return await pickupOrder(req, id, parsed.data.code);
  } catch (err) {
    return serverError(err);
  }
}
