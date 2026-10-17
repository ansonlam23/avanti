"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Receipt } from "@/components/brand";
import type { OrderStatus, PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Eyebrow, Lede, Section, Title } from "./section";
import { useReducedMotionSafe } from "./use-reduced";

const STATES: { status: Extract<OrderStatus, "held" | "paid" | "released">; label: string; line: string; stamp: string }[] = [
  { status: "held", label: "Ordered", line: "Visa holds $18.00. Nothing is charged.", stamp: "Held" },
  { status: "paid", label: "Picked up", line: "The shop charges the hold at the counter.", stamp: "Paid" },
  { status: "released", label: "No-show", line: "The hold is released. Never charged.", stamp: "Released" },
];

/**
 * Money, plainly: one sample receipt and the three things that can happen
 * to its hold. Picking a state stamps the receipt (stamps keep history).
 * When the section first comes into view it plays "picked up" once.
 */
export function Held({ payments }: { payments: PaymentMode }) {
  const [status, setStatus] = useState<OrderStatus>("held");
  const touched = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box, { once: true, amount: 0.6 });
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    if (!seen || reduce) return;
    const t = setTimeout(() => {
      if (!touched.current) setStatus("paid");
    }, 1100);
    return () => clearTimeout(t);
  }, [seen, reduce]);

  const choose = (s: OrderStatus) => {
    touched.current = true;
    setStatus(s);
  };

  return (
    <Section id="money" labelledBy="money-title">
      <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-5">
          <Eyebrow>Payments</Eyebrow>
          <Title id="money-title">Held, not charged.</Title>
          <Lede>An AI order only puts a hold on the card. Money moves at pickup, not before.</Lede>

          <div role="group" aria-label="What happens to the hold: pick one to stamp the sample receipt" className="mt-10 flex flex-col gap-3 lg:mt-12">
            {STATES.map((s) => {
              const on = status === s.status;
              return (
                <button
                  key={s.status}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(s.status)}
                  className={cn(
                    "flex min-h-[72px] w-full items-center justify-between gap-4 rounded-[3px] border-2 px-5 py-3 text-left transition-[background-color,border-color,color] duration-200",
                    on ? "border-ink bg-ink text-paper shadow-[var(--shadow-key)]" : "border-ink/20 hover:border-ink/60",
                  )}
                >
                  <span>
                    <span className="block font-display text-[26px] font-extrabold uppercase leading-none tracking-[0.02em]">{s.label}</span>
                    <span className={cn("mt-1.5 block text-[15px] leading-snug", on ? "text-paper/80" : "text-ink-muted")}>{s.line}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "shrink-0 rounded-[2px] border-2 px-2 py-0.5 font-display text-[18px] font-extrabold uppercase tracking-[0.06em]",
                      on ? "border-stamp-lit text-stamp-lit" : "border-stamp-deep/70 text-stamp-deep",
                    )}
                    style={{ rotate: "-4deg" }}
                  >
                    {s.stamp}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div ref={box} className="flex justify-center lg:col-span-6 lg:col-start-7">
          <figure className="flex flex-col items-center">
            <div className="origin-top sm:scale-110 sm:mb-[48px] lg:mb-[86px] lg:scale-[1.22]">
              <Receipt
                shopName="Mai's Bakery"
                lines={[{ label: "Chocolate cake", qty: 1, amount_cents: 1800 }]}
                total_cents={1800}
                status={status}
                mode={payments}
                time="Pickup 5:30 PM"
                pickupCode="4821"
                qrValue="4821"
                tilt={1.4}
              />
            </div>
            <figcaption className="mt-6 text-[15px] text-ink-muted">Sample receipt · demo shop</figcaption>
          </figure>
        </div>
      </div>
    </Section>
  );
}
