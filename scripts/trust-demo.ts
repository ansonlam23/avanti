// Trust demo: a shopper agent signs an order, the shop verifies it, and
// tampered / replayed / unsigned copies get turned away.
// Usage: pnpm tsx scripts/trust-demo.ts
// Needs no env vars: the agent key is generated on the spot and never saved.

import { randomUUID } from "node:crypto";
import {
  generateAgentKeyPair,
  memoryDirectory,
  memoryNonceStore,
  signatureBase,
  signRequest,
  verifyRequest,
  type DirectoryAgent,
  type VerifyResult,
} from "../src/lib/trust";

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint("1");
const dim = paint("2");
const green = paint("32");
const red = paint("31");
const cyan = paint("36");

const SHOP_URL = "https://open-sign.example/api/shops/mais-bakery/orders";
const OTHER_SHOP_URL = "https://open-sign.example/api/shops/pho-hoa/orders";

function heading(text: string) {
  console.log(`\n${bold(text)}`);
}

function field(name: string, value: string) {
  console.log(`  ${cyan(name.padEnd(16))} ${value}`);
}

async function main() {
  console.log(bold("Open Sign · trust demo"));
  console.log(dim("TAP-style signed agent orders: Ed25519 + RFC 9421 HTTP Message Signatures + RFC 9530 Content-Digest"));

  // 1. The agent's identity, and the shop's directory of verified agents.
  const { signer, publicJwk } = generateAgentKeyPair();
  const agent: DirectoryAgent = { id: "demo-agent", name: "Open Sign Shopper", keyId: signer.keyId, publicJwk, verified: true };
  const directory = memoryDirectory([agent]);
  const nonces = memoryNonceStore();
  heading("1. Agent key (throwaway, made just now)");
  field("keyid", `${signer.keyId}  ${dim("(RFC 7638 thumbprint)")}`);
  field("public key x", publicJwk.x);

  // 2. The agent signs an order. The amount comes from the shop's menu.
  const order = {
    item_id: randomUUID(),
    qty: 1,
    amount_cents: 1800,
    pickup_time: null,
    customer_name: "Sam",
    idempotency_key: randomUUID(),
  };
  const body = JSON.stringify(order);
  const headers = signRequest({ method: "POST", url: SHOP_URL, body, signer });
  heading("2. Signed order");
  console.log(`  POST ${SHOP_URL}`);
  console.log(`  ${dim(body)}`);
  for (const [name, value] of Object.entries(headers)) field(name, value);

  // 3. What Ed25519 actually signed.
  heading("3. Signature base (RFC 9421 §2.5): the exact text Ed25519 signs");
  const base = signatureBase({ method: "POST", url: SHOP_URL, headers: new Headers(headers) });
  for (const line of base.split("\n")) console.log(`  ${dim(line)}`);

  // 4. The shop verifies the real order, then a few attacks on it.
  const verify = (h: HeadersInit, overrides: { body?: string; url?: string } = {}) =>
    verifyRequest({
      method: "POST",
      url: overrides.url ?? SHOP_URL,
      headers: new Headers(h),
      body: overrides.body ?? body,
      directory,
      nonces,
    });
  const stranger = generateAgentKeyPair().signer;
  const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

  const attempts: Array<[string, VerifyResult]> = [
    ["the order, exactly as signed", await verify(headers)],
    ["amount edited $18.00 → $0.01", await verify(headers, { body: JSON.stringify({ ...order, amount_cents: 1 }) })],
    ["the same request, replayed", await verify(headers)],
    ["a bot with no signature", await verify({ "content-type": "application/json" })],
    ["signed by an unknown key", await verify(signRequest({ method: "POST", url: SHOP_URL, body, signer: stranger }))],
    ["captured 10 minutes ago", await verify(signRequest({ method: "POST", url: SHOP_URL, body, signer, now: tenMinutesAgo }))],
    ["replayed at another shop", await verify(headers, { url: OTHER_SHOP_URL })],
  ];

  heading("4. The shop verifies");
  for (const [label, result] of attempts) {
    const outcome = result.ok
      ? green(`✓ verified · ${result.agent.name}`)
      : `${red(`✗ ${result.reason}`)} ${dim(`· ${result.detail}`)}`;
    console.log(`  ${label.padEnd(30)} ${outcome}`);
  }
  const blocked = attempts.filter(([, result]) => !result.ok).length;
  console.log(`\n  ${bold(`${attempts.length - blocked} verified, ${blocked} blocked`)} ${dim("(in Open Sign, a blocked order stops before any Visa call)")}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
