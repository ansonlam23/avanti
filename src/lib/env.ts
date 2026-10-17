import "server-only";
import type { PaymentMode } from "@/lib/types";

// Read env lazily (never at import time) so builds work without secrets.
// Never log or return these values; use `serviceStatus()` for diagnostics.

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

export const env = {
  geminiApiKey: () => read("GEMINI_API_KEY"),
  geminiModel: () => read("GEMINI_MODEL") || "gemini-3.8-flash",

  supabaseUrl: () => read("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => read("SUPABASE_SECRET_KEY"),

  visaMerchantId: () => read("VISA_MERCHANT_ID"),
  visaKeyId: () => read("VISA_KEY_ID"),
  visaSharedSecret: () => read("VISA_SHARED_SECRET"),
  visaHost: () => read("VISA_HOST") || "apitest.cybersource.com",

  agentKeyId: () => read("AGENT_KEY_ID"),
  agentPrivateKey: () => read("AGENT_ED25519_PRIVATE_KEY"),
  agentPublicKey: () => read("AGENT_ED25519_PUBLIC_KEY"),

  appUrl: () => read("NEXT_PUBLIC_APP_URL") || "http://localhost:3000",
};

export function hasGemini(): boolean {
  return env.geminiApiKey().length > 0;
}

export function hasSupabase(): boolean {
  return env.supabaseUrl().length > 0 && env.supabaseSecretKey().length > 0;
}

export function hasVisaKeys(): boolean {
  return Boolean(env.visaMerchantId() && env.visaKeyId() && env.visaSharedSecret());
}

/** Real sandbox only when explicitly enabled AND all keys are present. */
export function paymentMode(): PaymentMode {
  return read("PAYMENTS_MODE") === "sandbox" && hasVisaKeys() ? "sandbox" : "simulated";
}

export function hasAgentKey(): boolean {
  return Boolean(env.agentKeyId() && env.agentPrivateKey() && env.agentPublicKey());
}

export function serviceStatus() {
  return {
    gemini: hasGemini(),
    gemini_model: env.geminiModel(),
    supabase: hasSupabase(),
    payments: paymentMode(),
    visa_keys: hasVisaKeys(),
    agent_key: hasAgentKey(),
  };
}
