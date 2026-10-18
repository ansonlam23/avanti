"use client";

import { useEffect, useState } from "react";
import { shareText, type TicketOrder } from "@/lib/orders/progress";
import { cn } from "@/lib/utils";
import { Ticket } from "./ticket";
import { TicketStamps } from "./ticket-stamps";
import { useTicket } from "./use-ticket";

/** The ticket column's width: one centred column on every screen. */
export const TICKET_COLUMN = "w-full max-w-[540px]";

/**
 * One live pickup ticket, with the shop's stamp card under it. Used by
 * /ticket/[id] and by the sheet that opens in /ask after "Confirm & hold".
 */
export function LiveTicket({ id, initial, className }: { id: string; initial: TicketOrder | null; className?: string }) {
  const { order, stamp, here, imHere, justReady } = useTicket(id, initial);
  const [copied, setCopied] = useState(false);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!order) {
    return <div aria-busy className={cn(TICKET_COLUMN, "paper h-[560px] animate-pulse opacity-60", className)} />;
  }

  // Send to a friend: the phone's share sheet when there is one, else copy the link.
  async function share() {
    if (!order) return;
    const url = `${window.location.origin}/ticket/${order.id}`;
    const text = shareText(order);
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: "Pickup ticket", text, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return; // they closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      setFallbackLink(url);
    }
  }

  return (
    <div className={cn(TICKET_COLUMN, "flex flex-col gap-6 lg:gap-8", className)}>
      <Ticket
        order={order}
        here={here}
        onHere={() => void imHere()}
        justReady={justReady}
        onShare={() => void share()}
        copied={copied}
        fallbackLink={fallbackLink}
      />
      {stamp && (order.status === "held" || order.status === "paid") ? <TicketStamps card={stamp} paid={order.status === "paid"} /> : null}
    </div>
  );
}
