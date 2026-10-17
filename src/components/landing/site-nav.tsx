import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/ansonlam23/open-sign";

type NavLink = { href: string; label: string };

/** The ways in, quietly. */
const DOORS: NavLink[] = [
  { href: "/ask", label: "Shop with AI" },
  { href: "/open", label: "Open a shop" },
  { href: "/demo", label: "Both sides" },
];

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 px-3 text-[16px] font-medium text-ink-muted underline decoration-transparent decoration-1 underline-offset-[6px] transition-[color,text-decoration-color] duration-300 hover:text-ink hover:decoration-current";

/**
 * The top bar on public pages. Quiet on purpose: the avanti wordmark (the
 * way home) and a few text links on laptops; just the wordmark on phones.
 * `variant` is kept for callers; both read the same now.
 */
export function SiteNav({ className }: { variant?: "landing" | "page"; className?: string }) {
  return (
    <header
      className={cn(
        "mx-auto flex w-full max-w-page items-center justify-between px-5 pb-1 pt-[max(env(safe-area-inset-top),16px)] sm:px-8 lg:px-10 lg:pb-2 lg:pt-7",
        className,
      )}
    >
      <Link href="/" aria-label="avanti, home" className="-ml-1 inline-flex min-h-11 items-center px-1">
        <Wordmark className="text-[28px] lg:text-[30px]" />
      </Link>
      <nav aria-label="Try avanti" className="hidden items-center lg:flex">
        {DOORS.map((l) => (
          <Link key={l.href} href={l.href} className={LINK}>
            {l.label}
          </Link>
        ))}
        <a href={GITHUB_URL} className={cn(LINK, "pr-0")} target="_blank" rel="noreferrer">
          GitHub <ArrowUpRight aria-hidden className="size-4" />
        </a>
      </nav>
    </header>
  );
}
