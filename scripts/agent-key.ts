// Create the "Open Sign Shopper" Ed25519 key and register it in the agent directory.
// Usage: pnpm keys:agent [--rotate]
// - Writes AGENT_KEY_ID / AGENT_ED25519_PRIVATE_KEY / AGENT_ED25519_PUBLIC_KEY into
//   .env.local directly. The private key is never printed.
// - Upserts the public key into public.agents (if Supabase is configured).
// Formats (see CONTRACTS.md):
//   AGENT_ED25519_PRIVATE_KEY = base64 of PKCS#8 DER (one line)
//   AGENT_ED25519_PUBLIC_KEY  = base64url raw 32-byte key (JWK "x")
//   AGENT_KEY_ID              = RFC 7638 JWK thumbprint (base64url SHA-256)

import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_FILE = ".env.local";
const AGENT_NAME = "Open Sign Shopper";
const rotate = process.argv.includes("--rotate");

function thumbprint(x: string): string {
  // Members in lexicographic order, no whitespace (RFC 7638 §3.2).
  const canonical = JSON.stringify({ crv: "Ed25519", kty: "OKP", x });
  return createHash("sha256").update(canonical).digest("base64url");
}

function setEnvLines(file: string, values: Record<string, string>) {
  let text = readFileSync(file, "utf8");
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
  }
  writeFileSync(file, text, { mode: 0o600 });
}

// tsx runs these scripts as CommonJS, so no top-level await.
async function main() {
let keyId = process.env.AGENT_KEY_ID ?? "";
let x = process.env.AGENT_ED25519_PUBLIC_KEY ?? "";

if (!keyId || !x || !process.env.AGENT_ED25519_PRIVATE_KEY || rotate) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  x = jwk.x;
  keyId = thumbprint(x);
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  setEnvLines(ENV_FILE, {
    AGENT_KEY_ID: keyId,
    AGENT_ED25519_PRIVATE_KEY: pkcs8,
    AGENT_ED25519_PUBLIC_KEY: x,
  });
  console.log(`✓ new agent key written to ${ENV_FILE} (private key not shown)`);
} else {
  console.log("• agent key already in .env.local (use --rotate for a new one)");
}
console.log(`  key_id: ${keyId}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.log("• Supabase not configured yet; run again after adding keys to register the agent.");
} else {
  const db = createClient(url, secret, { auth: { persistSession: false } });
  if (rotate) await db.from("agents").update({ verified: false }).eq("name", AGENT_NAME).neq("key_id", keyId);
  const { error } = await db
    .from("agents")
    .upsert(
      { name: AGENT_NAME, key_id: keyId, public_jwk: { kty: "OKP", crv: "Ed25519", x }, verified: true },
      { onConflict: "key_id" },
    );
  if (error) {
    console.error("✗ could not register agent:", error.message);
    process.exitCode = 1;
  } else {
    console.log(`✓ registered "${AGENT_NAME}" in the agent directory`);
  }
}
}

void main();
