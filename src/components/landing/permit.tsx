import type { PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";

// "What's real" as one printed slip: each line is what we built and how real
// it is on this deployment. Dotted leaders are allowed here: it's a receipt.
type Status = "REAL" | "SANDBOX" | "SIMULATED" | "DEMO" | "OFFLINE";

export function Permit({ payments, ai = true, className }: { payments: PaymentMode; ai?: boolean; className?: string }) {
  const rows: { what: string; status: Status }[] = [
    { what: "Gemini AI", status: ai ? "REAL" : "OFFLINE" },
    { what: "Visa payments", status: payments === "sandbox" ? "SANDBOX" : "SIMULATED" },
    { what: "Signed agent orders", status: "REAL" },
    { what: "Blocked bots", status: "REAL" },
    { what: "The shops", status: "DEMO" },
  ];

  return (
    <figure className={cn("slip-drop mx-auto w-full max-w-[420px]", className)} style={{ rotate: "-0.8deg" }}>
      <div className="paper edge-torn-y px-6 pb-9 pt-9 sm:px-8">
        <h2 className="thermal text-center font-display text-[36px] font-extrabold uppercase leading-none">What&apos;s real</h2>
        <div aria-hidden className="print-rule my-5" />
        <ul className="space-y-3 text-[15px] sm:text-[16px]">
          {rows.map((r) => (
            <li key={r.what} className="flex items-baseline gap-2">
              <span className="shrink-0">{r.what}</span>
              <span aria-hidden className="leader" />
              <span className="shrink-0 font-bold tracking-[0.06em]">{r.status}</span>
            </li>
          ))}
        </ul>
        <div aria-hidden className="print-rule my-5" />
        <figcaption className="text-center text-[15px] leading-snug text-ink-muted">
          {payments === "sandbox" ? "Test cards only · no money moves" : "No Visa keys here yet: payments are simulated"}
        </figcaption>
      </div>
    </figure>
  );
}
