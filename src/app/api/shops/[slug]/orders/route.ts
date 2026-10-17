import { serverError } from "@/lib/http";
import { handleSignedOrder } from "@/lib/orders/create";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Visa calls can take ~15 s; never cut a hold off mid-flight

// The shop's agent order endpoint. Only signed requests from known agents get
// past the door (see src/lib/orders/create.ts and CONTRACTS §7/§9).
export async function POST(req: Request, ctx: RouteContext<"/api/shops/[slug]/orders">) {
  const { slug } = await ctx.params;
  try {
    return await handleSignedOrder(req, slug);
  } catch (err) {
    return serverError(err);
  }
}
