import Link from "next/link";
import { Lock, MapPin } from "lucide-react";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { formatClock, formatPriceShort } from "@/lib/format";
import { aiOrderLimitCents } from "@/lib/orders/ai-rules";
import type { Item, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiReadyBadge } from "./ai-ready-badge";
import { Arrow } from "./arrow";
import { OwnerLink } from "./owner-link";
import { StorefrontMenu } from "./storefront-menu";
import "./storefront.css";

// /s/[slug]: the human storefront, ink on rice paper. Phone: one column (the
// shop's name, pickup, the menu slip). Laptop: the shop on the left (sticky),
// the menu slip on the right as the focal point.

export function Storefront({ shop, items }: { shop: Shop; items: Item[] }) {
  const pickup = `${formatClock(shop.pickup_window.start)}–${formatClock(shop.pickup_window.end)}`;
  const aiCap = aiOrderLimitCents(shop.rules);
  return (
    <>
      <SiteNav variant="page" />
      <main className="mx-auto grid w-full max-w-page px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-12 lg:gap-x-6 lg:px-10 lg:pb-24 lg:pt-14">
        <header className="sf-rise mx-auto w-full max-w-[480px] lg:sticky lg:top-12 lg:col-span-5 lg:mx-0 lg:max-w-none lg:self-start">
          {shop.photo_url ? (
            <figure className="mb-9 w-full border border-ink/15 bg-paper p-2 shadow-[0_22px_44px_-34px_rgb(22_58_66/0.38)] lg:w-[72%]">
              {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URL */}
              <img src={shop.photo_url} alt={`${shop.name}'s counter`} width={1200} height={900} className="aspect-[4/3] w-full object-cover lg:aspect-[3/2]" />
            </figure>
          ) : null}

          <p className={cn("flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.14em]", shop.open ? "text-carbon" : "text-ink-muted")}>
            <span aria-hidden className={cn("size-2", shop.open ? "bg-carbon" : "border border-ink-muted")} />
            {shop.open ? "Open now" : "Closed"}
          </p>
          <h1
            className={cn(
              "mt-4 font-display text-[44px] font-normal leading-[1.04] tracking-[0.005em] text-balance text-carbon lg:mt-5",
              // with a photo above it the name steps down a size, so the way in stays above the fold
              shop.photo_url ? "lg:text-[clamp(3rem,1rem+3vw,4.5rem)]" : "lg:text-[clamp(3.5rem,1.4rem+3.6vw,5.25rem)]",
            )}
          >
            {shop.name}
          </h1>
          {shop.tagline ? (
            <p className="mt-4 max-w-[40ch] text-[17px] leading-relaxed text-pretty text-ink-muted lg:mt-5 lg:text-[19px]">{shop.tagline}</p>
          ) : null}

          <div className="mt-7 border-t border-ink/15 pt-6 lg:mt-8 lg:pt-6">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[16px] text-ink lg:text-[18px]">
              <span>
                {shop.open ? "Pickup" : "Closed · pickup"} {pickup}
              </span>
              {shop.is_demo ? (
                <span className="inline-flex h-7 items-center border border-ink/30 px-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Demo
                </span>
              ) : null}
            </p>
            {shop.location_label ? (
              <p className="mt-2.5 flex items-center gap-2 text-[16px] text-ink-muted lg:text-[17px]">
                <MapPin className="size-[17px] shrink-0" strokeWidth={1.6} aria-hidden /> {shop.location_label}
              </p>
            ) : null}
            {!shop.listed ? (
              <p className="mt-2.5 flex items-start gap-2 text-[15px] leading-snug text-ink-muted lg:text-[16px]">
                <Lock className="mt-[3px] size-[17px] shrink-0" strokeWidth={1.6} aria-hidden />
                Private demo shop: only people with this link can see it.
              </p>
            ) : null}
          </div>

          {/* laptop: the way in sits with the shop (phones get it under the menu) */}
          <div className="mt-9 hidden w-full max-w-[420px] flex-col items-start gap-4 lg:flex">
            <Link href="/ask" className="sf-btn w-full">
              Order with the AI shopper <Arrow className="size-5" />
            </Link>
            <OwnerLink slug={shop.slug} className="mt-0" />
          </div>
        </header>

        <div className="sf-rise sf-rise-late mx-auto mt-10 w-full max-w-[480px] lg:col-span-6 lg:col-start-7 lg:mx-0 lg:mt-0 lg:max-w-[600px]">
          <StorefrontMenu title="Today" items={items} rules={shop.rules} />

          {/* what AI shoppers read: this exact slip */}
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5 lg:mt-10">
            <AiReadyBadge href={`/s/${shop.slug}/agent.json`} className="shrink-0" />
            <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">
              AI shoppers read this exact menu. Orders are held on Visa, charged at pickup
              {shop.rules.max_per_order ? `, up to ${shop.rules.max_per_order} per order` : ""}.
              {aiCap ? ` AI orders up to ${formatPriceShort(aiCap)}.` : ""}
            </p>
          </div>

          <div className="mt-9 flex flex-col items-start gap-3 lg:hidden">
            <Link href="/ask" className="sf-btn w-full">
              Order with the AI shopper <Arrow className="size-5" />
            </Link>
            <OwnerLink slug={shop.slug} className="mt-0" />
          </div>

          <p className="mt-10 lg:mt-14">
            <Link href="/open" className="sf-link">
              Open your own shop <Arrow />
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
