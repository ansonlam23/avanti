// Visa sandbox smoke test: real hold → charge / hold → release / hold in the
// Visa Acceptance (Cybersource) sandbox. The printed ids and order references
// are what to look up in the Business Center (Transaction Management →
// Transactions, search by merchant reference number).
// Usage: pnpm tsx --env-file=.env.local scripts/visa-smoke.ts
// Self-contained on purpose: reads process.env and imports only the pure
// payments modules (never src/lib/env, which is server-only). Prints no secrets.

import { createCybersourceAdapter } from "../src/lib/visa/cybersource";
import { DEMO_TEST_CARD, type PaymentResult } from "../src/lib/visa/types";
import { formatAmount } from "../src/lib/visa/validate";

const merchantId = (process.env.VISA_MERCHANT_ID ?? "").trim();
const keyId = (process.env.VISA_KEY_ID ?? "").trim();
const sharedSecret = (process.env.VISA_SHARED_SECRET ?? "").trim();
const host = (process.env.VISA_HOST ?? "").trim() || "apitest.cybersource.com";

if (!merchantId || !keyId || !sharedSecret) {
  console.log("Visa sandbox keys not set — skipped");
  process.exit(0);
}

const pay = createCybersourceAdapter({ merchantId, keyId, sharedSecret, host });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); // 20261016T193000Z
let failures = 0;

function show(step: string, ref: string, r: PaymentResult): PaymentResult {
  const raw = (r.raw ?? {}) as { status?: string; httpStatus?: number };
  const visa = raw.status ? `  visa_status=${raw.status}` : "";
  if (r.ok) {
    const card = r.cardLast4 ? `  card=•••• ${r.cardLast4}` : "";
    console.log(`✓ ${step.padEnd(20)} ${r.status.padEnd(10)} id=${r.id}  ref=${ref}${visa}${card}`);
  } else {
    failures++;
    const http = raw.httpStatus ? ` http=${raw.httpStatus}` : "";
    console.log(`✗ ${step.padEnd(20)} ${r.code}${http}  ref=${ref}${visa}  ${r.message}`);
  }
  return r;
}

const usd = (cents: number) => `$${formatAmount(cents)}`;

async function holdThen(label: string, cents: number, then: "charge" | "release" | "keep") {
  const ref = `OS-SMOKE-${stamp}-${label}`;
  const held = show(`${label}) hold ${usd(cents)}`, ref, await pay.hold({
    orderId: ref,
    amountCents: cents,
    currency: "USD",
    card: DEMO_TEST_CARD,
    description: `Open Sign smoke test ${label}: hold then ${then}`,
  }));
  if (!held.ok || then === "keep") return;
  if (then === "charge") {
    show(`${label}) charge ${usd(cents)}`, ref, await pay.charge({
      orderId: ref,
      authId: held.id,
      amountCents: cents,
      heldAmountCents: cents,
      currency: "USD",
    }));
  } else {
    show(`${label}) release ${usd(cents)}`, ref, await pay.release({
      orderId: ref,
      authId: held.id,
      amountCents: cents,
      currency: "USD",
      reason: "no_show",
    }));
  }
}

// No top-level await: tsx compiles this repo's .ts scripts as CommonJS.
async function main() {
  console.log(`Visa sandbox smoke test → https://${host}  (run ${stamp})`);
  await holdThen("A", 450, "charge"); // (a) hold $4.50 → charge
  await holdThen("B", 1800, "release"); // (b) hold $18.00 → release (no-show)
  await holdThen("C", 600, "keep"); // (c) hold $6.00, left held
  console.log(
    failures
      ? `\n${failures} step(s) failed.`
      : "\nAll steps passed. Business Center (test): https://businesscentertest.cybersource.com/ebc2/ → Transactions → search the refs above.",
  );
  process.exitCode = failures ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("✗ smoke test crashed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
