// Tests the tool LOOP (not the model): a scripted stand-in for the Gemini client
// returns function calls / text, and we check what the loop sends back and emits.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatEvent, ChatTurn } from "./shopper-types";

type Part = Record<string, unknown>;
type Request = { contents: Array<{ role: string; parts: Part[] }>; config: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

const script: Part[][][] = []; // per model call: chunks, each a list of parts
const requests: Request[] = [];

vi.mock("@/lib/ai/gemini", () => ({
  geminiModel: () => "test-model",
  getGemini: () => ({
    models: {
      generateContentStream: async (req: Request) => {
        requests.push(structuredClone(req));
        const chunks = script.shift() ?? [];
        return (async function* () {
          for (const parts of chunks) yield { candidates: [{ content: { role: "model", parts } }] };
        })();
      },
    },
  }),
}));

const runTool = vi.fn(async (name: string) => ({ ok: true, tool: name }));
vi.mock("@/lib/ai/tools", () => ({ TOOL_DECLARATIONS: [], runTool: (...a: unknown[]) => runTool(...(a as [string])) }));

const { runShopperTurn, MAX_TOOL_ROUNDS } = await import("./shopper");

async function run(turns: ChatTurn[]) {
  const events: ChatEvent[] = [];
  const stats = await runShopperTurn({ turns, emit: (e) => events.push(e), now: new Date("2026-10-16T22:12:00Z") });
  return { events, stats };
}

beforeEach(() => {
  script.length = 0;
  requests.length = 0;
  runTool.mockClear();
});

describe("runShopperTurn", () => {
  it("runs a tool round, sends the model's own parts back (thought signature intact), then streams text", async () => {
    script.push(
      [[{ functionCall: { id: "c1", name: "search_shops", args: { query: "cake" } }, thoughtSignature: "sig-1" }]],
      [[{ text: "Mai's has " }], [{ text: "one." }]],
    );
    const { events, stats } = await run([{ role: "user", text: "cake?" }]);

    expect(events.map((e) => e.type)).toEqual(["call", "tool", "text", "text", "turn"]);
    expect(runTool).toHaveBeenCalledWith("search_shops", { query: "cake" }, expect.objectContaining({ myShops: [] }));

    const second = requests[1].contents;
    expect(second.at(-2)).toEqual({
      role: "model",
      parts: [{ functionCall: { id: "c1", name: "search_shops", args: { query: "cake" } }, thoughtSignature: "sig-1" }],
    });
    expect(second.at(-1)).toEqual({
      role: "user",
      parts: [{ functionResponse: { id: "c1", name: "search_shops", response: { output: { ok: true, tool: "search_shops" } } } }],
    });

    const turn = (events.at(-1) as Extract<ChatEvent, { type: "turn" }>).turn;
    expect(turn).toEqual({
      role: "model",
      text: "Mai's has one.",
      tool_calls: [{ id: "c1", name: "search_shops", args: { query: "cake" }, step: 0 }],
      tool_results: [{ id: "c1", name: "search_shops", result: { ok: true, tool: "search_shops" }, step: 0 }],
    });
    expect(stats.rounds).toBe(1);
    expect(requests[0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });

  it("runs parallel calls together and answers each", async () => {
    script.push(
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
    expect(requests[1].contents.at(-1)?.parts.map((p) => (p.functionResponse as { name: string }).name)).toEqual([
      "ask_shop",
      "get_menu",
    ]);
    expect(events.filter((e) => e.type === "tool")).toHaveLength(2);
  });

  it("stops calling tools after the round limit and forces a text answer", async () => {
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      script.push([[{ functionCall: { name: "get_menu", args: { shop_slug: "a" } }, thoughtSignature: `s${i}` }]]);
    }
    script.push([[{ text: "Here's what I found." }]]);
    const { stats } = await run([{ role: "user", text: "menu" }]);
    expect(stats.rounds).toBe(MAX_TOOL_ROUNDS);
    expect(requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(requests[0].config.toolConfig.functionCallingConfig.mode).toBe("AUTO");
    expect(requests.at(-1)?.config.toolConfig.functionCallingConfig.mode).toBe("NONE");
  });

  it("prefetches the alternative search for a sold-out event before the first model call", async () => {
    script.push([[{ text: "Heads up: Mai's just sold out." }]]);
    const { events } = await run([
      { role: "user", text: "cake by 6" },
      { role: "model", text: "Mai's has one." },
      {
        role: "user",
        hidden: true,
        text: "[event] Mai's Bakery just marked Chocolate cake sold out.",
        event: { kind: "sold_out", shop_slug: "mais-bakery", item_id: "i1", item_name: "Chocolate cake", query: "cake", needed_by: "18:00" },
      },
    ]);
    expect(runTool).toHaveBeenCalledWith("search_shops", { query: "Chocolate cake", needed_by: "18:00" }, expect.anything());
    const first = requests[0].contents;
    expect(first.at(-2)?.parts[0]).toMatchObject({
      functionCall: { name: "search_shops" },
      thoughtSignature: "context_engineering_is_the_way_to_go",
    });
    expect(first.at(-1)?.parts[0]).toHaveProperty("functionResponse.name", "search_shops");
    expect(events.map((e) => e.type)).toEqual(["call", "tool", "text", "turn"]);
    const turn = (events.at(-1) as Extract<ChatEvent, { type: "turn" }>).turn;
    expect(turn.tool_calls).toEqual([{ name: "search_shops", args: { query: "Chocolate cake", needed_by: "18:00" }, step: 0 }]);
  });

  it("reports honestly when the model says nothing", async () => {
    script.push([[]]);
    const { events } = await run([{ role: "user", text: "hello" }]);
    expect(events.map((e) => e.type)).toEqual(["error", "turn"]);
    expect(events[0]).toMatchObject({ code: "no_reply" });
  });

  it("ignores unknown tool names from the model but still answers the call", async () => {
    script.push([[{ functionCall: { name: "place_order", args: {} }, thoughtSignature: "s" }]], [[{ text: "I can't do that." }]]);
    const { events } = await run([{ role: "user", text: "just buy it" }]);
    expect(events.some((e) => e.type === "tool")).toBe(false);
    expect(requests[1].contents.at(-1)?.parts[0]).toHaveProperty("functionResponse.name", "place_order");
  });
});
