"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { toast } from "sonner";
import { APP_BAR, AppLogo, SimulatedBadge } from "@/components/brand";
import { useOwnerToken } from "@/components/counter/use-owner-token";
import { SiteNav } from "@/components/landing/site-nav";
import { getMyShops, hasOwnerToken, rememberMyShop } from "@/lib/my-shops";
import type { Dashboard } from "@/lib/orders/dashboard";
import { useShopPings } from "@/lib/realtime/client";
import type { PaymentMode, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";

// The judge's stage: the AI shopper on the left, your own private shop's counter
// on the right, so the story reads left to right. Both are the real app in
// same-origin iframes (they share this browser's owner token and "my shops"),
// drawn at phone size on paper and scaled to the window's height (.lp-devices in
// landing.css). Between them, a three-step guide that only moves when the real
// thing happens: the shopper pane shows "Confirm & hold", then the counter's own
// data (the dashboard the counter reads) shows the new order held, then paid.

type Phase = "ask" | "confirm" | "handover" | "paid" | "released";
type Side = "shopper" | "counter";

const STEPS: { title: string; side: Side }[] = [
  { title: "Ask for something", side: "shopper" },
  { title: "Tap Confirm & hold", side: "shopper" },
  { title: "Hand it over", side: "counter" },
];
const AT: Record<Phase, number> = { ask: 0, confirm: 1, handover: 2, paid: 3, released: 3 };

type Honesty = { payments: PaymentMode; aiLive: boolean };

const rise = (s: number) => ({ "--rise": `${s}s` }) as CSSProperties;

/** One honesty line, following this server's real payment mode (and AI status, when it's off). */
function HonestLine({ payments, aiLive, className }: Honesty & { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[15px] leading-snug text-ink-muted lg:text-[16px]", className)}>
      {payments === "simulated" ? (
        <>
          <SimulatedBadge />
          <span>No Visa call · no money moved.</span>
        </>
      ) : (
        <span>Test card · Visa sandbox · no money moved.</span>
      )}
      {aiLive ? null : <span>The AI isn&apos;t connected on this server.</span>}
    </p>
  );
}

/** Where the demo is, read from the real app (never guessed). */
function useDemoPhase(slug: string, shopperFrame: RefObject<HTMLIFrameElement | null>) {
  const token = useOwnerToken(slug);
  const [data, setData] = useState<Dashboard | null>(null);
  const [proposed, setProposed] = useState(false);
  // Orders that were already there when the stage opened (or at "Run it again") don't count.
  const [baseline, setBaseline] = useState<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/shops/${slug}/dashboard`, { headers: { "x-owner-token": token }, cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json().catch(() => null)) as Dashboard | null;
    if (!d) return;
    setBaseline((b) => b ?? new Set(d.orders.map((o) => o.id)));
    setData(d);
  }, [slug, token]);

  useEffect(() => {
    // The first read once the owner token is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token) void refresh();
  }, [token, refresh]);
  useShopPings(token ? [slug] : [], () => void refresh(), 2500);

  // The shopper pane (same origin, read only): is an order waiting for "Confirm & hold"?
  useEffect(() => {
    const id = window.setInterval(() => {
      let on = false;
      try {
        const doc = shopperFrame.current?.contentDocument;
        on = !!doc && Array.from(doc.querySelectorAll("button")).some((b) => (b.textContent ?? "").trim().startsWith("Confirm & hold"));
      } catch {
        /* unreadable: the guide just waits for the counter */
      }
      setProposed(on);
    }, 700);
    return () => window.clearInterval(id);
  }, [shopperFrame]);

  const fresh = baseline ? data?.orders.find((o) => !baseline.has(o.id)) : undefined;
  let phase: Phase = "ask";
  if (fresh?.status === "paid") phase = "paid";
  else if (fresh?.status === "released") phase = "released";
  else if (fresh?.status === "held") phase = "handover";
  else if (fresh?.status === "pending" || proposed) phase = "confirm";

  const again = useCallback(() => {
    if (data) setBaseline(new Set(data.orders.map((o) => o.id)));
  }, [data]);

  // A new order proposed after the last one finished starts the next round by itself.
  const finished = phase === "paid" || phase === "released";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (finished && proposed) again();
  }, [finished, proposed, again]);

  const pick = data?.items.find((i) => !i.sold_out && i.price_cents != null);
  return { phase, item: pick ? (pick.name_en ?? pick.name) : null, again };
}

function Hint({ side, children }: { side: Side; children: React.ReactNode }) {
  return (
    <span className="mt-2 flex items-center gap-2 text-[16px] leading-snug text-ink-muted lg:text-[17px]">
      {side === "shopper" ? <ArrowLeft aria-hidden className="hidden size-4 shrink-0 text-carbon md:inline" strokeWidth={1.75} /> : null}
      <span>{children}</span>
      {side === "counter" ? <ArrowRight aria-hidden className="hidden size-4 shrink-0 text-carbon md:inline" strokeWidth={1.75} /> : null}
    </span>
  );
}

/** The three steps, the current one large; on phones each side's tab opens from its step. */
function Guide({
  phase,
  item,
  onAgain,
  slug,
  phone = false,
  className,
  ...honesty
}: Honesty & { phase: Phase; item: string | null; onAgain: () => void; slug: string; phone?: boolean; className?: string }) {
  const at = AT[phase];
  const hints: Record<number, string> = {
    0: item ? `Try “${item}”.` : "Anything on the menu.",
    1: "Held, not charged.",
    2: "Type the pickup code.",
  };
  return (
    <div className={cn("flex flex-col", className)}>
      <ol aria-live="polite" className="flex flex-col gap-5">
        {STEPS.map((s, i) => {
          const state = i < at ? "done" : i === at ? "now" : "next";
          return (
            <li key={s.title} className="flex gap-4" aria-current={state === "now" ? "step" : undefined}>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center font-mono text-[15px] transition-colors duration-500",
                  state === "now" ? "bg-carbon text-paper" : state === "done" ? "text-carbon outline outline-1 -outline-offset-1 outline-carbon/40" : "text-ink-muted outline outline-1 -outline-offset-1 outline-ink/16",
                )}
              >
                {state === "done" ? <Check className="size-4" strokeWidth={2} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block font-display leading-[1.1] transition-colors duration-500",
                    state === "now" ? "text-[26px] text-ink lg:max-xl:text-[24px] xl:text-[28px]" : "text-[19px] text-ink-muted",
                  )}
                >
                  {s.title}
                  {state === "done" ? <span className="sr-only"> (done)</span> : null}
                </span>
                {state === "now" ? <Hint side={s.side}>{hints[i]}</Hint> : null}
                {phone && i === 0 ? (
                  <a href="/ask" target="_blank" rel="noreferrer" className="btn-ink mt-4 w-full justify-between">
                    Open the shopper <ArrowUpRight className="size-5" aria-hidden />
                  </a>
                ) : null}
                {phone && i === 2 ? (
                  <a href={`/shop/${slug}`} target="_blank" rel="noreferrer" className="btn-line mt-4 w-full justify-between">
                    Open your counter <ArrowUpRight className="size-5" aria-hidden />
                  </a>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {at === 3 ? (
        <div className="ink-rise mt-7 border-t border-ink/16 pt-6">
          <p className="font-display text-[26px] leading-[1.1] text-carbon lg:text-[28px]">
            {phase === "paid" ? "Paid at pickup." : "Released. Nothing charged."}
          </p>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">
            Also try on your counter:
            <span className="block text-ink">Menu → sold out</span>
            <span className="block text-ink">Door log → test bots</span>
          </p>
          <button type="button" onClick={onAgain} className="btn-quiet -ml-3 mt-3">
            Run it again
          </button>
        </div>
      ) : null}

      <HonestLine {...honesty} className="mt-8 border-t border-ink/16 pt-5" />
    </div>
  );
}

function Pane({ src, label, on, frameRef }: { src: string; label: string; on: boolean; frameRef?: RefObject<HTMLIFrameElement | null> }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption className={cn("label-print text-[13px] transition-colors duration-500", on ? "text-carbon" : "text-ink-muted")}>{label}</figcaption>
      <div
        className="lp-device"
        // the pane where the current step happens carries a teal edge
        style={{ outlineColor: on ? "var(--color-carbon)" : undefined, outlineWidth: on ? 2 : undefined, outlineOffset: on ? -2 : undefined, transition: "outline-color 500ms" }}
      >
        <div className="lp-device-screen">
          <iframe ref={frameRef} title={label} src={src} allow="microphone; camera; clipboard-write" />
        </div>
      </div>
    </figure>
  );
}

function Stage({ slug, onSwitch, ...honesty }: Honesty & { slug: string; onSwitch: () => void }) {
  const shopperFrame = useRef<HTMLIFrameElement | null>(null);
  const { phase, item, again } = useDemoPhase(slug, shopperFrame);
  const side = phase === "ask" || phase === "confirm" ? "shopper" : "counter";
  return (
    <div className="flex min-h-dvh flex-col">
      <header className={cn("flex w-full flex-wrap items-center justify-between gap-3 pb-2", APP_BAR)}>
        <AppLogo section="demo" />
        <button type="button" onClick={onSwitch} className="btn-quiet -mr-3">
          Switch shop
        </button>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pb-8 md:px-8">
        {/* laptops and tablets: the shopper, the guide, your counter (scaled to the window height);
            the guide sits between the panes when the screen is landscape and wide enough, else above them */}
        <div className="lp-devices hidden w-full max-w-page flex-wrap items-start justify-center gap-x-12 gap-y-8 md:flex">
          <Pane src="/ask" label="The shopper" on={side === "shopper"} frameRef={shopperFrame} />
          <Guide
            {...honesty}
            phase={phase}
            item={item}
            onAgain={again}
            slug={slug}
            className="order-first w-full max-w-[560px] lg:max-xl:[@media(min-aspect-ratio:13/10)]:order-none lg:max-xl:[@media(min-aspect-ratio:13/10)]:w-[260px] lg:max-xl:[@media(min-aspect-ratio:13/10)]:self-center xl:order-none xl:w-[328px] xl:self-center"
          />
          <Pane src={`/shop/${slug}`} label="Your counter" on={side === "counter"} />
        </div>

        {/* phones: a phone can't hold two phones; each side opens in its own tab from its step */}
        <div className="flex w-full max-w-[440px] flex-col pt-4 md:hidden">
          <Guide {...honesty} phase={phase} item={item} onAgain={again} slug={slug} phone />
        </div>
      </main>
    </div>
  );
}

const PREVIEW = ["Ask for something", "Tap Confirm & hold", "Hand it over"];

export function DemoStage({ slug: initial, payments, aiLive }: { slug: string } & Honesty) {
  const [slug, setSlug] = useState<string | null>(null);
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [mine, setMine] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const owned = getMyShops().filter(hasOwnerToken);
    // Reading browser storage has to happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMine(owned);
    if (initial && hasOwnerToken(initial)) setSlug(initial);
    fetch("/api/demo/shops", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { shops: [] }))
      .then((b: { shops: Shop[] }) => setShops(b.shops ?? []))
      .catch(() => setShops([]));
  }, [initial]);

  const choose = useCallback((s: string) => {
    setSlug(s);
    const url = new URL(window.location.href);
    url.searchParams.set("shop", s);
    window.history.replaceState(null, "", url);
  }, []);

  async function copy(source: Shop) {
    setBusy(source.slug);
    const res = await fetch("/api/demo/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: source.slug }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return toast.error(body?.error?.message ?? "Couldn't open your copy");
    rememberMyShop(body.shop.slug, body.owner_token);
    setMine((m) => [body.shop.slug, ...m]);
    choose(body.shop.slug);
  }

  if (slug) return <Stage slug={slug} onSwitch={() => setSlug(null)} payments={payments} aiLive={aiLive} />;

  const honesty = { payments, aiLive };
  return (
    <>
      <SiteNav section="demo" />
      <main className="mx-auto grid w-full max-w-page flex-1 content-start gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-12 lg:gap-x-10 lg:px-12 lg:pb-16 lg:pt-[clamp(1rem,5vh,3.5rem)]">
        <div className="lg:col-span-5">
          <h1 className="lp-rise font-display text-[44px] leading-[1.04] text-carbon lg:text-[clamp(3.5rem,1.8rem+2.4vw,4.75rem)]">
            Pick a shop.
          </h1>
          <p className="lp-rise mt-4 text-[17px] leading-snug text-ink-muted lg:mt-5 lg:text-[20px]" style={rise(0.08)}>
            You run it. An AI shopper orders.
          </p>
          <ol className="lp-rise mt-8 flex flex-col gap-3 lg:mt-12 lg:gap-4" style={rise(0.16)} aria-label="What you'll do">
            {PREVIEW.map((s, i) => (
              <li key={s} className="flex items-baseline gap-4 text-[17px] leading-snug text-ink lg:text-[18px]">
                <span className="w-4 shrink-0 font-mono text-[15px] text-ink-muted">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <HonestLine {...honesty} className="mt-12 hidden lg:flex" />
        </div>

        <div className="lg:col-span-6 lg:col-start-7">
          {shops === null ? (
            <div className="grid gap-2.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[68px] animate-pulse bg-counter-deep/60" />
              ))}
            </div>
          ) : shops.length === 0 ? (
            <div className="pad px-6 py-7 shadow-slip">
              <p className="font-display text-[28px] leading-tight">No demo shops here yet.</p>
              <Link href="/open" className="btn-ink mt-6 w-full justify-between">
                Open your own shop <ArrowRight className="size-5" aria-hidden />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-2.5">
              {shops.map((s, i) => (
                <li key={s.id} className="lp-rise" style={rise(0.1 + i * 0.04)}>
                  <button
                    type="button"
                    onClick={() => copy(s)}
                    disabled={busy !== null}
                    aria-label={`${s.name}, open your private copy`}
                    className="lp-door paper flex min-h-[68px] w-full items-center justify-between gap-4 px-6 py-3 text-left disabled:opacity-60"
                  >
                    <span className="min-w-0 font-display text-[24px] leading-[1.15] text-ink lg:text-[26px]">{s.name}</span>
                    {busy === s.slug ? (
                      <span className="shrink-0 text-[15px] text-ink-muted">Opening your copy…</span>
                    ) : (
                      <ArrowRight className="size-5 shrink-0 text-carbon" strokeWidth={1.5} aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mine.length > 0 ? (
            <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="label-print text-[13px] text-ink-muted">Yours</span>
              {mine.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => choose(s)}
                  className="inline-flex min-h-11 items-center border border-ink/30 px-3.5 font-mono text-[15px] text-ink transition-colors hover:border-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {shops?.length ? (
            <p className="mt-8">
              <Link href="/open" className="link-ink font-sans text-[16px] tracking-normal text-ink-muted hover:text-ink lg:text-[17px]">
                <span>Or open your own</span>
                <ArrowRight className="size-[17px]" strokeWidth={1.5} aria-hidden />
              </Link>
            </p>
          ) : null}

          <HonestLine {...honesty} className="mt-10 lg:hidden" />
        </div>
      </main>
    </>
  );
}
