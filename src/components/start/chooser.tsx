import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { APP_BAR, AppLogo } from "@/components/brand/app-logo";
import { SiteMenu } from "@/components/brand/site-menu";
import { cn } from "@/lib/utils";

// /start: two equal doors, one quiet way in for judges.
// Calm on purpose: lots of paper, the landing's ink plate rising out of the mist
// at the foot of the page (never behind text). Styles: `start-*` in landing.css.

const rise = (s: number) => ({ "--rise": `${s}s` }) as CSSProperties;

function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

// Both doors rest on paper; the teal wash comes in on hover or keyboard focus.
function Door({ href, title, line, delay }: { href: string; title: string; line: ReactNode; delay: number }) {
  return (
    <Link
      href={href}
      className="start-door paper lp-rise group relative flex min-h-[clamp(9.5rem,22vh,11rem)] flex-col justify-between gap-4 px-6 pb-5 pt-6 sm:min-h-[220px] sm:gap-6 sm:pb-6 sm:px-8 sm:pb-7 sm:pt-8 lg:min-h-[clamp(220px,31vh,300px)] lg:px-11 lg:pb-9 lg:pt-10"
      style={rise(delay)}
    >
      <span>
        <span className="start-door-title block font-display text-[32px] leading-[1.05] text-ink lg:text-[clamp(2.75rem,1.6rem+1.6vw,3.25rem)]">{title}</span>
        <span className="mt-3 block max-w-[30ch] text-[17px] leading-snug text-ink-muted lg:mt-5 lg:text-[20px]">{line}</span>
      </span>
      <span className="flex justify-end text-carbon">
        <Arrow className="start-door-arrow size-7 lg:size-9" />
      </span>
    </Link>
  );
}

export function Chooser() {
  return (
    <div className="start-page flex min-h-svh flex-col">
      <header className={cn("flex w-full flex-wrap items-center justify-between gap-x-4", APP_BAR)}>
        <AppLogo />
        <SiteMenu />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1160px] flex-1 flex-col justify-center px-5 pb-4 pt-8 sm:px-8 lg:pb-6 lg:pt-4">
        <h1 className="sr-only">Are you shopping, or are you the shop?</h1>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:gap-8">
          <Door href="/ask" title="I'm shopping" line="Ask for anything nearby. Pick it up." delay={0.1} />
          <Door href="/open" title="I'm the shop" line="Snap your counter. Say your prices." delay={0.2} />
        </div>

        <p className="lp-rise mt-6 text-center lg:mt-[clamp(1.25rem,3.5vh,2.25rem)]" style={rise(0.34)}>
          <Link href="/demo" className="link-ink font-sans text-[16px] tracking-normal text-ink-muted hover:text-ink lg:text-[17px]">
            <span>Judging? See both sides at once</span>
            <Arrow className="size-[17px]" />
          </Link>
        </p>
      </main>

      <div aria-hidden className="start-plate" />
    </div>
  );
}
