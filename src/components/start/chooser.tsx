import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

// /start: one question, two equal doors, one quiet way in for judges.
// Calm on purpose: lots of paper, a faint strip of the landing's ink plate at
// the foot of the page (never behind text). Styles: `start-*` in landing.css.

const rise = (s: number) => ({ "--rise": `${s}s` }) as CSSProperties;

function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

function Door({ href, title, line, surface, delay }: { href: string; title: string; line: ReactNode; surface: "paper" | "pad"; delay: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "start-door lp-rise group relative flex flex-col justify-between gap-6 px-6 pb-6 pt-6 sm:min-h-[210px] sm:px-8 sm:pb-7 sm:pt-8 lg:min-h-[clamp(190px,28vh,256px)] lg:px-10 lg:pb-8 lg:pt-9",
        surface,
      )}
      style={rise(delay)}
    >
      <span>
        <span className="start-door-title block pr-10 font-display text-[32px] leading-[1.05] text-ink sm:pr-0 lg:text-[44px]">{title}</span>
        <span className="mt-3 block max-w-[30ch] text-[17px] leading-snug text-ink-muted lg:mt-4 lg:text-[19px]">{line}</span>
      </span>
      <span className="absolute right-6 top-[29px] text-carbon sm:static sm:flex sm:justify-end">
        <Arrow className="start-door-arrow size-7 lg:size-8" />
      </span>
    </Link>
  );
}

export function Chooser() {
  return (
    <div className="start-page flex min-h-svh flex-col">
      <header className="flex w-full items-center px-5 pt-[max(env(safe-area-inset-top),18px)] sm:px-8 lg:px-12 lg:pt-8">
        <Link href="/" aria-label="avanti, home" className="-ml-1 inline-flex min-h-11 items-center px-1">
          <Wordmark className="text-[30px] lg:text-[34px]" />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col justify-center px-5 pb-6 pt-6 sm:px-8 lg:pb-10 lg:pt-0">
        <h1
          className="lp-rise mx-auto text-center font-display text-[32px] leading-[1.1] text-carbon sm:text-[50px] lg:text-[clamp(3.25rem,min(1.4rem+2.9vw,8.2vh),4.5rem)] lg:leading-[1.08]"
          style={rise(0.05)}
        >
          <span className="block">Are you shopping,</span> <span className="block">or are you the shop?</span>
        </h1>

        <div className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:mt-[clamp(2rem,5.5vh,3.5rem)] lg:gap-8">
          <Door href="/ask" title="I'm shopping" line="Ask for anything nearby. Pick it up." surface="paper" delay={0.18} />
          <Door href="/open" title="I'm the shop" line="Snap your counter. Say your prices." surface="pad" delay={0.28} />
        </div>

        <p className="lp-rise mt-7 text-center lg:mt-[clamp(1.25rem,4vh,2.5rem)]" style={rise(0.42)}>
          <Link href="/demo" className="link-ink font-sans text-[16px] tracking-normal text-ink-muted hover:text-ink lg:text-[17px]">
            <span>Judging? See both sides at once</span>
            <Arrow className="size-[17px]" />
          </Link>
        </p>
      </main>

      <footer className="lp-rise flex justify-center px-5" style={rise(0.52)}>
        <Link href="/privacy" className="btn-quiet px-2 text-[15px] font-normal text-ink-muted hover:text-ink lg:text-[16px]">
          How avanti uses AI
        </Link>
      </footer>

      <div aria-hidden className="start-plate" />
    </div>
  );
}
