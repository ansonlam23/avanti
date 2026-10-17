"use client";

import Image from "next/image";
import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MenuSlip, OpenSign } from "@/components/brand";
import { cn } from "@/lib/utils";
import { Eyebrow, Lede, Section, Title } from "./section";
import { useReducedMotionSafe } from "./use-reduced";

// Sample: the menu Open Sign would print from this photo. The two tagged
// items keep their handwritten prices; the untagged muffin gets a stamp,
// never a guess (that's step 2: you say it).
const SAMPLE_MENU = [
  { id: "lemon", name: "Lemon bars", price_cents: 475 },
  { id: "brownie", name: "Brownie", price_cents: 475 },
  { id: "muffin", name: "Muffin", price_cents: null },
];

/**
 * How it works, as three objects on the counter: the photo you take, the
 * menu slip it becomes, the OPEN sign. When the row scrolls into view the
 * menu prints line by line, then the OPEN slip prints (cause → effect).
 */
export function HowItWorks() {
  const row = useRef<HTMLOListElement>(null);
  const seen = useInView(row, { once: true, amount: 0.45 });
  const reduce = useReducedMotionSafe();
  const [openPrinting, setOpenPrinting] = useState(false);

  useEffect(() => {
    if (!seen || reduce) return;
    const t = setTimeout(() => setOpenPrinting(true), 1100);
    return () => clearTimeout(t);
  }, [seen, reduce]);

  const printMenu = seen && !reduce;

  return (
    <Section id="how" labelledBy="how-title">
      <div className="grid gap-y-2 lg:grid-cols-12 lg:items-end lg:gap-x-6">
        <div className="lg:col-span-7">
          <Eyebrow>How it works</Eyebrow>
          <Title id="how-title">Open in 40 seconds.</Title>
        </div>
        <Lede className="lg:col-span-4 lg:col-start-9 lg:mb-2 lg:mt-0">No website, no forms. A photo of your counter and your voice.</Lede>
      </div>

      <ol ref={row} className="mt-14 grid gap-20 lg:mt-16 lg:grid-cols-3 lg:gap-10">
        <Step n={1} title="Snap your counter" text="One photo. Handwritten price tags count.">
          <figure className="lp-print w-full max-w-[340px]" style={{ rotate: "-2.2deg" }}>
            <Image
              src="/brand/display-case.jpg"
              alt="A bakery display case: lemon bars and brownies with handwritten price cards, $4.75 each."
              width={1600}
              height={1066}
              sizes="(min-width: 1024px) 340px, (min-width: 640px) 360px, 86vw"
              className="aspect-[3/2] w-full object-cover"
            />
            <figcaption className="pen mt-2.5 pl-1 text-[27px]">our counter, 7 am</figcaption>
          </figure>
        </Step>

        <Step n={2} title="Say your prices" text="Missing a tag? Say it. Prices are never guessed." arrow>
          <div className="w-full max-w-[310px]">
            {/* reserve the slip's space until it prints (no layout shift) */}
            <div className={cn(!seen && !reduce && "invisible")}>
              <MenuSlip key={printMenu ? "print" : "rest"} title="Today" items={SAMPLE_MENU} animateIn={printMenu} tilt={1.4} />
            </div>
          </div>
        </Step>

        <Step n={3} title="You're open to AI" text="AI shoppers find you, order ahead and pay with Visa." arrow>
          <div className="flex flex-col items-center gap-8 pb-6">
            {/* an unprinted slip until the menu is done, then it prints */}
            <OpenSign
              key={openPrinting ? "print" : "rest"}
              mount="bare"
              size="lg"
              state={reduce ? "on" : openPrinting ? "flickering-on" : "off"}
              sound={openPrinting}
              className="text-[96px] lg:text-[112px]"
            />
            <span
              className="inline-flex h-14 items-center gap-3 rounded-[3px] border-2 border-ink px-5 font-display text-[24px] font-extrabold uppercase leading-none tracking-[0.03em]"
              style={{ rotate: "-1.5deg" }}
            >
              AI-ready ✓<span className="font-sans text-[15px] font-normal normal-case tracking-normal text-ink-muted">agent.json</span>
            </span>
          </div>
        </Step>
      </ol>
    </Section>
  );
}

function Step({ n, title, text, arrow, children }: { n: number; title: string; text: string; arrow?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex flex-col">
      {arrow ? <PenArrow /> : null}
      <div className="flex min-h-0 items-end justify-center lg:min-h-[330px]">{children}</div>
      <div className="mt-10 flex gap-5 lg:mt-12">
        <span aria-hidden className="dot pt-1 text-[34px] text-ink-muted">
          {String(n).padStart(2, "0")}
        </span>
        <div>
          <h3 className="font-display text-[32px] font-extrabold uppercase leading-[0.95] lg:text-[36px]">{title}</h3>
          <p className="mt-2.5 max-w-[30ch] text-body-lg text-ink-muted">{text}</p>
        </div>
      </div>
    </li>
  );
}

/** The owner's pen joining one step to the next (laptop only: on phones the steps stack). */
function PenArrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 40"
      fill="none"
      className="pointer-events-none absolute -left-[58px] top-[150px] hidden h-10 w-20 text-carbon lg:block"
    >
      <path d="M4 27c15-12 34-17 62-12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M55 6.5l12.5 8.8-10.8 10.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
