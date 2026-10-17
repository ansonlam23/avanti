import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages";
import { env } from "@/lib/env";

// One shared Claude client (server only; the key never reaches the browser).
// Claude is the paid overflow for the shopper chat when free Gemini is busy
// (CONTRACTS §12). Model from ANTHROPIC_MODEL, default "claude-haiku-5-5".

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (client) return client;
  const apiKey = env.anthropicApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  // One quick retry for a transient 429/529/5xx; the chat route's 45 s timeout caps the rest.
  client = new Anthropic({ apiKey, maxRetries: 1 });
  return client;
}

export function claudeModel(): string {
  return env.anthropicModel();
}

/**
 * Request fields for "no extended thinking", spelled the way each model takes
 * them (the wrong spelling is a 400). Haiku 5.5 (the default) and the 4.x/5.0
 * models accept `disabled`; Sonnet 5.5 only turns thinking off with
 * `between_tools`; Opus 5/5.5, Fable and Mythos always think (or misbehave
 * with it off), so they get the least of it: low effort. Unknown model: the
 * API default.
 */
export function thinkingOff(model: string): Pick<MessageCreateParamsBase, "thinking" | "output_config"> {
  const m = model.trim().toLowerCase();
  if (m.startsWith("claude-sonnet-5-5")) return { thinking: { type: "between_tools" } };
  if (/^claude-(opus-5|fable|mythos)/.test(m)) return { output_config: { effort: "low" } };
  if (/^claude-(haiku|sonnet|opus)-[45]/.test(m)) return { thinking: { type: "disabled" } };
  return {};
}
