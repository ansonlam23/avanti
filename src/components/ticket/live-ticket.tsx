"use client";

import { useState } from "react";
import { shareText, type TicketOrder } from "@/lib/orders/progress";
import { cn } from "@/lib/utils";
import { Ticket } from "./ticket";
import { TicketStamps } from "./ticket-stamps";
import { useTicket } from "./use-ticket";

/**
 * One live pickup ticket plus its stamp card. Used by /ticket/[id] and by the
 * sheet that opens in /ask after "Confirm & hold" (same component, same data).
 */
export function LiveTicket({
  id,
  initial,
  wide = false,
  className,
}: {
  id: string;
  initial: TicketOrder | null;
  /** Laptop: the stamp card stands beside the ticket instead of under it. */
  wide?: boolean;
  className?: string;
}) {
  const { order, stamp, here, imHere, justReady } = useTicket(id, initial);
  const [shareNote, setShareNote] = useState<string | null>(null);

  if (!order) {
    return <div aria-busy className={cn("paper h-[520px] w-full max-w-[440px] animate-pulse opacity-60", className)} />;
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
      setShareNote("Link copied. Anyone with it can pick this up.");
    } catch {
      setShareNote(`Share this link: ${url}`);
    }
  }

  return (
    <div className={cn("flex w-full max-w-[440px] flex-col gap-5", wide && "lg:max-w-[904px] lg:flex-row lg:items-start lg:gap-6", className)}>
      <Ticket order={order} here={here} onHere={() => void imHere()} justReady={justReady} onShare={() => void share()} shareNote={shareNote} />
      {stamp && (order.status === "held" || order.status === "paid") ? <TicketStamps card={stamp} paid={order.status === "paid"} /> : null}
    </div>
  );
}
