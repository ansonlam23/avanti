import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env, hasClaude, hasShopperAi, serviceStatus, shopperAiMode } from "./env";

beforeEach(() => {
  for (const name of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "SHOPPER_AI", "GEMINI_FALLBACK_MODELS"]) {
    vi.stubEnv(name, "");
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("shopper AI config", () => {
  it("SHOPPER_AI is auto unless it says gemini or claude", () => {
    expect(shopperAiMode()).toBe("auto");
    vi.stubEnv("SHOPPER_AI", " Claude ");
    expect(shopperAiMode()).toBe("claude");
    vi.stubEnv("SHOPPER_AI", "gemini");
    expect(shopperAiMode()).toBe("gemini");
    vi.stubEnv("SHOPPER_AI", "openai");
    expect(shopperAiMode()).toBe("auto");
  });

  it("the chat is configured when the mode has a provider with a key", () => {
    expect(hasShopperAi()).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-for-tests");
    expect(hasClaude()).toBe(true);
    expect(hasShopperAi()).toBe(true); // auto → Claude alone is enough
    vi.stubEnv("SHOPPER_AI", "gemini");
    expect(hasShopperAi()).toBe(false); // gemini mode never uses Claude
    vi.stubEnv("GEMINI_API_KEY", "fake-for-tests");
    expect(hasShopperAi()).toBe(true);
    vi.stubEnv("SHOPPER_AI", "claude");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(hasShopperAi()).toBe(false); // claude mode never uses Gemini
  });

  it("reads models: Claude default Haiku 5.5; Gemini fallbacks as a trimmed comma list", () => {
    expect(env.anthropicModel()).toBe("claude-haiku-5-5");
    expect(env.geminiFallbackModels()).toEqual([]);
    vi.stubEnv("GEMINI_FALLBACK_MODELS", " gemini-a, ,gemini-b ");
    expect(env.geminiFallbackModels()).toEqual(["gemini-a", "gemini-b"]);
  });

  it("serviceStatus reports labels and booleans, never key values", () => {
    const secret = `k-${crypto.randomUUID()}`;
    vi.stubEnv("GEMINI_API_KEY", secret);
    vi.stubEnv("ANTHROPIC_API_KEY", secret);
    const status = serviceStatus();
    expect(status).toMatchObject({
      gemini: true,
      claude: true,
      claude_model: "claude-haiku-5-5",
      shopper_ai: "auto",
    });
    expect(JSON.stringify(status)).not.toContain(secret);
  });
});
