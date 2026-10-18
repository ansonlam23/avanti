import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopWithItems } from "@/lib/ai/tools/views";
import { rateLimit } from "@/lib/ratelimit";
import { mcpStreet } from "./fixtures";
import { handleMcpDelete, handleMcpGet, handleMcpOptions, handleMcpPost } from "./http";

// /api/mcp end to end in-process: real Streamable HTTP transport (stateless,
// JSON answers) + real shopper tools on fixture shops. No network, no DB.
const db = vi.hoisted(() => ({ shops: [] as ShopWithItems[] }));

vi.mock("@/lib/ai/tools/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/tools/catalog")>()),
  loadSearchableShops: vi.fn(async () => db.shops),
  loadShop: vi.fn(async (slug: string) => db.shops.find((s) => s.slug === slug) ?? null),
}));
vi.mock("@/lib/mcp/catalog", () => ({
  isListedShop: async (slug: string) => db.shops.some((s) => s.slug === slug && s.listed === true),
}));
vi.mock("@/lib/ratelimit", () => ({ LIMITS: { mcp: [240, 600] }, rateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/db/server", () => ({
  getDb: () => {
    throw new Error("tests never reach the database");
  },
}));

const URL_ = "http://localhost:3100/api/mcp";
const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

function post(body: unknown, headers: Record<string, string> = {}) {
  return handleMcpPost(new Request(URL_, { method: "POST", headers: { ...MCP_HEADERS, ...headers }, body: JSON.stringify(body) }));
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "vitest", version: "0" } },
};

let street: ReturnType<typeof mcpStreet>;

beforeEach(() => {
  street = mcpStreet();
  db.shops = street.all;
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/mcp", () => {
  it("answers initialize as plain JSON with open CORS and no session", async () => {
    const res = await post(initialize);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("mcp-session-id")).toBeNull(); // stateless
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("avanti");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toMatch(/Visa hold/);
  });

  it("accepts notifications with 202", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { "mcp-protocol-version": "2025-11-25" });
    expect(res.status).toBe(202);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("lists the four tools", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-protocol-version": "2025-11-25" });
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["search_shops", "get_menu", "ask_shop", "start_order"]);
  });

  it("builds order links on the request origin, or on NEXT_PUBLIC_APP_URL when set", async () => {
    const order = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "start_order", arguments: { shop_slug: "mais-bakery", item_id: street.mai.items[0].id, qty: 1 } },
    };
    const link = async () => {
      const body = await (await post(order)).json();
      return JSON.parse(body.result.content[1].text).order_link as string;
    };
    expect(await link()).toMatch(/^http:\/\/localhost:3100\/ask\?q=Order\+1\+%C3%97\+Chocolate\+cake\+from\+Mai%27s\+Bakery%2C\+pickup\+/);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://try-avanti.vercel.app");
    expect(await link()).toMatch(/^https:\/\/try-avanti\.vercel\.app\/ask\?q=Order\+1\+/);
  });

  it("is rate limited per IP with the shared limiter (429, JSON-RPC error, CORS)", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(
      Response.json({ error: { code: "rate_limited", message: "That's a lot of tries in a short time." } }, { status: 429 }),
    );
    const res = await post(initialize);
    expect(vi.mocked(rateLimit)).toHaveBeenCalledWith(expect.any(Request), "mcp", 240, 600);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { message: "That's a lot of tries in a short time.", data: { code: "rate_limited" } },
    });
  });

  it("refuses requests that don't speak Streamable HTTP", async () => {
    const res = await post(initialize, { accept: "application/json" });
    expect(res.status).toBe(406);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("other methods", () => {
  it("OPTIONS: CORS preflight for browser clients (e.g. MCP Inspector)", () => {
    const res = handleMcpOptions(
      new Request(URL_, {
        method: "OPTIONS",
        headers: { origin: "http://localhost:6274", "access-control-request-headers": "content-type, mcp-protocol-version, authorization" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type, mcp-protocol-version, authorization");
  });

  it("GET: no SSE stream (405) for MCP clients, a short description for people", async () => {
    const sse = handleMcpGet(new Request(URL_, { headers: { accept: "text/event-stream" } }));
    expect(sse.status).toBe(405);
    expect(sse.headers.get("allow")).toBe("POST, OPTIONS");
    const page = handleMcpGet(new Request(URL_, { headers: { accept: "text/html" } }));
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({ name: "avanti", mcp: { endpoint: "http://localhost:3100/api/mcp", auth: "none" } });
  });

  it("DELETE: no session to end (405)", async () => {
    const res = handleMcpDelete();
    expect(res.status).toBe(405);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
