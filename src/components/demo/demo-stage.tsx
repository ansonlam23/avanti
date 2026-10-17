"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SimulatedBadge, Wordmark } from "@/components/brand";
import { SiteNav } from "@/components/landing/site-nav";
import { getMyShops, hasOwnerToken, rememberMyShop } from "@/lib/my-shops";
import type { PaymentMode, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";

// The judge's stage: your own private shop on the left (owner), the AI shopper
// on the right. Both are the real app in same-origin iframes, so they share
// this browser's owner token and "my shops". The two panes are drawn at phone
// size on paper (no device frames) and scaled to the window's height (see
// .lp-devices in landing.css).

const STEPS = [
  "Ask the AI for something on your menu.",
  "Tap Confirm & hold. The order lands: VERIFIED, HELD.",
  "Enter the shopper's pickup code: PAID. Or No-show: RELEASED.",
  "Mark an item sold out. The AI tells the shopper.",
  "Door log → Send 50 test bots. 0 reach Visa.",
];

type Honesty = { payments: PaymentMode; aiLive: boolean };

function HonestLine({ payments, aiLive, className }: Honesty & { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[15px] leading-snug text-ink-muted", className)}>
      {payments === "simulated" ? (
        <>
          <SimulatedBadge />
          <span>No Visa call · no money moved.</span>
        </>
      ) : (
        <span>Test card · Visa sandbox · no money moved.</span>
      )}
      <span>{aiLive ? "The AI is live." : "The AI isn't connected on this server."}</span>
    </p>
  );
}

function TryThis({ className, ...honesty }: Honesty & { className?: string }) {
  return (
    <ol className={cn("paper w-full space-y-3.5 px-7 pb-7 pt-7 text-[16px] leading-snug shadow-slip", className)}>
      <li className="pb-1.5 font-display text-[30px] leading-none text-carbon">Try this</li>
      {STEPS.map((s, i) => (
        <li key={i} className="flex gap-3.5">
          <span className="w-4 shrink-0 font-mono text-[15px] leading-[1.45] text-ink-muted">{i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
      <li className="border-t border-ink/16 pt-4">
        <HonestLine {...honesty} />
      </li>
    </ol>
  );
}

function Device({ src, label }: { src: string; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <figcaption className="label-print text-[13px] text-ink-muted">{label}</figcaption>
      <div className="lp-device">
        <div className="lp-device-screen">
          <iframe title={label} src={src} allow="microphone; camera; clipboard-write" />
        </div>
      </div>
    </figure>
  );
}

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

  if (slug) {
    return (
      <main className="flex min-h-dvh flex-col items-center px-4 pb-8 pt-4 md:px-8">
        <header className="flex w-full max-w-page flex-wrap items-center justify-between gap-3 pb-5 md:px-2">
          <Link href="/" aria-label="avanti, home" className="flex min-h-11 items-baseline gap-4">
            <Wordmark className="text-[28px]" />
            <span className="font-display text-[22px] leading-none text-ink-muted">both sides</span>
          </Link>
          <button type="button" onClick={() => setSlug(null)} className="btn-quiet">
            Switch shop
          </button>
        </header>

        {/* laptops and tablets: the two real phones (scaled to the window height) */}
        <div className="lp-devices hidden w-full max-w-page flex-wrap items-start justify-center gap-x-10 gap-y-8 md:flex">
          <Device src={`/shop/${slug}`} label="You, behind the counter" />
          <TryThis payments={payments} aiLive={aiLive} className="order-last max-w-[640px] xl:order-none xl:mt-12 xl:w-[330px]" />
          <Device src="/ask" label="A shopper, asking AI" />
        </div>

        {/* phones: a phone can't hold two phones; open each side on its own */}
        <div className="flex w-full max-w-[440px] flex-col gap-6 md:hidden">
          <p className="text-[16px] leading-relaxed text-ink-muted">
            On a laptop, both sides sit next to each other here. On a phone, open each side in its own tab.
          </p>
          <div className="flex flex-col gap-3">
            <a href={`/shop/${slug}`} target="_blank" rel="noreferrer" className="btn-ink justify-between">
              Your counter <ArrowUpRight className="size-5" aria-hidden />
            </a>
            <a href="/ask" target="_blank" rel="noreferrer" className="btn-line justify-between">
              The AI shopper <ArrowUpRight className="size-5" aria-hidden />
            </a>
          </div>
          <TryThis payments={payments} aiLive={aiLive} className="mt-2" />
        </div>
      </main>
    );
  }

  return (
    <>
      <SiteNav variant="page" />
      <main className="mx-auto grid w-full max-w-page flex-1 gap-14 px-6 pb-20 pt-8 lg:grid-cols-12 lg:gap-x-6 lg:px-10 lg:pt-12">
        <div className="lg:col-span-6">
          <p className="lp-rise label-print text-[13px] text-ink-muted">Both sides</p>
          <h1 className="lp-rise mt-4 font-display text-[44px] leading-[1.04] text-balance text-carbon lg:text-[clamp(3.5rem,1.6rem+2.6vw,4.75rem)]" style={{ "--rise": "0.06s" } as React.CSSProperties}>
            See both sides at once.
          </h1>
          <p className="lp-rise mt-5 max-w-[40ch] text-[17px] leading-relaxed text-ink-muted lg:text-[19px]" style={{ "--rise": "0.12s" } as React.CSSProperties}>
            Run your own private copy of a demo shop: your counter on the left, a shopper asking AI on the right.
          </p>

          <p className="label-print mt-12 text-[13px] text-ink-muted">Pick a demo shop</p>
          <div className="mt-4 grid max-w-[640px] gap-3 sm:grid-cols-2">
            {shops === null ? (
              <>
                <div className="h-[104px] animate-pulse bg-counter-deep/70" />
                <div className="h-[104px] animate-pulse bg-counter-deep/50" />
              </>
            ) : shops.length === 0 ? (
              <div className="pad px-6 py-6 shadow-slip sm:col-span-2">
                <p className="font-display text-[28px] leading-tight">No demo shops here yet</p>
                <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">
                  This server has no demo shops set up. You can still open your own from a photo of your desk.
                </p>
                <Link href="/open" className="btn-ink mt-6 w-full justify-between">
                  Open your own shop <ArrowRight className="size-5" aria-hidden />
                </Link>
              </div>
            ) : (
              shops.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => copy(s)}
                  disabled={busy !== null}
                  className="lp-door paper flex min-h-[104px] w-full items-center justify-between gap-4 px-5 py-4 text-left disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block font-display text-[24px] leading-[1.1] text-ink">{s.name}</span>
                    <span className="mt-1 block truncate text-[15px] text-ink-muted">
                      {busy === s.slug ? "Opening your copy…" : `${s.location_label ?? "Seattle"} · demo shop`}
                    </span>
                  </span>
                  <ArrowRight className="size-5 shrink-0 text-carbon" strokeWidth={1.5} aria-hidden />
                </button>
              ))
            )}
          </div>

          {mine.length > 0 ? (
            <div className="mt-10">
              <p className="label-print text-[13px] text-ink-muted">Your shops on this device</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {mine.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => choose(s)}
                    className="inline-flex min-h-11 items-center border border-ink/40 px-4 font-mono text-[15px] text-ink transition-colors hover:border-ink hover:bg-ink/[0.04]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {shops?.length ? (
            <p className="mt-8">
              <Link href="/open" className="btn-quiet -ml-3">
                Or open a shop from a photo of your desk <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden />
              </Link>
            </p>
          ) : null}
        </div>

        {/* what you'll do on the stage, as the slip that sits between the two panes */}
        <div className="lg:sticky lg:top-10 lg:col-span-5 lg:col-start-8 lg:self-start lg:pt-10">
          <TryThis payments={payments} aiLive={aiLive} className="mx-auto max-w-[460px] lg:text-[17px]" />
        </div>
      </main>
    </>
  );
}
