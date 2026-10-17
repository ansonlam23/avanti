import { afterEach, describe, expect, it, vi } from "vitest";
import { claudeModel, getClaude, thinkingOff } from "./claude";

afterEach(() => vi.unstubAllEnvs());

describe("Claude client", () => {
  it("needs ANTHROPIC_API_KEY (and never calls the network to build the client)", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => getClaude()).toThrow(/ANTHROPIC_API_KEY/);
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-for-tests");
    expect(getClaude()).toBe(getClaude()); // one shared client
  });

  it("takes the model from ANTHROPIC_MODEL, default Haiku 5.5", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "");
    expect(claudeModel()).toBe("claude-haiku-5-5");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    expect(claudeModel()).toBe("claude-sonnet-5-5");
  });
});

describe("thinkingOff (no extended thinking, as each model spells it)", () => {
  it("turns thinking off where the model allows it", () => {
    expect(thinkingOff("claude-haiku-5-5")).toEqual({ thinking: { type: "disabled" } });
    expect(thinkingOff("claude-sonnet-5")).toEqual({ thinking: { type: "disabled" } });
    expect(thinkingOff("claude-haiku-4-5")).toEqual({ thinking: { type: "disabled" } });
    expect(thinkingOff("claude-opus-4-8")).toEqual({ thinking: { type: "disabled" } });
  });

  it("uses between_tools on Sonnet 5.5 (disabled is a 400 there)", () => {
    expect(thinkingOff("claude-sonnet-5-5")).toEqual({ thinking: { type: "between_tools" } });
  });

  it("asks for low effort where thinking can't (or shouldn't) be turned off", () => {
    for (const model of ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-mythos-5-1"]) {
      expect(thinkingOff(model)).toEqual({ output_config: { effort: "low" } });
    }
  });

  it("leaves an unknown model on the API default", () => {
    expect(thinkingOff("claude-3-5-haiku-latest")).toEqual({});
    expect(thinkingOff("some-future-model")).toEqual({});
  });
});
