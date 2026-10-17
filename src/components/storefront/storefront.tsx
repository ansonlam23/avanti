import Link from "next/link";
import { ArrowRight, Lock, MapPin } from "lucide-react";
import { OpenSign } from "@/components/brand";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { formatClock } from "@/lib/format";
import type { Item, Shop } from "@/lib/types";
import { AiReadyBadge } from "./ai-ready-badge";
import { OwnerLink } from "./owner-link";
import { StorefrontMenu } from "./storefront-menu";

// /s/[slug]: the human storefront. Phone: one column (photo print with its
// OPEN slip, name, pickup, the menu slip). Laptop: the shop on the left
// (sticky), the menu slip on the right as the focal point.

export function Storefront({ shop, items }: { shop: Shop; items: Item[] }) {
  const pickup = `${formatClock(shop.pickup_window.start)}–${formatClock(shop.pickup_window.end)}`;
  const sign = { text: shop.open ? "OPEN" : "CLOSED", state: shop.open ? ("on" as const) : ("off" as const) };
  return (
    <>
      <SiteNav variant="page" />
      <main className="mx-auto grid w-full max-w-page px-5 pb-10 pt-5 sm:px-8 lg:grid-cols-12 lg:gap-x-6 lg:px-10 lg:pb-20 lg:pt-10">
        <header className="mx-auto w-full max-w-[480px] lg:sticky lg:top-10 lg:col-span-5 lg:mx-0 lg:max-w-none lg:self-start">
          {shop.photo_url ? (
            <div className="relative mx-auto w-[88%] lg:mx-0 lg:w-[92%]">
              <figure className="lp-print pb-3!" style={{ rotate: "-1.6deg" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URL */}
                <img
                  src={shop.photo_url}
                  alt={`${shop.name}'s counter`}
                  width={1200}
                  height={900}
                  className="aspect-[4/3] w-full rounded-[1px] object-cover"
                />
              </figure>
              <OpenSign
                size="sm"
                mount="bare"
                state={sign.state}
                text={sign.text}
                sound={false}
                className="absolute -bottom-4 -right-3 lg:-bottom-5 lg:-right-5 lg:text-[40px]"
              />
            </div>
          ) : (
            <OpenSign size="md" mount="bare" state={sign.state} text={sign.text} sound={false} className="lg:text-[72px]" />
          )}

          <h1 className="thermal mt-9 font-display text-[44px] font-black uppercase leading-[0.9] text-balance lg:mt-12 lg:text-[clamp(3.5rem,1rem+4vw,5.25rem)]">
            {shop.name}
          </h1>
          {shop.tagline ? (
            <p className="mt-4 max-w-[40ch] text-[16px] leading-relaxed text-pretty text-ink-muted lg:text-[18px]">{shop.tagline}</p>
          ) : null}

          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[16px] lg:mt-5 lg:text-[18px]">
            <span>
              {shop.open ? "Pickup" : "Closed · pickup"} {pickup}
            </span>
            {shop.is_demo ? <span className="label-print rounded-[2px] border-[1.5px] border-ink/60 px-1.5 text-[15px] text-ink-muted">Demo</span> : null}
          </p>
          {shop.location_label ? (
            <p className="mt-2 flex items-center gap-1.5 text-[15px] text-ink-muted lg:text-[16px]">
              <MapPin className="size-4 shrink-0" aria-hidden /> {shop.location_label}
            </p>
          ) : null}

          {!shop.listed ? (
            <p className="mt-5 flex items-start gap-2 text-[15px] leading-snug text-ink-muted">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Private demo shop: only people with this link can see it.
            </p>
          ) : null}

          {/* laptop: the way in sits with the shop (phones get it under the menu) */}
          <div className="mt-10 hidden w-full max-w-[420px] flex-col gap-3 lg:flex">
            <OwnerLink slug={shop.slug} className="mt-0" />
            <Link href="/ask" className="btn-line justify-between!">
              Order with the AI shopper <ArrowRight className="size-6" aria-hidden />
            </Link>
          </div>

          <div className="lg:hidden">
            <OwnerLink slug={shop.slug} />
          </div>
        </header>

        <div className="mx-auto mt-10 w-full max-w-[480px] lg:col-span-6 lg:col-start-7 lg:mx-0 lg:mt-0 lg:max-w-[600px]">
          <StorefrontMenu title="Today" items={items} />

          {/* what AI shoppers read: this exact slip */}
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5 lg:mt-11 lg:px-2">
            <AiReadyBadge href={`/s/${shop.slug}/agent.json`} className="shrink-0" />
            <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">
              AI shoppers read this exact menu. Orders are held on Visa, charged at pickup
              {shop.rules.max_per_order ? `, up to ${shop.rules.max_per_order} per order` : ""}.
            </p>
          </div>

          <Link href="/ask" className="btn-line mt-8 w-full justify-between! lg:hidden">
            Order with the AI shopper <ArrowRight className="size-6" aria-hidden />
          </Link>

          <p className="mt-10 text-center lg:mt-14">
            <Link href="/open" className="btn-quiet">
              Open your own shop
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
