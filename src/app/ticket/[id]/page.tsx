import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InkBackdrop } from "@/components/brand/ink-backdrop";
import { TicketScreen } from "@/components/ticket/ticket-screen";
import { loadTicketOrder, UUID } from "@/lib/orders/ticket-server";
import { hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

// The shopper's pickup ticket (CONTRACTS §18). The order id in the URL is the
// capability: whoever holds the link can see the code and pick the order up.
export const metadata: Metadata = {
  title: "Your pickup ticket",
  robots: { index: false, follow: false },
};

export default async function TicketPage(props: PageProps<"/ticket/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id) || !hasSupabase()) notFound();
  const order = await loadTicketOrder(id);
  if (!order) notFound();
  return (
    <>
      {/* laptops: trees in the side margins; a thin river strip along the bottom, never behind the ticket */}
      <InkBackdrop variant="thin" />
      <TicketScreen order={order} />
    </>
  );
}
