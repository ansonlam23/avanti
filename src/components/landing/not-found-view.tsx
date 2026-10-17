import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IdlePrinter } from "./idle-printer";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

type Door = { href: string; label: string };

/**
 * A designed dead end: the idle printer on the left, one plain sentence and
 * the ways back on the right (stacked and centered on phones).
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
      <main className="mx-auto grid w-full max-w-page flex-1 content-center items-center gap-14 px-6 pb-16 pt-10 lg:grid-cols-12 lg:gap-x-6 lg:px-10 lg:pb-24 lg:pt-8">
        <div className="flex justify-center lg:col-span-6">
          <IdlePrinter ghost={ghost} />
        </div>
        <div className="mx-auto max-w-[460px] text-center lg:col-span-5 lg:col-start-8 lg:mx-0 lg:max-w-none lg:text-left">
          <p className="label-print text-[15px] text-ink-muted">{eyebrow}</p>
          <h1 className="text-title thermal mt-4 font-display font-black uppercase text-balance">{title}</h1>
          <p className="text-lede mx-auto mt-6 max-w-[34ch] text-ink-muted lg:mx-0">{text}</p>
          <div className="mx-auto mt-10 flex max-w-[400px] flex-col gap-3 lg:mx-0">
            <Link href={primary.href} className="btn-ink justify-between! gap-8 lg:min-h-16 lg:px-6 lg:text-[24px]">
              {primary.label} <ArrowRight className="size-6" aria-hidden />
            </Link>
            <Link href={secondary.href} className="btn-line justify-between! gap-8 lg:min-h-16 lg:px-6 lg:text-[24px]">
              {secondary.label} <ArrowRight className="size-6" aria-hidden />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
