import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";
import { GITHUB_URL } from "./site-nav";

/** One quiet line: the name, who built it, where the code is (and whose photo it is, when one is shown). */
export function SiteFooter({ photoCredit = false, className }: { photoCredit?: boolean; className?: string }) {
  return (
    <footer className={cn("mx-auto w-full max-w-page px-6 pb-12 pt-6 md:px-10", className)}>
      <div className="flex flex-col items-center gap-3 border-t border-ink/16 pt-6 text-center text-[15px] leading-relaxed text-ink-muted lg:flex-row lg:justify-between lg:text-left">
        <p className="flex flex-col items-center gap-2 lg:flex-row lg:gap-5">
          <Link href="/" aria-label="avanti, home" className="inline-flex min-h-11 items-center">
            <Wordmark className="text-[24px]" />
          </Link>
          <span>Built at DubHacks &apos;26 for the Visa track.</span>
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          {photoCredit ? (
            <a
              href="https://www.pexels.com/photo/assorted-pastries-in-bakery-display-case-31132630/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
            >
              Photo: James Collington, Pexels
            </a>
          ) : null}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn-quiet px-0 text-[15px]">
            Source on GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
