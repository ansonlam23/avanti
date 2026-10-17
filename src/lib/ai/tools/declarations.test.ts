import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOL_NAMES, type ToolName } from "@/lib/ai/shopper-types";
import { CLAUDE_TOOLS, parseToolArgs, TOOL_ARGS, TOOL_DECLARATIONS, toClaudeTools } from "./declarations";

describe("tool declarations", () => {
  it("declares exactly the five read-only tools (no way to place an order)", () => {
    expect(TOOL_DECLARATIONS.map((d) => d.name)).toEqual([...TOOL_NAMES]);
    expect(TOOL_DECLARATIONS.map((d) => d.name)).not.toContain("place_order");
    for (const d of TOOL_DECLARATIONS) expect(d.parametersJsonSchema).toMatchObject({ type: "object" });
  });
});

/** One valid set of args per tool, and the same set missing a required field. */
const SAMPLES: Record<ToolName, { ok: Record<string, unknown>; missing: Record<string, unknown> }> = {
  search_shops: { ok: { query: "cake", needed_by: "18:00" }, missing: { needed_by: "18:00" } },
  get_menu: { ok: { shop_slug: "mais-bakery" }, missing: {} },
  ask_shop: { ok: { shop_slug: "mais-bakery", question: "nuts?" }, missing: { shop_slug: "mais-bakery" } },
  propose_order: {
    ok: { shop_slug: "mais-bakery", item_id: "i1", qty: 1, pickup_time: "asap" },
    missing: { shop_slug: "mais-bakery", item_id: "i1", qty: 1 },
  },
  check_order: { ok: { order_id: "o1" }, missing: {} },
};

describe("Claude tools (generated from the same declarations)", () => {
  it("converts every tool: same name, description and schema", () => {
    expect(CLAUDE_TOOLS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    CLAUDE_TOOLS.forEach((tool, i) => {
      const decl = TOOL_DECLARATIONS[i];
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(tool.description).toBe(decl.description);
      expect(tool.input_schema).toEqual(decl.parametersJsonSchema);
    });
  });

  it("produces valid JSON Schema objects that accept and reject the same args as the server", () => {
    for (const tool of CLAUDE_TOOLS) {
      const name = tool.name as ToolName;
      const schema = tool.input_schema as z.core.JSONSchema.JSONSchema;
      expect(schema).toMatchObject({ type: "object", properties: expect.any(Object), required: expect.any(Array) });
      for (const key of tool.input_schema.required ?? []) expect(Object.keys(schema.properties ?? {})).toContain(key);
      const asZod = z.fromJSONSchema(schema);
      expect(asZod.safeParse(SAMPLES[name].ok).success).toBe(true);
      expect(asZod.safeParse(SAMPLES[name].missing).success).toBe(false);
      expect(TOOL_ARGS[name].safeParse(SAMPLES[name].ok).success).toBe(true);
    }
  });

  it("puts the prompt-cache breakpoint on the last tool only", () => {
    expect(CLAUDE_TOOLS.map((t) => t.cache_control ?? null)).toEqual([null, null, null, null, { type: "ephemeral" }]);
    expect(toClaudeTools(TOOL_DECLARATIONS).some((t) => "cache_control" in t)).toBe(false);
  });

  it("refuses a declaration without an object schema", () => {
    expect(() => toClaudeTools([{ name: "broken", description: "x" }])).toThrow(/broken/);
    expect(() => toClaudeTools([{ name: "broken", parametersJsonSchema: { type: "string" } }])).toThrow(/broken/);
  });
});

describe("parseToolArgs (sanitizing what the model sends)", () => {
  it("normalizes slugs and rejects bad ones", () => {
    expect(parseToolArgs("get_menu", { shop_slug: " Mais-Bakery " })).toEqual({ ok: true, args: { shop_slug: "mais-bakery" } });
    expect(parseToolArgs("get_menu", { shop_slug: "../../etc" }).ok).toBe(false);
    expect(parseToolArgs("get_menu", {}).ok).toBe(false);
  });

  it("coerces qty, defaults it to 1, and bounds it", () => {
    const base = { shop_slug: "mais-bakery", item_id: "x", pickup_time: "17:30" };
    expect(parseToolArgs("propose_order", { ...base, qty: "2" })).toMatchObject({ ok: true, args: { qty: 2 } });
    expect(parseToolArgs("propose_order", base)).toMatchObject({ ok: true, args: { qty: 1 } });
    expect(parseToolArgs("propose_order", { ...base, qty: 500 }).ok).toBe(false);
  });

  it("treats empty optional fields as null and trims text", () => {
    expect(parseToolArgs("search_shops", { query: "  cake ", needed_by: "" })).toEqual({
      ok: true,
      args: { query: "cake", needed_by: null },
    });
    expect(parseToolArgs("search_shops", { query: "" }).ok).toBe(false);
    expect(parseToolArgs("ask_shop", { shop_slug: "a", question: "x".repeat(301) }).ok).toBe(false);
  });
});
