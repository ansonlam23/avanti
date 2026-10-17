"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Receipt } from "@/components/brand";
import { EASE, SPRING } from "@/lib/motion";
import type { PaymentMode } from "@/lib/types";
import { PhoneChat } from "./phone-chat";
import { useReducedMotionSafe } from "./use-reduced";

/**
 * Laptop only: the still life to the right of the headline. The printer
 * (rendered by the hero, so phones keep the same OpenSign) prints OPEN;
 * once it tears (`lit`) the shopper taps Confirm & hold, the receipt lands
 * on the counter and HELD is stamped on it. Sample data, labelled.
 */
export function HeroScene({ lit, payments }: { lit: boolean; payments: PaymentMode }) {
  const reduce = useReducedMotionSafe();
  // 0 waiting for the sign · 1 the key is pressed · 2 the receipt lands · 3 HELD is stamped
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!lit) return;
    const timers = reduce
      ? [setTimeout(() => setStep(3), 0)]
      : [setTimeout(() => setStep(1), 260), setTimeout(() => setStep(2), 560), setTimeout(() => setStep(3), 1250)];
    return () => timers.forEach(clearTimeout);
  }, [lit, reduce]);

  return (
    <div
      className="lp-hero-scene"
      role="img"
      aria-label="Sample: a shopper asks an AI for chocolate cake, taps Confirm and hold, and the receipt prints HELD, $18.00, not charged."
    >
      <div className="lp-stage">
        {/* the receipt the order printed, lying under the OPEN slip's torn edge */}
        <motion.div
          className="absolute left-[-14px] top-[296px] origin-top-left scale-[1.07]"
          initial={false}
          animate={step >= 2 ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: 34, rotate: -6 }}
          transition={reduce ? { duration: 0 } : SPRING.paper}
        >
          <Receipt
            shopName="Mai's Bakery"
            lines={[{ label: "Chocolate cake", qty: 1, amount_cents: 1800 }]}
            total_cents={1800}
            status={step >= 3 ? "held" : "pending"}
            mode={payments}
            time="Pickup 5:30 PM"
            tilt={-3.4}
            className="w-[292px]"
          />
        </motion.div>

        {/* the shopper's phone, set down on the counter */}
        <motion.div
          className="absolute left-[318px] top-[112px]"
          initial={{ opacity: 0, y: 22, rotate: 5 }}
          animate={{ opacity: 1, y: 0, rotate: 3 }}
          transition={reduce ? { duration: 0.15 } : { delay: 0.3, duration: 0.8, ease: EASE.out }}
        >
          <PhoneChat pressed={step === 1} placed={step >= 2} payments={payments} />
        </motion.div>
      </div>
    </div>
  );
}
