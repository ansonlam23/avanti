"use client";

import { useEffect, useState } from "react";
import { OrderTicket } from "@/components/counter/order-ticket";
import { Ticket } from "@/components/ticket/ticket";
import { TicketStamps } from "@/components/ticket/ticket-stamps";
import type { LoyaltyCard } from "@/lib/loyalty/stamps";
import type { TicketOrder } from "@/lib/orders/progress";
import { labOrder } from "./fixtures";

// /lab shots of the pickup ticket (CONTRACTS §18) in each state, with lab data,
// for clean screen recordings and for checking the design before migration 0007.

export type TicketShotState = "held" | "ready" | "here" | "paid";

const T0 = "2026-10-17T00:30:00.000Z"; // 5:30 PM in Seattle
const AT = "2026-10-17T00:12:00.000Z";

function ticketOrder(state: TicketShotState, readyNow: boolean): TicketOrder {
  return {
    id: "lab-ticket",
    status: state === "paid" ? "paid" : "held",
    qty: 1,
    amount_cents: 1800,
    currency: "USD",
    pickup_time: T0,
    pickup_code: "4821",
    payment_mode: "sandbox",
    card_last4: "1111",
    created_at: AT,
    item_name: "Chocolate cake",
    shop_name: "Mai's Bakery",
    shop_slug: "mais-bakery",
    shop_location: "University Way NE, Seattle",
    customer_name: "Anson",
    seen_at: AT,
    ready_at: state === "here" || state === "paid" || (state === "ready" && readyNow) ? AT : null,
    here_at: state === "here" ? AT : null,
  };
}

const CARD: LoyaltyCard = {
  shop_name: "Mai's Bakery",
  shop_slug: "mais-bakery",
  every: 5,
  reward: "a free cookie",
  stamps: 2,
  visit: 3,
  earned: false,
};

const noop = () => {};

export function TicketShot({ take, state }: { take: number; state: TicketShotState }) {
  // "ready": the owner taps Ready a beat after the take starts
  const [readyNow, setReadyNow] = useState(false);
  useEffect(() => {
    if (state !== "ready" || take === 0) return;
    const t = setTimeout(() => setReadyNow(true), 1400);
    return () => clearTimeout(t);
  }, [state, take]);
  const order = ticketOrder(state, readyNow);
  return (
    <main className="flex min-h-dvh w-full justify-center bg-counter px-5 py-10 lg:py-16">
      <div className="flex w-full max-w-[440px] flex-col gap-5 lg:max-w-[904px] lg:flex-row lg:items-start lg:gap-6">
        <Ticket order={order} here={{ busy: false, error: null }} onHere={noop} justReady={state === "ready"} onShare={noop} />
        <TicketStamps card={{ ...CARD, stamps: state === "paid" ? 3 : 2 }} paid={state === "paid"} />
      </div>
    </main>
  );
}

/** The counter's copy when the shopper taps "I'm here": "At the door now", and Mark ready. */
export function CounterDoorShot({ take }: { take: number }) {
  const [here, setHere] = useState(false);
  useEffect(() => {
    if (take === 0) return;
    const t = setTimeout(() => setHere(true), 900);
    return () => clearTimeout(t);
  }, [take]);
  const order = labOrder("lab-door", { customer_name: "Anson", seen_at: AT, ready_at: null, here_at: here ? AT : null });
  return (
    <main className="flex min-h-dvh w-full justify-center bg-counter px-5 py-12">
      <div className="w-full max-w-[440px] pt-4">
        <div aria-hidden className="steel-rail -mx-1" />
        <OrderTicket order={order} onPickedUp={noop} onNoShow={noop} onReady={noop} />
      </div>
    </main>
  );
}
