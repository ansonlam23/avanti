import Link from "next/link";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Arrow } from "@/components/storefront/arrow";
import "@/components/storefront/storefront.css";

// Unknown shop: one calm sentence on rice paper and the two ways on.

export default function ShopNotFound() {
  return (
    <>
      <SiteNav variant="page" />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col items-center justify-center px-6 pb-20 pt-14 text-center lg:px-10 lg:pb-28 lg:pt-16">
        <div className="sf-rise flex max-w-[620px] flex-col items-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-muted">No such shop</p>
          <h1 className="mt-5 font-display text-[48px] font-normal leading-[1.04] text-balance text-carbon lg:text-[clamp(3.75rem,1.6rem+3.4vw,5.5rem)]">
            No shop here.
          </h1>
          <p className="mt-5 max-w-[36ch] text-[17px] leading-relaxed text-ink-muted lg:mt-6 lg:text-[19px]">
            This link doesn&apos;t match a shop. It may have a typo, or the shop isn&apos;t open yet.
          </p>
          <div className="mt-10 flex w-full max-w-[360px] flex-col items-center gap-4 lg:mt-12">
            <Link href="/open" className="sf-btn w-full">
              Open a shop <Arrow className="size-5" />
            </Link>
            <Link href="/ask" className="sf-link">
              Shop with the AI <Arrow />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
