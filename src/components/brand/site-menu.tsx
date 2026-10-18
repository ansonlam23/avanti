import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/ansonlam23/open-sign";

export type MenuSection = "shop" | "sell" | "trust";

const ITEMS: { id: MenuSection; href: string; label: string }[] = [
  { id: "shop", href: "/ask", label: "Shop" },
  { id: "sell", href: "/open", label: "Sell" },
  { id: "trust", href: "/privacy", label: "Trust" },
];

const LINK =
  "inline-flex min-h-11 items-center gap-1 px-3 text-[16px] font-medium underline decoration-1 underline-offset-[7px] transition-[color,text-decoration-color] duration-300";
const QUIET = "text-ink-muted decoration-transparent hover:text-ink hover:decoration-current";

/**
 * The one top menu, on every page but the landing: Shop, Sell, Trust and GitHub,
 * spaced apart (no separators). The page's own section is marked with
 * aria-current and a quiet teal hairline under it.
 *
 * Put it in a `flex flex-wrap` bar right after `AppLogo`: on laptops it sits on
 * the logo's row (`end` pulls the last word flush with the bar's edge when nothing
 * follows it); on phones it drops to its own row, its first word under "avanti".
 * Every section opens in the same tab (`newTab` is kept for callers and ignored).
 */
export function SiteMenu({
  current,
  end = true,
  className,
}: {
  current?: MenuSection;
  /** Ignored: the sections always open in the same tab. */
  newTab?: boolean;
  end?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label="avanti"
      className={cn("order-last -ml-3 flex w-full items-center lg:order-none lg:ml-0 lg:w-auto", end && "lg:-mr-3", className)}
    >
      {ITEMS.map((it) => {
        const here = it.id === current;
        return (
          <Link
            key={it.id}
            href={it.href}
            aria-current={here ? "page" : undefined}
            className={cn(LINK, here ? "text-ink decoration-carbon" : QUIET)}
          >
            {it.label}
          </Link>
        );
      })}
      <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={cn(LINK, QUIET)}>
        GitHub <ArrowUpRight aria-hidden className="size-4" />
      </a>
    </nav>
  );
}
