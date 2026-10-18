import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Padding for a top bar that holds `AppLogo`: 20px from the left and 18px from the top
 * (under the safe area) on phones, 32px from sm, 48px and 32px from lg. Put it on a
 * full-width bar (not inside a centred column) and "avanti" lands in /start's spot.
 */
export const APP_BAR = "px-5 pt-[max(env(safe-area-inset-top),18px)] sm:px-8 lg:px-12 lg:pt-8";

/**
 * The avanti home link at the top left of every page, identical everywhere:
 * "avanti" in Marcellus, brand teal, 30px (34px from lg), with /start's box (a
 * 44px-min link whose line keeps a 1.55 line-height, so the text box starts on
 * the bar's top padding). An optional section word ("shopper", "shop", "demo",
 * "privacy") follows on the same baseline at 0.6× in Marcellus, lowercase.
 */
export function AppLogo({ section, className }: { section?: string; className?: string }) {
  return (
    <Link
      href="/"
      aria-label={section ? `avanti ${section}, home` : "avanti, home"}
      className={cn("-ml-1 inline-flex min-h-11 shrink-0 items-baseline whitespace-nowrap px-1", className)}
    >
      <span className="inline-block font-display text-[30px] font-normal normal-case leading-[1.55] tracking-[0.01em] text-carbon lg:text-[34px]">
        avanti
      </span>
      {section ? (
        <span
          data-logo-section
          className="ml-[0.5em] font-display text-[18px] font-normal normal-case leading-[1.55] tracking-[0.02em] text-carbon lg:text-[20px]"
        >
          {section}
        </span>
      ) : null}
    </Link>
  );
}
