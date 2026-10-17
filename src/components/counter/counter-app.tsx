"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OpenSign, sfx } from "@/components/brand";
import { formatCents } from "@/lib/format";
import { useShopPings } from "@/lib/realtime/client";
import type { Item } from "@/lib/types";
import type { Dashboard, DashboardOrder } from "@/lib/orders/dashboard";
import { CounterView } from "./counter-view";
import { speakOrders, useOrderVoice } from "./speak";
import { useOwnerToken } from "./use-owner-token";
import { useWide } from "./use-wide";

type Load = { state: "loading" } | { state: "ready"; data: Dashboard } | { state: "error"; message: string; code?: string };

export function CounterApp({ slug }: { slug: string }) {
  const token = useOwnerToken(slug);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [padFor, setPadFor] = useState<DashboardOrder | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [simulating, setSimulating] = useState(false);
  const known = useRef<Set<string> | null>(null);
  useOrderVoice();

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", "x-owner-token": token ?? "", ...(init?.headers ?? {}) },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      return { res, body };
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const { res, body } = await api(`/api/shops/${slug}/dashboard`);
    if (!res.ok) {
      setLoad({ state: "error", message: body?.error?.message ?? "Couldn't load the counter", code: body?.error?.code });
      return;
    }
    const data = body as Dashboard;
    // Announce orders we haven't seen before (not on first load).
    // Pending orders don't count as "seen": they're announced once they turn held.
    const ids = new Set(data.orders.filter((o) => o.status !== "pending").map((o) => o.id));
    if (known.current) {
      const added = data.orders.filter((o) => !known.current!.has(o.id) && o.status === "held");
      for (const o of added) {
        toast.success(`New order · ${o.qty > 1 ? `${o.qty}× ` : ""}${o.item_name}`, {
          description: `${o.agent_id ? "Verified ✓ · " : ""}${formatCents(o.amount_cents)} held`,
        });
      }
      if (added.length) {
        sfx.play("doorbell");
        // …then read them aloud (only when sound is on; the toggle's tap unlocked it)
        speakOrders(added);
        setFresh((s) => new Set([...s, ...added.map((o) => o.id)]));
        setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !added.some((o) => o.id === id)))), 6000);
      }
    }
    known.current = ids;
    setLoad({ state: "ready", data });
  }, [api, slug, token]);

  useEffect(() => {
    // Initial load once the owner token is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token) void refresh();
  }, [token, refresh]);

  useShopPings(token ? [slug] : [], () => void refresh(), 2500);

  async function toggleSoldOut(item: Item, soldOut: boolean) {
    setBusy(item.id);
    const { res, body } = await api(`/api/items/${item.id}/sold-out`, {
      method: "POST",
      body: JSON.stringify({ sold_out: soldOut }),
    });
    setBusy(null);
    if (!res.ok) return toast.error(body?.error?.message ?? "Couldn't update the item");
    if (soldOut && body.held_orders > 0) {
      toast.warning(`${item.name} is sold out for new orders`, {
        description: `${body.held_orders} held order${body.held_orders > 1 ? "s" : ""} still keep their item.`,
      });
    }
    void refresh();
  }

  // The owner's rules for AI orders (CONTRACTS §13): a spending cap, and items kept off-limits to AI.
  async function setAiLimit(cents: number | null): Promise<boolean> {
    setBusy("ai-limit");
    const { res, body } = await api(`/api/shops/${slug}/rules`, {
      method: "POST",
      body: JSON.stringify({ ai_max_order_cents: cents }),
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(body?.error?.message ?? "Couldn't change the AI limit");
      return false;
    }
    toast(cents === null ? "AI orders: no cap" : `AI orders up to ${formatCents(cents)}`);
    void refresh();
    return true;
  }

  async function toggleAiOrderable(item: Item, orderable: boolean) {
    setBusy(item.id);
    const { res, body } = await api(`/api/items/${item.id}/ai-orderable`, {
      method: "POST",
      body: JSON.stringify({ ai_orderable: orderable }),
    });
    setBusy(null);
    if (!res.ok) return toast.error(body?.error?.message ?? "Couldn't update the item");
    if (!orderable) toast(`${item.name} is in-person only`, { description: "AI shoppers will be asked to order it at the shop." });
    void refresh();
  }

  async function pickup(order: DashboardOrder, code: string): Promise<boolean> {
    const { res, body } = await api(`/api/orders/${order.id}/pickup`, { method: "POST", body: JSON.stringify({ code }) });
    if (res.ok) {
      toast.success(`Charged ${formatCents(order.amount_cents)}`, { description: `${order.item_name} picked up` });
      setPadFor(null);
      void refresh();
      return true;
    }
    if (body?.error?.code !== "wrong_code") toast.error(body?.error?.message ?? "Couldn't charge the hold");
    return false;
  }

  async function release(order: DashboardOrder) {
    setBusy(order.id);
    const { res, body } = await api(`/api/orders/${order.id}/release`, { method: "POST", body: "{}" });
    setBusy(null);
    if (!res.ok) return toast.error(body?.error?.message ?? "Couldn't release the hold");
    toast(`Released ${formatCents(order.amount_cents)} hold`, { description: "No-show: the customer wasn't charged." });
    void refresh();
  }

  async function simulateBots() {
    setSimulating(true);
    const { res, body } = await api(`/api/bot/simulate`, { method: "POST", body: JSON.stringify({ slug }) });
    setSimulating(false);
    if (!res.ok) return toast.error(body?.error?.message ?? "Bot simulator isn't ready yet");
    toast(`${body.blocked} bots turned away`, { description: `${body.reached_visa} reached Visa` });
    void refresh();
  }

  if (token === undefined) return <CounterSkeleton />;
  if (token === null) return <PrivateCounter slug={slug} />;
  if (load.state === "loading") return <CounterSkeleton />;
  if (load.state === "error") {
    return load.code === "not_owner" ? <PrivateCounter slug={slug} /> : <Notice title="Counter unavailable" body={load.message} retry />;
  }

  return (
    <CounterView
      data={load.data}
      fresh={fresh}
      busy={busy}
      simulating={simulating}
      padFor={padFor}
      onPickedUp={setPadFor}
      onPadClose={() => setPadFor(null)}
      onPadSubmit={(code) => (padFor ? pickup(padFor, code) : Promise.resolve(false))}
      onNoShow={(o) => void release(o)}
      onToggleSoldOut={(item, soldOut) => void toggleSoldOut(item, soldOut)}
      onToggleAiOrderable={(item, orderable) => void toggleAiOrderable(item, orderable)}
      onAiLimit={setAiLimit}
      onSimulate={() => void simulateBots()}
    />
  );
}

/** Loading: the counter's own shapes, quietly (no layout jump when it fills in). Laptop: the dashboard's three columns. */
function CounterSkeleton() {
  const bar = "animate-pulse bg-counter-deep/80";
  return (
    <main
      className="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),14px)] md:max-w-xl lg:max-w-page lg:px-10 lg:pt-7"
      aria-busy
      aria-label="Loading the counter"
    >
      <div className={`h-7 w-24 lg:h-8 ${bar}`} />
      <div className={`mt-8 h-10 w-2/3 lg:mt-12 lg:h-14 lg:w-[420px] ${bar}`} />
      <div className="lg:hidden">
        <div className="mt-8 h-px bg-ink/15" />
        <div className="mx-1 mt-10 h-80 animate-pulse bg-counter-deep/60" />
      </div>
      <div className="mt-12 hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-x-14 gap-y-16 lg:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.15fr)_minmax(0,0.95fr)] xl:gap-x-12">
        <div className="row-span-2 xl:row-span-1">
          <div className={`h-6 w-32 ${bar}`} />
          <div className="mt-12 h-px bg-ink/15" />
          <div className="mx-auto mt-3 h-[420px] max-w-[440px] animate-pulse bg-counter-deep/60" />
        </div>
        <div>
          <div className={`h-6 w-24 ${bar}`} />
          <div className="mt-10 h-[420px] animate-pulse bg-counter-deep/60" />
        </div>
        <div>
          <div className={`h-6 w-28 ${bar}`} />
          <div className="mt-10 h-[420px] animate-pulse bg-counter-deep/60" />
        </div>
      </div>
    </main>
  );
}

function PrivateCounter({ slug }: { slug: string }) {
  return (
    <Notice title="This counter is private" body="Open it from the owner link you got when you opened your shop." slug={slug} />
  );
}

/** A closed door: the un-inked sign, one sentence, a way on (or, for an error, a way back in). */
function Notice({ title, body, slug, retry }: { title: string; body: string; slug?: string; retry?: boolean }) {
  const wide = useWide();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center lg:max-w-3xl lg:gap-12 lg:py-24">
      <OpenSign text="Closed" size={wide ? "lg" : "md"} mount="bare" state="off" sound={false} />
      <div>
        <h1 className="font-display text-[36px] leading-[1.08] text-balance lg:text-[60px] lg:leading-[1.02]">{title}</h1>
        <p className="mx-auto mt-4 max-w-[32ch] text-[16px] leading-relaxed text-ink-muted lg:mt-5 lg:max-w-[40ch] lg:text-[18px]">{body}</p>
      </div>
      <div className="flex flex-col items-center gap-3 lg:flex-row lg:gap-8">
        {retry ? (
          <button type="button" onClick={() => window.location.reload()} className="btn-ink px-8">
            Try again
          </button>
        ) : (
          <Link href="/open" className="btn-ink px-8">
            Open your own shop <ArrowRight aria-hidden className="size-5" />
          </Link>
        )}
        {slug ? (
          <Link href={`/s/${slug}`} className="link-ink text-[19px]!">
            See this shop&apos;s page <ArrowRight aria-hidden className="size-[18px]" strokeWidth={1.5} />
          </Link>
        ) : retry ? (
          <Link href="/open" className="link-ink text-[19px]!">
            Open your own shop <ArrowRight aria-hidden className="size-[18px]" strokeWidth={1.5} />
          </Link>
        ) : null}
      </div>
    </main>
  );
}
