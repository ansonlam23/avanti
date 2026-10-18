import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiQueryInsert } from "./types";

// next/server's after() and the database are fakes: nothing here reaches Supabase.
const h = vi.hoisted(() => ({
  after: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
}));
vi.mock("next/server", () => ({ after: h.after }));
vi.mock("@/lib/db/server", () => ({ getDb: () => ({ from: h.from }) }));

import { insertSearch, logSearch } from "./log";

const nearby = (slug: string) => ({ slug, name: slug, is_demo: true, walk_minutes: 10 });
const NOTHING_MATCHED = { shops: [], other_open_shops: [nearby("petal-cart"), nearby("mais-bakery")] };

beforeEach(() => {
  h.after.mockReset();
  h.insert.mockReset().mockResolvedValue({ error: null });
  h.from.mockReset().mockReturnValue({ insert: h.insert });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logSearch", () => {
  it("schedules one insert for after the response, and doesn't touch the database before", async () => {
    logSearch("mcp", { query: "oat milk latte", needed_by: null }, NOTHING_MATCHED);
    expect(h.after).toHaveBeenCalledTimes(1);
    expect(h.from).not.toHaveBeenCalled();

    await h.after.mock.calls[0][0](); // the response is done: Next runs the task
    expect(h.from).toHaveBeenCalledWith("ai_queries");
    expect(h.insert).toHaveBeenCalledWith({
      source: "mcp",
      query: "oat milk latte",
      needed_by: null,
      shop_slugs: ["petal-cart", "mais-bakery"],
      matched_slugs: [],
    } satisfies AiQueryInsert);
  });

  it("outside a Next request (tests, scripts) logs nothing and never throws", () => {
    h.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope.");
    });
    expect(() => logSearch("chat", { query: "bagels" }, NOTHING_MATCHED)).not.toThrow();
    expect(h.from).not.toHaveBeenCalled();
  });

  it("logs nothing for an empty query", () => {
    logSearch("chat", { query: "   " }, NOTHING_MATCHED);
    expect(h.after).not.toHaveBeenCalled();
  });

  it("never throws on a result it can't read", () => {
    expect(() => logSearch("chat", { query: "bagels" }, null as never)).not.toThrow();
    expect(h.after).not.toHaveBeenCalled();
  });
});

describe("insertSearch", () => {
  const row: AiQueryInsert = { source: "chat", query: "bagels", needed_by: null, shop_slugs: ["mais-bakery"], matched_slugs: [] };

  it("a database error only prints a line", async () => {
    h.insert.mockResolvedValue({ error: { message: 'relation "ai_queries" does not exist' } });
    await expect(insertSearch(row)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[insights] couldn't log a search:", 'relation "ai_queries" does not exist');
  });

  it("an unreachable database only prints a line", async () => {
    h.from.mockImplementation(() => {
      throw new Error("Supabase is not configured");
    });
    await expect(insertSearch(row)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[insights] couldn't log a search:", "Supabase is not configured");
  });
});
