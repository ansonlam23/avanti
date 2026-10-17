import "server-only";
import type { PaymentMode } from "@/lib/types";

// Read env lazily (never at import time) so builds work without secrets.
// Never log or return these values; use `serviceStatus()` for diagnostics.

function read(name: string): string {
  return (process.env[name] ?? "").trim();
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  geminiApiKey: () => read("GEMINI_API_KEY"),
  geminiModel: () => read("GEMINI_MODEL") || "gemini-3.8-flash",
  /** More free Gemini models for the shopper chat to try, in order, when one is rate limited (comma list). */
  geminiFallbackModels: () => list(read("GEMINI_FALLBACK_MODELS")),

  // Claude is the paid overflow for the shopper chat only (onboarding stays on Gemini: it needs audio).
  anthropicApiKey: () => read("ANTHROPIC_API_KEY"),
  anthropicModel: () => read("ANTHROPIC_MODEL") || "claude-haiku-5-5",

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

export function hasClaude(): boolean {
  return env.anthropicApiKey().length > 0;
}

export type ShopperAiMode = "auto" | "gemini" | "claude";

/**
 * SHOPPER_AI: "auto" (default) = free Gemini first, then GEMINI_FALLBACK_MODELS,
 * then Claude when ANTHROPIC_API_KEY is set; "gemini" = never Claude; "claude" = Claude only.
 */
export function shopperAiMode(): ShopperAiMode {
  const mode = read("SHOPPER_AI").toLowerCase();
  return mode === "gemini" || mode === "claude" ? mode : "auto";
}

/** Can the shopper chat answer at all with this config? */
export function hasShopperAi(): boolean {
  const mode = shopperAiMode();
  return (mode !== "claude" && hasGemini()) || (mode !== "gemini" && hasClaude());
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
    claude: hasClaude(),
    claude_model: env.anthropicModel(),
    shopper_ai: shopperAiMode(),
    supabase: hasSupabase(),
    payments: paymentMode(),
    visa_keys: hasVisaKeys(),
    agent_key: hasAgentKey(),
  };
}
