import { APP_BAR, AppLogo } from "@/components/brand/app-logo";
import { SiteMenu, type MenuSection } from "@/components/brand/site-menu";
import { cn } from "@/lib/utils";

export { GITHUB_URL } from "@/components/brand/site-menu";

/**
 * The top bar on public pages: the avanti logo (the way home, with the page's
 * `section` word) and the one top menu (Shop, Sell, Trust, GitHub), on the logo's
 * row on laptops and on its own row under the logo on phones. Full width, so the
 * logo sits in /start's spot on every page. `variant` is kept for callers.
 */
export function SiteNav({
  section,
  current,
  className,
}: {
  variant?: "landing" | "page";
  section?: string;
  current?: MenuSection;
  className?: string;
}) {
  return (
    <header className={cn("flex w-full flex-wrap items-center justify-between pb-1 lg:pb-2", APP_BAR, className)}>
      <AppLogo section={section} />
      <SiteMenu current={current} />
    </header>
  );
}
