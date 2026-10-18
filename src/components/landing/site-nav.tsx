import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { APP_BAR, AppLogo } from "@/components/brand/app-logo";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/ansonlam23/open-sign";

type NavLink = { href: string; label: string };

/** The ways in, quietly. */
const DOORS: NavLink[] = [
  { href: "/ask", label: "Shop with AI" },
  { href: "/open", label: "Open a shop" },
];

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 px-3 text-[16px] font-medium text-ink-muted underline decoration-transparent decoration-1 underline-offset-[6px] transition-[color,text-decoration-color] duration-300 hover:text-ink hover:decoration-current";

/**
 * The top bar on public pages. Quiet on purpose: the avanti logo (the way home,
 * with the page's `section` word) and a few text links on laptops; just the logo
 * on phones. Full width, so the logo sits in /start's spot on every page.
 * `variant` is kept for callers; both read the same now.
 */
export function SiteNav({ section, className }: { variant?: "landing" | "page"; section?: string; className?: string }) {
  return (
    <header className={cn("flex w-full items-center justify-between pb-1 lg:pb-2", APP_BAR, className)}>
      <AppLogo section={section} />
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
