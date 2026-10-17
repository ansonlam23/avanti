"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { FocusReveal, Receipt, SignedSlip } from "@/components/brand";
import { formatCents, formatTime } from "@/lib/format";
import { EASE, motionSpeed } from "@/lib/motion";
import type { PublicOrder } from "@/lib/types";
import type { Reveal } from "./use-shopper";

// The two hero beats after "Confirm & hold", as one focus reveal over the chat:
//   1 · VERIFIED: the shop checked the agent's signed request before anything else.
//   2 · HELD: the receipt prints (feed → tear → total → stamp).
// Then it resolves back into the chat (where the same receipt waits). A tap anywhere closes it.

const VERIFIED_MS = 2600; // the stamp lands at 0.9 s; let it read
const AFTER_PRINT_MS = 1500;
const SAFETY_MS = 9000;

export function pickupQrValue(order: PublicOrder): string {
  return `Open Sign pickup · code ${order.pickup_code} · order ${order.id.slice(0, 8)}`;
}

export function receiptProps(order: PublicOrder) {
  return {
    shopName: order.shop_name,
    lines: [{ label: order.item_name, qty: order.qty, amount_cents: order.amount_cents }],
    total_cents: order.amount_cents,
    status: order.status,
    mode: order.payment_mode,
    pickupCode: order.status === "held" ? order.pickup_code : null,
    orderId: order.id,
    cardLast4: order.card_last4,
    time: order.pickup_time ? `Pickup ${formatTime(order.pickup_time)}` : "Pickup today",
    qrValue: order.status === "held" ? pickupQrValue(order) : null,
  };
}

export function OrderReveal({
  reveal,
  order,
  onChange,
  children,
}: {
  reveal: Reveal | null;
  order: PublicOrder | null;
  onChange: (next: Reveal | null) => void;
  children: ReactNode;
}) {
  const open = reveal !== null && order !== null;
  const step = reveal?.step ?? "verified";
  const closeTimer = useRef<number | null>(null);

  // Beat 1 → beat 2.
  useEffect(() => {
    if (!reveal || reveal.step !== "verified") return;
    const t = window.setTimeout(() => onChange({ ...reveal, step: "held" }), VERIFIED_MS / motionSpeed());
    return () => window.clearTimeout(t);
  }, [reveal, onChange]);

  // Beat 2 ends a moment after the receipt has printed (or after a safety timeout).
  useEffect(() => {
    if (!reveal || reveal.step !== "held") return;
    const t = window.setTimeout(() => onChange(null), SAFETY_MS / motionSpeed());
    return () => {
      window.clearTimeout(t);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [reveal, onChange]);

  const onPrinted = useCallback(() => {
    closeTimer.current = window.setTimeout(() => onChange(null), AFTER_PRINT_MS / motionSpeed());
  }, [onChange]);

  const amount = order ? formatCents(order.amount_cents) : "";
  const simulated = order?.payment_mode === "simulated";

  return (
    <FocusReveal
      open={open}
      tone={step === "held" ? "held" : "verified"}
      eyebrow={step === "held" ? "Visa hold" : "Order verified"}
      title={<Beat k={step}>{step === "held" ? "Held, not charged" : "Signed by a known agent"}</Beat>}
      tilt={step === "held" ? 2 : -3}
      object={(cue) =>
        order ? (
          <AnimatePresence mode="wait" initial={false}>
            {step === "verified" ? (
              <motion.div key="verified" exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18, ease: EASE.in } }}>
                <SignedSlip cue={cue} />
              </motion.div>
            ) : (
              <motion.div
                key="held"
                className="-my-[46px] scale-[0.8] lg:my-0 lg:scale-100"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE.out }}
              >
                <Receipt {...receiptProps(order)} printing onPrinted={onPrinted} />
              </motion.div>
            )}
          </AnimatePresence>
        ) : null
      }
      card={
        step === "verified" ? (
          <Beat k={step}>Checked first. Then Visa was asked for a hold.</Beat>
        ) : simulated ? (
          <Beat k={step}>A simulated {amount} hold: no Visa call yet.</Beat>
        ) : undefined
      }
      onDismiss={() => onChange(null)}
      className="h-full"
    >
      {children}
    </FocusReveal>
  );
}

/** Re-enter when the beat changes (the reveal itself stays open between beats). */
function Beat({ k, children }: { k: string; children: ReactNode }) {
  return (
    <motion.span
      key={k}
      className="block"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE.out }}
    >
      {children}
    </motion.span>
  );
}
