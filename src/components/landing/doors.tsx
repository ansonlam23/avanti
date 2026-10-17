import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Permit } from "./permit";
import { Eyebrow, Section, Title } from "./section";

const DOORS = [
  {
    href: "/open",
    title: "Open a shop",
    line: "Snap your counter. Live in 40 seconds.",
    look: "bg-ink text-paper shadow-[var(--shadow-key)]",
    sub: "text-paper/75",
    tilt: -0.5,
  },
  {
    href: "/ask",
    title: "Shop with the AI",
    line: "Ask for something nearby. Order ahead.",
    look: "paper shadow-slip",
    sub: "text-ink-muted",
    tilt: 0.4,
  },
  {
    href: "/demo",
    title: "See both sides",
    line: "Your own counter next to the AI chat.",
    look: "pad shadow-slip",
    sub: "text-ink-muted",
    tilt: -0.3,
  },
];

/** The way in: three doors, and next to them the honest slip of what's real. */
export function Doors({ payments, ai }: { payments: PaymentMode; ai: boolean }) {
  return (
    <Section id="try" labelledBy="try-title" className="lg:pb-28">
      <div className="grid gap-20 lg:grid-cols-12 lg:items-center lg:gap-x-6">
        <div className="lg:col-span-7">
          <Eyebrow>Try it</Eyebrow>
          <Title id="try-title">Pick a door.</Title>
          <ul className="mt-10 flex flex-col gap-4 lg:mt-12 lg:gap-5">
            {DOORS.map((d) => (
              <li key={d.href}>
                <Link
                  href={d.href}
                  className={cn(
                    "lp-door group flex min-h-[104px] items-center justify-between gap-6 rounded-[3px] px-6 py-5 lg:px-8",
                    d.look,
                    "hover:shadow-[var(--shadow-lift)]",
                  )}
                  style={{ rotate: `${d.tilt}deg` } as CSSProperties}
                >
                  <span>
                    <span className="block font-display text-[32px] font-extrabold uppercase leading-[0.95] lg:text-[40px]">{d.title}</span>
                    <span className={`text-body-lg ${cn("mt-2 block", d.sub)}`}>{d.line}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-7 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div id="real" className="scroll-mt-10 lg:col-span-4 lg:col-start-9">
          <Permit payments={payments} ai={ai} />
        </div>
      </div>
    </Section>
  );
}
