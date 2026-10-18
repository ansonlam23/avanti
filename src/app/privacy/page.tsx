import type { Metadata } from "next";
import { headers } from "next/headers";
import { PrivacyPage, type AiUse } from "@/components/privacy/privacy-page";
import { hasClaude, hasGemini, paymentMode, shopperAiMode } from "@/lib/env";

export const metadata: Metadata = {
  title: { absolute: "How avanti uses AI" },
  description:
    "What avanti keeps, what its AI does, and what shop owners decide: short, and true to how the app works.",
};

/**
 * Which model answers shoppers, said the way this deployment is set up
 * (SHOPPER_AI, CONTRACTS §12), so the page never claims a model it doesn't use.
 */
function shopperAi(): AiUse {
  const mode = shopperAiMode();
  const gemini = mode !== "claude" && hasGemini();
  const claude = mode !== "gemini" && hasClaude();
  if (gemini && claude) {
    return { who: "Gemini (Google)", what: "runs the AI shopper, with Claude (Anthropic) as backup." };
  }
  if (gemini) return { who: "Gemini (Google)", what: "runs the AI shopper." };
  return { who: "Claude (Anthropic)", what: "runs the AI shopper." };
}

/** The MCP endpoint on this deployment, whichever host serves the page. */
async function mcpUrl(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "try-avanti.vercel.app").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}/api/mcp`;
}

// /privacy: how avanti uses AI and your data. Every line is checked against the code.
export default async function Privacy() {
  return <PrivacyPage payments={paymentMode()} shopperAi={shopperAi()} mcpUrl={await mcpUrl()} />;
}
