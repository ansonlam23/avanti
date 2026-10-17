import { BatteryFull, Mic, SignalHigh, Wifi } from "lucide-react";
import { SimulatedBadge } from "@/components/brand";
import type { PaymentMode } from "@/lib/types";

/** The AI's mark, as drawn in the shopper app: a 3×3 dot-matrix print head. */
export function AiDots() {
  return (
    <span aria-hidden className="lp-mark">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} />
      ))}
    </span>
  );
}

/**
 * A drawing of the shopper's phone mid-conversation (sample data, part of
 * the hero's still life; the real chat lives at /ask). Decorative: the scene
 * around it carries the accessible description.
 */
export function PhoneChat({ pressed, placed, payments }: { pressed: boolean; placed: boolean; payments: PaymentMode }) {
  return (
    <div aria-hidden className="lp-phone">
      <div className="lp-phone-screen">
        <span className="lp-phone-island" />
        <div className="flex items-center justify-between px-7 pt-[13px] text-[15px] font-bold leading-none">
          <span>5:02</span>
          <span className="flex items-center gap-1.5">
            <SignalHigh className="size-4" strokeWidth={2.6} />
            <Wifi className="size-4" strokeWidth={2.6} />
            <BatteryFull className="size-5" strokeWidth={2} />
          </span>
        </div>

        <div className="flex flex-col gap-4 px-3.5 pt-9">
          {/* the shopper's note */}
          <div className="flex justify-end pl-9">
            <p className="paper rounded-[2px] px-3.5 py-2.5 text-[15px] leading-snug shadow-slip" style={{ rotate: "0.8deg" }}>
              Chocolate cake near campus for 5:30?
            </p>
          </div>

          {/* the AI's answer, printed on the counter */}
          <div className="flex items-start gap-2.5 pr-3">
            <AiDots />
            <p className="text-[15px] leading-snug">Mai&apos;s Bakery has one left. 6 min walk.</p>
          </div>

          {/* the order, not placed until the shopper taps */}
          <div className="slip-drop mt-1" style={{ rotate: "-0.7deg" }}>
            <div className="paper edge-torn-y px-4 pb-6 pt-6">
              <p className="label-print text-[15px] text-ink-muted">{placed ? "Placed" : "Not placed yet"}</p>
              <p className="mt-1.5 font-display text-[30px] font-extrabold uppercase leading-[0.95]">Mai&apos;s Bakery</p>
              <div className="print-rule my-3.5" />
              <p className="flex items-baseline gap-2 text-[15px]">
                <span className="shrink-0">Chocolate cake</span>
                <span className="leader" />
                <span className="shrink-0 tabular-nums">$18.00</span>
              </p>
              <p className="mt-1 text-[15px] text-ink-muted">Pickup 5:30 · demo shop</p>
              {payments === "simulated" ? <SimulatedBadge className="mt-3" /> : null}
              {placed ? (
                <div className="btn-line mt-4 min-h-12 w-full text-[19px]">Held · not charged</div>
              ) : (
                <div data-pressed={pressed ? "true" : undefined} className="lp-key btn-ink mt-4 min-h-12 w-full text-[19px]">
                  Confirm &amp; hold $18.00
                </div>
              )}
            </div>
          </div>
        </div>

        {/* the composer and the home bar */}
        <div className="absolute inset-x-3.5 bottom-[30px] flex items-center gap-2">
          <span className="flex h-11 flex-1 items-center rounded-[3px] border-2 border-ink/70 bg-paper/70 px-3 text-[15px] text-ink-muted">
            Ask for anything…
          </span>
          <span className="flex size-11 items-center justify-center rounded-[3px] bg-ink text-paper">
            <Mic className="size-5" strokeWidth={2.4} />
          </span>
        </div>
        <span className="absolute bottom-2 left-1/2 h-[5px] w-[108px] -translate-x-1/2 rounded-full bg-ink/85" />
      </div>
    </div>
  );
}
