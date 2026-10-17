"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { OpenSign } from "@/components/brand";
import type { PaymentMode } from "@/lib/types";
import { HeroScene } from "./hero-scene";

/** Phone: wait for the tear, then arrive. Laptop: arrive right away (the scene carries the moment). */
const rise = (phone: number, wide: number) => ({ "--rise-phone": `${phone}s`, "--rise-wide": `${wide}s` }) as CSSProperties;

/**
 * The hero. Phone: the printer at the top edge prints the OPEN slip and
 * tears it; the copy arrives after the tear. Laptop: the headline on the
 * left, and on the right the printer on the counter printing OPEN, next to
 * the shopper's phone and the receipt their order printed.
 */
export function Hero({ payments }: { payments: PaymentMode }) {
  const [lit, setLit] = useState(false);
  return (
    <section className="lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-sign">
        <span aria-hidden className="lp-printer-body" />
        <OpenSign
          state="flickering-on"
          size="xl"
          spill
          onLit={() => setLit(true)}
          className="mt-[max(env(safe-area-inset-top),10px)] lg:mt-0 lg:text-[calc(128px*var(--k))]"
        />
      </div>

      <div className="lp-hero-copy mt-4 flex w-full max-w-[440px] flex-col items-center text-center lg:mt-0 lg:max-w-none lg:items-start lg:self-center lg:text-left">
        <p className="lp-rise label-print text-[15px] text-ink-muted" style={rise(1.45, 0.05)}>
          <span className="lg:hidden">Open Sign · </span>For small shops<span className="hidden lg:inline"> · live in 40 seconds</span>
        </p>
        <h1
          id="hero-title"
          className="lp-rise thermal mt-3 font-display text-hero font-black uppercase tracking-[-0.005em] text-balance lg:mt-5"
          style={rise(1.55, 0.1)}
        >
          Every shop, open to every AI.
        </h1>
        <p className="lp-rise mt-5 max-w-[34ch] text-lede text-pretty text-ink-muted lg:mt-7 lg:max-w-[36ch]" style={rise(1.65, 0.18)}>
          Snap your counter, say your prices. AI shoppers order ahead; Visa holds the money until pickup.
        </p>
        <nav
          aria-label="Get started"
          className="lp-rise mt-8 flex w-full flex-col gap-3 lg:mt-10 lg:max-w-[340px] xl:w-auto xl:max-w-none xl:flex-row xl:gap-4"
          style={rise(1.8, 0.26)}
        >
          <Link href="/open" className="btn-ink justify-between! lg:min-h-16 lg:px-6 lg:text-[24px] xl:min-w-[248px]">
            I run a shop <ArrowRight aria-hidden className="size-6" />
          </Link>
          <Link href="/ask" className="btn-line justify-between! lg:min-h-16 lg:px-6 lg:text-[24px] xl:min-w-[248px]">
            I&apos;m shopping <ArrowRight aria-hidden className="size-6" />
          </Link>
        </nav>
        <Link href="/demo" className="lp-rise btn-quiet mt-2 lg:-ml-3 lg:mt-4 lg:text-[16px]" style={rise(1.9, 0.32)}>
          See both sides at once
        </Link>
      </div>

      <HeroScene lit={lit} payments={payments} />
    </section>
  );
}
