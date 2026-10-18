"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteNav } from "@/components/landing/site-nav";
import type { TicketOrder } from "@/lib/orders/progress";
import { LiveTicket, TICKET_COLUMN } from "./live-ticket";
import { PickupsStrip } from "./pickups-strip";

/** /ticket/[id]: one pickup ticket, full screen, plus this phone's other pickups. */
export function TicketScreen({ order }: { order: TicketOrder }) {
  return (
    <div className="flex min-h-svh flex-col">
      {/* the shared top bar: "avanti shopper" and the one menu (the ticket is the shopper's side) */}
      <SiteNav section="shopper" current="shop" className="pb-3 lg:pb-3" />
      {/* one centred column on every screen: the ticket, its stamp card, then this phone's other pickups */}
      <main data-ink-block="children" className="flex w-full flex-1 flex-col items-center gap-6 px-5 pb-16 pt-2 lg:gap-8 lg:pt-6">
        <LiveTicket id={order.id} initial={order} />
        {/* tablets and laptops: right under the ticket; phones keep it at the end of the column */}
        <Link href="/ask" className="link-ink text-[19px]! max-sm:hidden">
          Ask for something else <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </Link>
        <PickupsStrip exclude={[order.id]} title="Your other pickups" className={TICKET_COLUMN} />
        <Link href="/ask" className="link-ink text-[19px]! sm:hidden">
          Ask for something else <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </Link>
      </main>
    </div>
  );
}
