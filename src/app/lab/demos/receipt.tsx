"use client";

import { useState } from "react";
import { Receipt } from "@/components/brand";
import type { OrderStatus } from "@/lib/types";
import { Pill, Section, Stage } from "../stage";

export const ORDER = {
  shopName: "Mai's Bakery",
  lines: [{ label: "Chocolate cake", qty: 1, amount_cents: 1800 }],
  total_cents: 1800,
  pickupCode: "4821",
  orderId: "7f3c9a1e-55b2-4d1a-9c0e-2b8f61d0a4c3",
  cardLast4: "1111",
  time: "Pickup today · 5:30 PM",
};

/** A held receipt you can pick up or release (stamps keep history). */
function LiveReceipt({ mode }: { mode: "sandbox" | "simulated" }) {
  const [status, setStatus] = useState<OrderStatus>("held");
  const [printed, setPrinted] = useState(false);
  return (
    <div className="flex flex-col items-center gap-6">
      <Receipt {...ORDER} mode={mode} status={status} printing qrValue="pickup" onPrinted={() => setPrinted(true)} />
      <div className="flex flex-wrap justify-center gap-2">
        <Pill onClick={() => setStatus("paid")} active={status === "paid"}>
          Picked up
        </Pill>
        <Pill onClick={() => setStatus("released")} active={status === "released"}>
          No-show
        </Pill>
      </div>
      <p className="label-print text-ink-muted" aria-live="polite">
        {printed ? "printed" : "printing…"} · {status}
      </p>
    </div>
  );
}

export function ReceiptDemos() {
  return (
    <Section
      id="receipt"
      title="Receipt"
      intro="Print script: the paper feeds out of the printer's mouth row by row (75 ms each), is torn off → the total counts up from $0.00 → the stamp thunks down → the receipt shakes. Status changes land a new stamp over the old one; the honest footer is always printed."
    >
      <Stage label="Sandbox · print → pick up / no-show" minH={720}>
        {(take) => <LiveReceipt key={take} mode="sandbox" />}
      </Stage>
      <Stage label="Simulated mode" minH={720}>
        {(take) => <LiveReceipt key={take} mode="simulated" />}
      </Stage>
      <Stage label="Static states" width="wide" minH={560}>
        {(take) => (
          <div key={take} className="flex flex-wrap items-start justify-center gap-8">
            <Receipt {...ORDER} mode="sandbox" status="paid" pickupCode={null} />
            <Receipt {...ORDER} mode="simulated" status="released" pickupCode={null} />
            <Receipt
              shopName="Pho Real"
              lines={[
                { label: "Pho tai", qty: 2, amount_cents: 2800 },
                { label: "Iced coffee", amount_cents: 550 },
              ]}
              total_cents={3350}
              mode="sandbox"
              status="failed"
              time="Pickup today · 12:15 PM"
            />
          </div>
        )}
      </Stage>
    </Section>
  );
}
