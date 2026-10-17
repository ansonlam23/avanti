// Tests the Claude tool LOOP (not the model) with an injected, scripted client:
// what it sends (system/tools caching, tool_choice, no extended thinking, the
// tool_use → tool_result pairing) and that a full turn emits the same events,
// in the same order, as the Gemini loop.
import type { ToolResultBlockParam, ToolUseBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shopperSystemPrompt } from "./prompts/shopper";
import { fakeClaude } from "./shopper-fakes";
import { TOOL_NAMES, type ChatEvent, type ChatTurn } from "./shopper-types";

let claude = fakeClaude();
vi.mock("@/lib/ai/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./claude")>()),
  getClaude: () => claude.client,
}));

const runTool = vi.fn(async (name: string) => ({ ok: true, tool: name }));
vi.mock("@/lib/ai/tools", () => ({ runTool: (...a: unknown[]) => runTool(...(a as [string])) }));

const { runShopperTurn, MAX_TOOL_ROUNDS } = await import("./shopper");
const { MAX_OUTPUT_TOKENS } = await import("./shopper-claude");

const NOW = new Date("2026-10-16T22:12:00Z");

function start(turns: ChatTurn[], signal?: AbortSignal) {
  const events: ChatEvent[] = [];
  const done = runShopperTurn({ turns, emit: (e) => events.push(e), now: NOW, signal });
  return { events, done };
}

async function run(turns: ChatTurn[], signal?: AbortSignal) {
  const { events, done } = start(turns, signal);
  const stats = await done;
  return { events, stats };
}

const turnOf = (events: ChatEvent[]) => (events.at(-1) as Extract<ChatEvent, { type: "turn" }>).turn;
const blocks = <T>(content: unknown) => content as T[];

beforeEach(() => {
  claude = fakeClaude();
  runTool.mockClear();
  vi.stubEnv("SHOPPER_AI", "claude");
  vi.stubEnv("ANTHROPIC_API_KEY", "fake-for-tests");
  vi.stubEnv("ANTHROPIC_MODEL", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("the Claude loop (a full turn with SHOPPER_AI=claude)", () => {
  it("streams a text-only answer; caches tools + system; no extended thinking", async () => {
    claude.script.push({ text: ["Mai's has ", "one."] });
    const { events, stats } = await run([{ role: "user", text: "hello" }]);

    expect(events.map((e) => e.type)).toEqual(["text", "text", "turn"]);
    expect(events[0]).toEqual({ type: "text", delta: "Mai's has " });
    expect(turnOf(events)).toEqual({ role: "model", text: "Mai's has one." });
    expect(stats.rounds).toBe(0);

    expect(claude.requests).toHaveLength(1);
    const req = claude.requests[0];
    expect(req).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: shopperSystemPrompt(NOW), cache_control: { type: "ephemeral" } }],
      tool_choice: { type: "auto" },
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(req.tools?.map((t) => ("name" in t ? t.name : null))).toEqual([...TOOL_NAMES]);
    // One breakpoint, on the last tool (tools are the stable head of every request).
    expect(req.tools?.map((t) => ("cache_control" in t ? t.cache_control : undefined))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      { type: "ephemeral" },
    ]);
  });

  it("runs one tool round (keeping Claude's ids), then streams the answer", async () => {
    claude.script.push(
      { tools: [{ id: "toolu_01Abc", name: "search_shops", input: { query: "cake" } }] },
      { text: ["Mai's has one."] },
    );
    const { events, stats } = await run([{ role: "user", text: "cake?" }]);

    expect(events.map((e) => e.type)).toEqual(["call", "tool", "text", "turn"]);
    expect(events[0]).toEqual({ type: "call", name: "search_shops", args: { query: "cake" } });
    expect(runTool).toHaveBeenCalledWith("search_shops", { query: "cake" }, expect.objectContaining({ myShops: [] }));

    const second = claude.requests[1].messages;
    expect(second.at(-2)).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_01Abc", name: "search_shops", input: { query: "cake" }, caller: { type: "direct" } }],
    });
    expect(second.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_01Abc", content: JSON.stringify({ ok: true, tool: "search_shops" }) }],
    });
    expect(turnOf(events)).toEqual({
      role: "model",
      text: "Mai's has one.",
      tool_calls: [{ id: "toolu_01Abc", name: "search_shops", args: { query: "cake" }, step: 0 }],
      tool_results: [{ id: "toolu_01Abc", name: "search_shops", result: { ok: true, tool: "search_shops" }, step: 0 }],
    });
    expect(stats.rounds).toBe(1);
  });

  it("sends a preamble back with its tool_use, and records it as its own sentence", async () => {
    claude.script.push(
      { text: ["Let me check."], tools: [{ id: "toolu_1", name: "search_shops", input: { query: "cake" } }] },
      { text: ["Mai's has one."] },
    );
    const { events } = await run([{ role: "user", text: "cake?" }]);
    expect(events.map((e) => e.type)).toEqual(["text", "call", "tool", "text", "turn"]);
    expect(claude.requests[1].messages.at(-2)?.content).toMatchObject([
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "toolu_1" },
    ]);
    expect(turnOf(events).text).toBe("Let me check. Mai's has one.");
  });

  it("answers parallel calls together, in order, and flags a failed tool", async () => {
    runTool.mockImplementationOnce(async () => ({ ok: false, error: "not_found", message: "No shop." }) as never);
    claude.script.push(
      {
        tools: [
          { id: "toolu_a", name: "ask_shop", input: { shop_slug: "a", question: "nuts?" } },
          { id: "toolu_b", name: "get_menu", input: { shop_slug: "a" } },
        ],
      },
      { text: ["Done."] },
    );
    const { events } = await run([{ role: "user", text: "nuts?" }]);

    expect(events.map((e) => e.type)).toEqual(["call", "call", "tool", "tool", "text", "turn"]);
    const results = blocks<ToolResultBlockParam>(claude.requests[1].messages.at(-1)?.content);
    expect(results.map((r) => [r.tool_use_id, r.is_error ?? false])).toEqual([
      ["toolu_a", true],
      ["toolu_b", false],
    ]);
  });

  it("hands the prefetched sold-out search to Claude as a synthetic tool_use + tool_result", async () => {
    claude.script.push({ text: ["Heads up: Ave Bakery has one."] });
    const { events } = await run([
      { role: "user", text: "cake by 6" },
      { role: "model", text: "Mai's has one." },
      {
        role: "user",
        hidden: true,
        text: "[event] Mai's Bakery just marked Chocolate cake sold out.",
        event: { kind: "sold_out", shop_slug: "mais-bakery", item_id: "i1", item_name: "Chocolate cake", needed_by: "18:00" },
      },
    ]);

    expect(runTool).toHaveBeenCalledTimes(1);
    expect(runTool).toHaveBeenCalledWith("search_shops", { query: "Chocolate cake", needed_by: "18:00" }, expect.anything());
    expect(events.map((e) => e.type)).toEqual(["call", "tool", "text", "turn"]);

    const sent = claude.requests[0].messages;
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    const [use] = blocks<ToolUseBlockParam>(sent.at(-2)?.content);
    const [result] = blocks<ToolResultBlockParam>(sent.at(-1)?.content);
    expect(use).toMatchObject({ type: "tool_use", name: "search_shops", input: { query: "Chocolate cake", needed_by: "18:00" } });
    expect(use.id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(result).toEqual({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ ok: true, tool: "search_shops" }) });
    expect(turnOf(events).tool_calls).toEqual([{ name: "search_shops", args: { query: "Chocolate cake", needed_by: "18:00" }, step: 0 }]);
  });

  it("stops calling tools after the round limit: the last round is text-only, tools still declared", async () => {
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      claude.script.push({ tools: [{ id: `toolu_${i}`, name: "get_menu", input: { shop_slug: "a" } }] });
    }
    claude.script.push({ text: ["Here's what I found."] });
    const { events, stats } = await run([{ role: "user", text: "menu" }]);

    expect(stats.rounds).toBe(MAX_TOOL_ROUNDS);
    expect(claude.requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(claude.requests.slice(0, -1).map((r) => r.tool_choice)).toEqual(Array(MAX_TOOL_ROUNDS).fill({ type: "auto" }));
    expect(claude.requests.at(-1)?.tool_choice).toEqual({ type: "none" });
    expect(claude.requests.at(-1)?.tools).toHaveLength(TOOL_NAMES.length);
    expect(turnOf(events).tool_calls?.map((c) => c.step)).toEqual([0, 1, 2, 3, 4]);
  });

  it("stops at an abort: after a tool round, no more model calls", async () => {
    const ctrl = new AbortController();
    runTool.mockImplementationOnce(async (name: string) => {
      ctrl.abort();
      return { ok: true, tool: name };
    });
    claude.script.push({ tools: [{ id: "toolu_1", name: "get_menu", input: { shop_slug: "a" } }] }, { text: ["never sent"] });
    const { events } = await run([{ role: "user", text: "menu" }], ctrl.signal);
    expect(claude.requests).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(["call", "tool", "turn"]); // no "no_reply" after an abort
  });

  it("stops at an abort mid-stream: the turn throws (the route stays quiet) and emits nothing", async () => {
    const ctrl = new AbortController();
    claude.script.push({ text: ["too late"] });
    const { events, done } = start([{ role: "user", text: "hello" }], ctrl.signal);
    ctrl.abort();
    await expect(done).rejects.toThrow(/aborted/i);
    expect(events).toEqual([]);
  });

  it("reports honestly when the model says nothing", async () => {
    claude.script.push({});
    const { events } = await run([{ role: "user", text: "hello" }]);
    expect(events.map((e) => e.type)).toEqual(["error", "turn"]);
    expect(events[0]).toMatchObject({ code: "no_reply" });
  });

  it("never runs a tool call that was cut off (max_tokens, refusal)", async () => {
    claude.script.push({ tools: [{ id: "toolu_1", name: "get_menu", input: { shop_slug: "a" } }], stop_reason: "max_tokens" });
    await run([{ role: "user", text: "menu" }]);
    claude.script.push({ text: ["I can't help"], tools: [{ id: "toolu_2", name: "get_menu", input: {} }], stop_reason: "refusal" });
    const { events } = await run([{ role: "user", text: "menu" }]);
    expect(runTool).not.toHaveBeenCalled();
    expect(claude.requests).toHaveLength(2);
    expect(turnOf(events)).toEqual({ role: "model", text: "I can't help" });
  });

  it("answers an unknown tool name but shows no card for it", async () => {
    claude.script.push({ tools: [{ id: "toolu_x", name: "place_order", input: {} }] }, { text: ["I can't do that."] });
    const { events } = await run([{ role: "user", text: "just buy it" }]);
    expect(events.some((e) => e.type === "tool" || e.type === "call")).toBe(false);
    expect(blocks<ToolResultBlockParam>(claude.requests[1].messages.at(-1)?.content)[0]).toMatchObject({ tool_use_id: "toolu_x" });
    expect(turnOf(events)).toEqual({ role: "model", text: "I can't do that." });
  });

  it("uses ANTHROPIC_MODEL, with that model's way of turning thinking off", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    claude.script.push({ text: ["Hi."] });
    await run([{ role: "user", text: "hello" }]);
    expect(claude.requests[0]).toMatchObject({ model: "claude-sonnet-5-5", thinking: { type: "between_tools" } });
  });
});
