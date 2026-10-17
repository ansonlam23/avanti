import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IdlePrinter } from "./idle-printer";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

type Door = { href: string; label: string };

/**
 * A designed dead end, in ink: the un-inked sign, one plain sentence, one
 * primary way back and one quiet one. Centered, lots of paper.
 */
export function NotFoundView({
  eyebrow,
  title,
  text,
  primary,
  secondary,
  ghost,
}: {
  eyebrow: string;
  title: string;
  text: string;
  primary: Door;
  secondary: Door;
  ghost?: string;
}) {
  return (
    <>
      <SiteNav variant="page" />
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col items-center justify-center px-6 pb-16 pt-10 text-center lg:pb-24">
        <div className="lp-rise">
          <IdlePrinter ghost={ghost} />
        </div>
        <p className="lp-rise label-print mt-10 text-[13px] text-ink-muted lg:mt-14" style={{ "--rise": "0.1s" } as React.CSSProperties}>
          {eyebrow}
        </p>
        <h1
          className="lp-rise mt-4 font-display text-[44px] leading-[1.05] text-balance text-carbon lg:text-[64px]"
          style={{ "--rise": "0.18s" } as React.CSSProperties}
        >
          {title}
        </h1>
        <p
          className="lp-rise mx-auto mt-4 max-w-[36ch] text-[17px] leading-relaxed text-ink-muted lg:text-[19px]"
          style={{ "--rise": "0.26s" } as React.CSSProperties}
        >
          {text}
        </p>
        <div className="lp-rise mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-8" style={{ "--rise": "0.34s" } as React.CSSProperties}>
          <Link href={primary.href} className="btn-ink min-w-[240px] justify-between">
            {primary.label} <ArrowRight className="size-5" aria-hidden />
          </Link>
          <Link href={secondary.href} className="link-ink text-[19px]">
            <span>{secondary.label}</span>
            <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
