import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoStreet, NOW } from "@/lib/ai/tools/fixtures";
import type { ShopWithItems } from "@/lib/ai/tools/views";

// The one place searches are logged: runTool's search_shops (both /ask and MCP
// go through it). Real search on fixture shops; the logger is a spy.
const db = vi.hoisted(() => ({ shops: [] as ShopWithItems[] }));

vi.mock("@/lib/ai/tools/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/tools/catalog")>()),
  loadSearchableShops: vi.fn(async () => db.shops),
  loadShop: vi.fn(async (slug: string) => db.shops.find((s) => s.slug === slug) ?? null),
}));
vi.mock("@/lib/db/server", () => ({
  getDb: () => {
    throw new Error("tests never reach the database");
  },
}));
vi.mock("@/lib/insights/log", () => ({ logSearch: vi.fn() }));

import { runTool } from "@/lib/ai/tools";
import { logSearch } from "@/lib/insights/log";

beforeEach(() => {
  db.shops = demoStreet().all;
  vi.mocked(logSearch).mockClear();
});

describe("runTool logs every shop search for the owners' insights", () => {
  it("from the in-app shopper (the default source)", async () => {
    const result = await runTool("search_shops", { query: "chocolate cake", needed_by: "17:30" }, { now: NOW, myShops: [] });
    expect(result.ok).toBe(true);
    expect(logSearch).toHaveBeenCalledTimes(1);
    expect(logSearch).toHaveBeenCalledWith("chat", { query: "chocolate cake", needed_by: "17:30" }, result);
  });

  it("from an outside AI over MCP", async () => {
    const result = await runTool("search_shops", { query: "oat milk latte" }, { now: NOW, myShops: [], source: "mcp" });
    expect(logSearch).toHaveBeenCalledWith("mcp", { query: "oat milk latte", needed_by: null }, result);
  });

  it("not for other tools, bad arguments or unknown tools", async () => {
    await runTool("get_menu", { shop_slug: "mais-bakery" }, { now: NOW, myShops: [] });
    await runTool("search_shops", { query: "" }, { now: NOW, myShops: [] });
    await runTool("find_everything", {}, { now: NOW, myShops: [] });
    expect(logSearch).not.toHaveBeenCalled();
  });
});
