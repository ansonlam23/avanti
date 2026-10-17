import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "./wordmark";

export const GITHUB_URL = "https://github.com/ansonlam23/open-sign";

type NavLink = { href: string; label: string };

/** Landing: jump to its sections. Other public pages: the three ways in. */
const SECTIONS: NavLink[] = [
  { href: "#how", label: "How it works" },
  { href: "#trust", label: "Trust" },
  { href: "#real", label: "What's real" },
];
const DOORS: NavLink[] = [
  { href: "/open", label: "Open a shop" },
  { href: "/ask", label: "Shop with AI" },
  { href: "/demo", label: "Both sides" },
];

/**
 * The top bar on laptops. Quiet on purpose: the wordmark and a few printed
 * links. On phones the landing has none (the printer owns the top edge);
 * other pages get just the wordmark, as the way home.
 */
export function SiteNav({ variant = "landing", className }: { variant?: "landing" | "page"; className?: string }) {
  const links = variant === "landing" ? SECTIONS : DOORS;
  return (
    <>
      {variant === "page" ? (
        <header className="flex w-full items-center px-5 pb-1 pt-[max(env(safe-area-inset-top),14px)] sm:px-8 lg:hidden">
          <Link href="/" aria-label="Open Sign, home" className="rounded-[3px] py-2 pr-2">
            <Wordmark className="text-[22px]" />
          </Link>
        </header>
      ) : null}
      <LaptopNav links={links} label={variant === "landing" ? "On this page" : "Try Open Sign"} className={className} />
    </>
  );
}

function LaptopNav({ links, label, className }: { links: NavLink[]; label: string; className?: string }) {
  return (
    <header className={cn("mx-auto hidden w-full max-w-page items-center justify-between px-10 pb-2 pt-6 lg:flex", className)}>
      <Link href="/" aria-label="Open Sign, home" className="rounded-[3px] py-2 pr-2">
        <Wordmark />
      </Link>
      <nav aria-label={label} className="flex items-center gap-2">
        {links.map((l) =>
          l.href.startsWith("#") ? (
            <a key={l.href} href={l.href} className="btn-quiet text-[16px] no-underline hover:underline">
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href} className="btn-quiet text-[16px] no-underline hover:underline">
              {l.label}
            </Link>
          ),
        )}
        <a href={GITHUB_URL} className="btn-quiet text-[16px] no-underline hover:underline" target="_blank" rel="noreferrer">
          GitHub <ArrowUpRight aria-hidden className="size-4" />
        </a>
      </nav>
    </header>
  );
}
