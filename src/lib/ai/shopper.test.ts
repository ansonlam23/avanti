// Tests the shopper TURN (not the models): the provider-agnostic orchestrator
// (prefetch once, free Gemini first, Claude as overflow) and the Gemini tool
// loop, with scripted stand-ins for both SDK clients.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeClaude, fakeGemini, httpError } from "./shopper-fakes";
import type { ChatEvent, ChatTurn } from "./shopper-types";

const gemini = fakeGemini();
let claude = fakeClaude();

vi.mock("@/lib/ai/gemini", () => ({ geminiModel: () => "gemini-main", getGemini: () => gemini.client }));
vi.mock("@/lib/ai/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./claude")>()),
  getClaude: () => claude.client,
}));

const runTool = vi.fn(async (name: string) => ({ ok: true, tool: name }));
vi.mock("@/lib/ai/tools", () => ({ runTool: (...a: unknown[]) => runTool(...(a as [string])) }));

const { runShopperTurn, MAX_TOOL_ROUNDS, COOLDOWN_MS, resetCooldowns } = await import("./shopper");

async function run(turns: ChatTurn[]) {
  const events: ChatEvent[] = [];
  const stats = await runShopperTurn({ turns, emit: (e) => events.push(e), now: new Date("2026-10-16T22:12:00Z") });
  return { events, stats };
}

const turnOf = (events: ChatEvent[]) => (events.at(-1) as Extract<ChatEvent, { type: "turn" }>).turn;

const soldOut: ChatTurn[] = [
  { role: "user", text: "cake by 6" },
  { role: "model", text: "Mai's has one." },
  {
    role: "user",
    hidden: true,
    text: "[event] Mai's Bakery just marked Chocolate cake sold out.",
    event: { kind: "sold_out", shop_slug: "mais-bakery", item_id: "i1", item_name: "Chocolate cake", query: "cake", needed_by: "18:00" },
  },
];

beforeEach(() => {
  gemini.script.length = 0;
  gemini.requests.length = 0;
  claude = fakeClaude();
  runTool.mockClear();
  resetCooldowns();
  vi.stubEnv("GEMINI_API_KEY", "fake-for-tests");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("SHOPPER_AI", "");
  vi.stubEnv("GEMINI_FALLBACK_MODELS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("runShopperTurn on Gemini", () => {
  it("runs a tool round, sends the model's own parts back (thought signature intact), then streams text", async () => {
    gemini.script.push(
      [[{ functionCall: { id: "c1", name: "search_shops", args: { query: "cake" } }, thoughtSignature: "sig-1" }]],
      [[{ text: "Mai's has " }], [{ text: "one." }]],
    );
    const { events, stats } = await run([{ role: "user", text: "cake?" }]);

    expect(events.map((e) => e.type)).toEqual(["call", "tool", "text", "text", "turn"]);
    expect(runTool).toHaveBeenCalledWith("search_shops", { query: "cake" }, expect.objectContaining({ myShops: [] }));

    const second = gemini.requests[1].contents;
    expect(second.at(-2)).toEqual({
      role: "model",
      parts: [{ functionCall: { id: "c1", name: "search_shops", args: { query: "cake" } }, thoughtSignature: "sig-1" }],
    });
    expect(second.at(-1)).toEqual({
      role: "user",
      parts: [{ functionResponse: { id: "c1", name: "search_shops", response: { output: { ok: true, tool: "search_shops" } } } }],
    });

    expect(turnOf(events)).toEqual({
      role: "model",
      text: "Mai's has one.",
      tool_calls: [{ id: "c1", name: "search_shops", args: { query: "cake" }, step: 0 }],
      tool_results: [{ id: "c1", name: "search_shops", result: { ok: true, tool: "search_shops" }, step: 0 }],
    });
    expect(stats.rounds).toBe(1);
    expect(gemini.requests[0].model).toBe("gemini-main");
    expect(gemini.requests[0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });

  it("runs parallel calls together and answers each", async () => {
    gemini.script.push(
      [
        [
          { functionCall: { name: "ask_shop", args: { shop_slug: "a", question: "nuts?" } }, thoughtSignature: "s" },
          { functionCall: { name: "get_menu", args: { shop_slug: "a" } } },
        ],
      ],
      [[{ text: "Done." }]],
    );
    const { events } = await run([{ role: "user", text: "nuts?" }]);
    expect(runTool).toHaveBeenCalledTimes(2);
    expect(gemini.requests[1].contents.at(-1)?.parts.map((p) => (p.functionResponse as { name: string }).name)).toEqual([
      "ask_shop",
      "get_menu",
    ]);
    expect(events.filter((e) => e.type === "tool")).toHaveLength(2);
  });

  it("stops calling tools after the round limit and forces a text answer", async () => {
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      gemini.script.push([[{ functionCall: { name: "get_menu", args: { shop_slug: "a" } }, thoughtSignature: `s${i}` }]]);
    }
    gemini.script.push([[{ text: "Here's what I found." }]]);
    const { stats } = await run([{ role: "user", text: "menu" }]);
    expect(stats.rounds).toBe(MAX_TOOL_ROUNDS);
    expect(gemini.requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(gemini.requests[0].config.toolConfig.functionCallingConfig.mode).toBe("AUTO");
    expect(gemini.requests.at(-1)?.config.toolConfig.functionCallingConfig.mode).toBe("NONE");
  });

  it("prefetches the alternative search for a sold-out event before the first model call", async () => {
    gemini.script.push([[{ text: "Heads up: Mai's just sold out." }]]);
    const { events } = await run(soldOut);
    expect(runTool).toHaveBeenCalledWith("search_shops", { query: "Chocolate cake", needed_by: "18:00" }, expect.anything());
    const first = gemini.requests[0].contents;
    expect(first.at(-2)?.parts[0]).toMatchObject({
      functionCall: { name: "search_shops" },
      thoughtSignature: "context_engineering_is_the_way_to_go",
    });
    expect(first.at(-1)?.parts[0]).toHaveProperty("functionResponse.name", "search_shops");
    expect(events.map((e) => e.type)).toEqual(["call", "tool", "text", "turn"]);
    expect(turnOf(events).tool_calls).toEqual([{ name: "search_shops", args: { query: "Chocolate cake", needed_by: "18:00" }, step: 0 }]);
  });

  it("reports honestly when the model says nothing", async () => {
    gemini.script.push([[]]);
    const { events } = await run([{ role: "user", text: "hello" }]);
    expect(events.map((e) => e.type)).toEqual(["error", "turn"]);
    expect(events[0]).toMatchObject({ code: "no_reply" });
  });

  it("ignores unknown tool names from the model but still answers the call", async () => {
    gemini.script.push([[{ functionCall: { name: "place_order", args: {} }, thoughtSignature: "s" }]], [[{ text: "I can't do that." }]]);
    const { events } = await run([{ role: "user", text: "just buy it" }]);
    expect(events.some((e) => e.type === "tool")).toBe(false);
    expect(gemini.requests[1].contents.at(-1)?.parts[0]).toHaveProperty("functionResponse.name", "place_order");
  });

  it("replays a turn Claude answered (toolu_ ids) without its ids", async () => {
    gemini.script.push([[{ text: "Sure." }]]);
    await run([
      { role: "user", text: "cake?" },
      {
        role: "model",
        text: "Mai's has one.",
        tool_calls: [{ id: "toolu_01AbC", name: "search_shops", args: { query: "cake" }, step: 0 }],
        tool_results: [{ id: "toolu_01AbC", name: "search_shops", result: { ok: true } as never, step: 0 }],
      },
      { role: "user", text: "and coffee?" },
    ]);
    const contents = gemini.requests[0].contents;
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user", "model", "user"]);
    expect(contents[2].parts[0]).toEqual({ functionResponse: { name: "search_shops", response: { output: { ok: true } } } });
    expect(JSON.stringify(contents)).not.toContain("toolu_");
  });
});

describe("free Gemini first, Claude as overflow", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "fake-for-tests"));

  it("a Gemini 429 on the first call hands the same turn (and the prefetched step) to Claude, events once", async () => {
    gemini.script.push({ error: httpError(429) });
    claude.script.push({ text: ["Heads up: ", "Ave Bakery has one."] });
    const { events, stats } = await run(soldOut);

    expect(events.map((e) => e.type)).toEqual(["call", "tool", "text", "text", "turn"]);
    expect(runTool).toHaveBeenCalledTimes(1); // the prefetch ran once, for both attempts
    expect(gemini.requests).toHaveLength(1);
    expect(claude.requests).toHaveLength(1);
    const sent = claude.requests[0].messages;
    expect(sent.at(-2)).toMatchObject({ role: "assistant", content: [{ type: "tool_use", name: "search_shops" }] });
    expect(sent.at(-1)).toMatchObject({ role: "user", content: [{ type: "tool_result" }] });
    expect(turnOf(events)).toEqual({
      role: "model",
      text: "Heads up: Ave Bakery has one.",
      tool_calls: [{ name: "search_shops", args: { query: "Chocolate cake", needed_by: "18:00" }, step: 0 }],
      tool_results: [{ name: "search_shops", result: { ok: true, tool: "search_shops" }, step: 0 }],
    });
    expect(stats.rounds).toBe(0);
  });

  it("a Gemini 5xx falls back too", async () => {
    gemini.script.push({ error: httpError(503) });
    claude.script.push({ text: ["Hi."] });
    const { events } = await run([{ role: "user", text: "hello" }]);
    expect(events.map((e) => e.type)).toEqual(["text", "turn"]);
    expect(claude.requests).toHaveLength(1);
  });

  it("a Gemini 429 after it already streamed text is an error, not a second answer", async () => {
    gemini.script.push({ error: httpError(429), after: [[{ text: "Mai's " }]] });
    const events: ChatEvent[] = [];
    await expect(runShopperTurn({ turns: [{ role: "user", text: "cake?" }], emit: (e) => events.push(e) })).rejects.toMatchObject({
      status: 429,
    });
    expect(events.map((e) => e.type)).toEqual(["text"]);
    expect(claude.requests).toHaveLength(0);
  });

  it("other Gemini errors (e.g. 400) don't fall back", async () => {
    gemini.script.push({ error: httpError(400) });
    await expect(run([{ role: "user", text: "hello" }])).rejects.toMatchObject({ status: 400 });
    expect(claude.requests).toHaveLength(0);
  });

  it("after a Gemini 429, skips that model for a minute, then tries it again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T20:00:00Z"));
    gemini.script.push({ error: httpError(429) });
    claude.script.push({ text: ["One."] }, { text: ["Two."] });
    await run([{ role: "user", text: "first" }]);
    expect(gemini.requests).toHaveLength(1);

    vi.setSystemTime(new Date(Date.now() + COOLDOWN_MS / 2));
    const second = await run([{ role: "user", text: "second" }]);
    expect(gemini.requests).toHaveLength(1); // straight to Claude
    expect(claude.requests).toHaveLength(2);
    expect(turnOf(second.events).text).toBe("Two.");

    vi.setSystemTime(new Date(Date.now() + COOLDOWN_MS));
    gemini.script.push([[{ text: "Three." }]]);
    const third = await run([{ role: "user", text: "third" }]);
    expect(gemini.requests).toHaveLength(2);
    expect(claude.requests).toHaveLength(2);
    expect(turnOf(third.events).text).toBe("Three.");
  });

  it("tries GEMINI_FALLBACK_MODELS in order before paying for Claude", async () => {
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "gemini-b, gemini-c,gemini-main");
    gemini.script.push({ error: httpError(429) }, { error: httpError(429) }, [[{ text: "Free answer." }]]);
    const { events } = await run([{ role: "user", text: "cake?" }]);
    expect(gemini.requests.map((r) => r.model)).toEqual(["gemini-main", "gemini-b", "gemini-c"]);
    expect(claude.requests).toHaveLength(0);
    expect(turnOf(events).text).toBe("Free answer.");

    // Both rate-limited models now cool down: the next turn starts at the one that answered.
    gemini.script.push([[{ text: "Again." }]]);
    await run([{ role: "user", text: "coffee?" }]);
    expect(gemini.requests.at(-1)?.model).toBe("gemini-c");
  });

  it("replays a turn Gemini answered (no ids) to Claude with valid, matching ids", async () => {
    gemini.script.push({ error: httpError(429) });
    claude.script.push({ text: ["Sure."] });
    await run([
      { role: "user", text: "cake?" },
      {
        role: "model",
        text: "Mai's has one.",
        tool_calls: [{ name: "search_shops", args: { query: "cake" }, step: 0 }],
        tool_results: [{ name: "search_shops", result: { ok: true } as never, step: 0 }],
      },
      { role: "user", text: "and coffee?" },
    ]);
    const [, assistant, user] = claude.requests[0].messages;
    const use = (assistant.content as Array<{ type: string; id: string }>)[0];
    const result = (user.content as Array<{ type: string; tool_use_id: string }>)[0];
    expect(use.id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(result.tool_use_id).toBe(use.id);
  });
});

describe("SHOPPER_AI", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", "fake-for-tests"));

  it("gemini: never calls Claude, even when Gemini is busy", async () => {
    vi.stubEnv("SHOPPER_AI", "gemini");
    gemini.script.push({ error: httpError(429) });
    await expect(run([{ role: "user", text: "hello" }])).rejects.toMatchObject({ status: 429 });
    expect(claude.requests).toHaveLength(0);
  });

  it("claude: Claude only", async () => {
    vi.stubEnv("SHOPPER_AI", "claude");
    claude.script.push({ text: ["Hi."] });
    const { events } = await run([{ role: "user", text: "hello" }]);
    expect(events.map((e) => e.type)).toEqual(["text", "turn"]);
    expect(gemini.requests).toHaveLength(0);
  });

  it("auto without a Claude key: Gemini's 429 is the answer", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    gemini.script.push({ error: httpError(429) });
    await expect(run([{ role: "user", text: "hello" }])).rejects.toMatchObject({ status: 429 });
  });
});
