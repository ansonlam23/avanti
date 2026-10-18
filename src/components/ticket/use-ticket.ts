"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "@/components/brand";
import type { LoyaltyCard } from "@/lib/loyalty/stamps";
import type { TicketOrder } from "@/lib/orders/progress";
import { useShopPings } from "@/lib/realtime/client";
import { rememberOrders } from "./saved-pickups";

// One live pickup ticket (CONTRACTS §18): the order, kept fresh by the shop's
// "go refetch" pings (they carry no order ids) with a 20 s poll behind them;
// its stamp card, if the shop runs one; and "I'm here".

const FINAL = new Set(["paid", "released", "failed"]);

export interface HereState {
  busy: boolean;
  error: string | null;
}

export function useTicket(id: string, initial: TicketOrder | null) {
  const [order, setOrder] = useState<TicketOrder | null>(initial);
  const [stamp, setStamp] = useState<LoyaltyCard | null>(null);
  const [here, setHere] = useState<HereState>({ busy: false, error: null });
  // Was it already ready when this ticket opened? (If not, Ready gets a small moment.)
  const [readyAtOpen] = useState(() => Boolean(initial?.ready_at));
  const rang = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { order?: TicketOrder };
      if (body.order) setOrder(body.order);
    } catch {
      /* offline for a moment: the next ping or poll tries again */
    }
  }, [id]);

  const loadStamp = useCallback(async () => {
    try {
      const res = await fetch(`/api/loyalty?order=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = res.ok ? ((await res.json()) as { loyalty?: LoyaltyCard | null }) : null;
      setStamp(body?.loyalty ?? null);
    } catch {
      setStamp(null);
    }
  }, [id]);

  // first load: always re-read (the chat's copy of the order has no pickup name or live status)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    void loadStamp();
  }, [refresh, loadStamp]);

  const status = order?.status;
  const final = status ? FINAL.has(status) : false;
  useShopPings(
    order?.shop_slug && !final ? [order.shop_slug] : [],
    (ping) => {
      if (ping.kind === "order" || ping.kind === "poll") void refresh();
    },
    final ? 0 : 20_000,
  );

  // remember it on this phone; re-read the stamp card once it's picked up
  useEffect(() => {
    if (order) rememberOrders([order]);
  }, [order]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "paid") void loadStamp();
  }, [status, loadStamp]);

  // Ready, live: a soft bell (only with sound on) and the "It's ready" moment.
  const readyAt = order?.ready_at ?? null;
  const justReady = Boolean(readyAt) && !readyAtOpen;
  useEffect(() => {
    if (!readyAt || readyAtOpen || rang.current) return;
    rang.current = true;
    if (!sfx.isMuted()) sfx.play("doorbell", { gain: 0.7 });
  }, [readyAt, readyAtOpen]);

  const imHere = useCallback(async () => {
    setHere({ busy: true, error: null });
    try {
      const res = await fetch(`/api/orders/${id}/here`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (!res.ok) {
        const message =
          body?.error?.code === "not_ready"
            ? "Couldn't tell the shop. Show your code at the counter."
            : (body?.error?.message ?? "Couldn't tell the shop. Try again.");
        setHere({ busy: false, error: message });
        return;
      }
      setHere({ busy: false, error: null });
      void refresh();
    } catch {
      setHere({ busy: false, error: "No connection. Show your code at the counter." });
    }
  }, [id, refresh]);

  return { order, stamp, here, imHere, justReady };
}
