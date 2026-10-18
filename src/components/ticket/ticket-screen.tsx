"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { APP_BAR, AppLogo } from "@/components/brand";
import type { TicketOrder } from "@/lib/orders/progress";
import { LiveTicket } from "./live-ticket";
import { PickupsStrip } from "./pickups-strip";

/** /ticket/[id]: one pickup ticket, full screen, plus this phone's other pickups. */
export function TicketScreen({ order }: { order: TicketOrder }) {
  return (
    <div className="flex min-h-svh flex-col bg-counter">
      <header className={`${APP_BAR} flex items-center justify-between gap-4 pb-3`}>
        <AppLogo section="shopper" />
        <Link href="/ask" className="link-ink text-[18px]! max-sm:hidden">
          Ask for something else <ArrowRight className="size-[17px]" strokeWidth={1.5} aria-hidden />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center gap-12 px-5 pb-16 pt-4 lg:max-w-[1000px] lg:pt-8">
        <LiveTicket id={order.id} initial={order} wide />
        <PickupsStrip exclude={[order.id]} title="Your other pickups" className="max-w-[440px] lg:max-w-[904px]" />
        <Link href="/ask" className="link-ink text-[19px]! sm:hidden">
          Ask for something else <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </Link>
      </main>
    </div>
  );
}
