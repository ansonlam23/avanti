import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSearchableShops } from "@/lib/ai/tools/catalog";
import type { ShopWithItems } from "@/lib/ai/tools/views";
import { listedIn, mcpStreet, NOW } from "./fixtures";
import { createAvantiMcpServer, MCP_TOOL_NAMES, type AvantiMcpOptions } from "./server";

// The real shopper tools (runTool → search/menu/ask/propose) on fixture data:
// only the two DB loaders are replaced. No network, and the database client
// throws if anything tries to reach it (so nothing can place or write).
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

let street: ReturnType<typeof mcpStreet>;

beforeEach(() => {
  street = mcpStreet();
  db.shops = street.all;
  vi.mocked(loadSearchableShops).mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {}); // one [mcp] line per tool call
});

async function connect(over: Partial<AvantiMcpOptions> = {}) {
  const server = createAvantiMcpServer({
    origin: "https://avanti.test",
    paymentMode: "sandbox",
    now: () => NOW, // Fri Oct 16 2026, 3:12 PM in Seattle
    isListedShop: listedIn(db.shops),
    ...over,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "vitest", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text: string }>;
  return { line: content[0].text, json: JSON.parse(content[1]?.text ?? "null"), isError: res.isError === true };
}

describe("avanti MCP server", () => {
  it("introduces itself with short instructions", async () => {
    const client = await connect();
    expect(client.getServerVersion()?.name).toBe("avanti");
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toMatch(/UW|University of Washington/);
    expect(instructions).toMatch(/never places or pays/);
    expect(instructions).toMatch(/Visa hold that is charged only at pickup/);
    expect(instructions).toMatch(/demo/);
  });

  it("lists exactly the four tools, read-only, with clear input schemas", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...MCP_TOOL_NAMES]);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.search_shops.inputSchema.required).toEqual(["query"]);
    expect(byName.get_menu.inputSchema.required).toEqual(["shop_slug"]);
    expect(byName.ask_shop.inputSchema.required).toEqual(["shop_slug", "question"]);
    expect(byName.start_order.inputSchema.required).toEqual(["shop_slug", "item_id", "qty"]);
    expect(byName.start_order.inputSchema.properties).toHaveProperty("pickup_time");
    expect(byName.start_order.description).toMatch(/does NOT place or pay/);
    for (const t of tools) {
      expect(t.description?.length).toBeGreaterThan(40);
      expect(t.annotations).toMatchObject({ readOnlyHint: true });
    }
  });
});

describe("search_shops", () => {
  it("finds Mai's for a nut-free birthday cake, public shops only", async () => {
    const client = await connect();
    const r = await call(client, "search_shops", { query: "birthday cake no nuts" });
    expect(r.isError).toBe(false);
    const slugs = r.json.shops.map((s: { slug: string }) => s.slug);
    expect(slugs).toContain("mais-bakery");
    expect(slugs).not.toContain("secret-cakes"); // a visitor's private sandbox
    expect(vi.mocked(loadSearchableShops)).toHaveBeenCalledWith([]); // no "my shops" for strangers
    const mai = r.json.shops.find((s: { slug: string }) => s.slug === "mais-bakery");
    expect(mai.matches[0]).toMatchObject({ name: "Chocolate cake", price_cents: 1800, tags: ["nut-free", "contains-dairy"] });
    expect(r.line).toMatch(/^2 open shops for "birthday cake no nuts" near the UW campus: /);
    expect(r.line).toContain("Mai's Bakery, 10 min walk: Chocolate cake at $18 (3 left)");
    expect(r.line).toContain("Ave Bakery (demo)");
  });

  it("says honestly when nothing matches", async () => {
    const client = await connect();
    const r = await call(client, "search_shops", { query: "bicycle repair" });
    expect(r.isError).toBe(false);
    expect(r.json.shops).toEqual([]);
    expect(r.line).toMatch(/^No open shop lists anything matching "bicycle repair"\. Open now: /);
  });
});

describe("get_menu", () => {
  it("returns the live menu with prices from the database", async () => {
    const client = await connect();
    const r = await call(client, "get_menu", { shop_slug: "mais-bakery" });
    expect(r.isError).toBe(false);
    expect(r.json.items.map((i: { name: string; price_cents: number | null }) => [i.name, i.price_cents])).toEqual([
      ["Chocolate cake", 1800],
      ["Croissant", 450],
      ["Round loaf", null],
    ]);
    expect(r.line).toBe(
      "Mai's Bakery, 10 min walk, pickup 8 AM–6 PM: Chocolate cake at $18 (3 left); Croissant at $4.50 (12 left); Round loaf (needs a price).",
    );
  });

  it("refuses private sandboxes and unknown shops", async () => {
    const client = await connect();
    for (const slug of ["secret-cakes", "no-such-shop"]) {
      const r = await call(client, "get_menu", { shop_slug: slug });
      expect(r.isError).toBe(true);
      expect(r.line).toBe(`No public shop called "${slug}". Use a slug from search_shops.`);
      expect(r.json).toMatchObject({ ok: false, error: "not_found" });
    }
  });

  it("answers 'unavailable' (not a crash) when the directory check fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = await connect({ isListedShop: async () => Promise.reject(new Error("db down")) });
    const r = await call(client, "get_menu", { shop_slug: "mais-bakery" });
    expect(r).toMatchObject({ isError: true, json: { ok: false, error: "unavailable" } });
  });
});

describe("ask_shop", () => {
  it("answers from the shop's own words only", async () => {
    const client = await connect();
    const r = await call(client, "ask_shop", { shop_slug: "mais-bakery", question: "Does the chocolate cake have nuts?" });
    expect(r.isError).toBe(false);
    expect(r.line).toBe(
      `Mai's Bakery's own words on nuts: shop notes: "No nuts in anything."; Chocolate cake: tag: nut-free. Answer only from these words; never guess allergens.`,
    );
    expect(r.json.answer_rule).toMatch(/Never guess/);
  });

  it("says the shop didn't say when its words don't cover the question", async () => {
    const client = await connect();
    const r = await call(client, "ask_shop", { shop_slug: "mais-bakery", question: "Is the croissant gluten free?" });
    expect(r.line).toBe(`Mai's Bakery didn't say anything about gluten. Tell the person "Mai's Bakery didn't say" instead of guessing.`);
  });
});

describe("start_order", () => {
  it("validates, prices from the DB and returns an order link, without ordering anything", async () => {
    const client = await connect();
    const cake = street.mai.items[0];
    const r = await call(client, "start_order", { shop_slug: "mais-bakery", item_id: cake.id, qty: 2, pickup_time: "17:30" });
    expect(r.isError).toBe(false);
    const link =
      "https://avanti.test/ask?q=Order+2+%C3%97+Chocolate+cake+from+Mai%27s+Bakery%2C+pickup+today+at+5%3A30+PM";
    expect(r.json).toMatchObject({
      ok: true,
      status: "not_placed",
      order_link: link,
      payments: "sandbox",
      summary: "2 × Chocolate cake from Mai's Bakery, $36.00 ($18.00 each), pickup today at 5:30 PM",
      proposal: { shop_slug: "mais-bakery", item_id: cake.id, qty: 2, unit_price_cents: 1800, amount_cents: 3600, pickup_time: "2026-10-17T00:30:00.000Z" },
    });
    expect(new URL(r.json.order_link).searchParams.get("q")).toBe("Order 2 × Chocolate cake from Mai's Bakery, pickup today at 5:30 PM");
    expect(r.line).toBe(
      `Not ordered yet: 2 × Chocolate cake from Mai's Bakery, $36.00 ($18.00 each), pickup today at 5:30 PM. To order, open ${link} and confirm in avanti: a signed, verified order places a Visa hold, charged only at pickup (Visa sandbox, test card: no real money moves).`,
    );
  });

  it("leaves the pickup open in the link when no time was asked for", async () => {
    const client = await connect({ paymentMode: "simulated" });
    const r = await call(client, "start_order", { shop_slug: "ave-bakery", item_id: street.ave.items[0].id, qty: 1 });
    expect(new URL(r.json.order_link).searchParams.get("q")).toBe(
      "Order 1 × Chocolate birthday cake from Ave Bakery, pickup as soon as possible",
    );
    expect(r.json.summary).toBe("1 × Chocolate birthday cake from Ave Bakery (demo), $22.00, pickup as soon as possible (earliest today at 3:25 PM)");
    expect(r.line).toMatch(/payments are simulated: no real money moves/);
  });

  it("returns the shop's own refusal: over the owner's AI limit", async () => {
    street.mai.rules = { ...street.mai.rules, ai_max_order_cents: 2000 };
    const client = await connect();
    const r = await call(client, "start_order", { shop_slug: "mais-bakery", item_id: street.mai.items[0].id, qty: 2 });
    expect(r.isError).toBe(true);
    expect(r.line).toBe("Mai's Bakery takes AI orders up to $20.00. This one is $36.00.");
    expect(r.json).toMatchObject({ ok: false, error: "over_ai_limit" });
    expect(r.json).not.toHaveProperty("order_link");
  });

  it("returns the shop's own refusal: sold in person only", async () => {
    const cake = street.mai.items[0];
    street.mai.rules = { ...street.mai.rules, ai_blocked_items: [cake.id] };
    const client = await connect();
    const r = await call(client, "start_order", { shop_slug: "mais-bakery", item_id: cake.id, qty: 1 });
    expect(r).toMatchObject({ isError: true, json: { ok: false, error: "not_for_ai" } });
    expect(r.line).toBe("Mai's Bakery doesn't take AI orders for Chocolate cake. Order it in person at the shop.");
  });

  it("returns the shop's own refusal: sold out", async () => {
    const croissant = street.mai.items[1];
    croissant.sold_out = true;
    const client = await connect();
    const r = await call(client, "start_order", { shop_slug: "mais-bakery", item_id: croissant.id, qty: 1 });
    expect(r).toMatchObject({ isError: true, line: "Croissant is sold out at Mai's Bakery.", json: { error: "sold_out" } });
  });

  it("keeps to the shop's rules and window, and to public shops", async () => {
    const client = await connect();
    const cake = street.mai.items[0];
    const late = await call(client, "start_order", { shop_slug: "mais-bakery", item_id: cake.id, qty: 1, pickup_time: "19:00" });
    expect(late).toMatchObject({ isError: true, json: { error: "outside_window" } });
    const many = await call(client, "start_order", { shop_slug: "mais-bakery", item_id: cake.id, qty: 3 });
    expect(many).toMatchObject({ isError: true, line: "Mai's Bakery allows at most 2 per order." });
    const secret = await call(client, "start_order", { shop_slug: "secret-cakes", item_id: street.secret.items[0].id, qty: 1 });
    expect(secret).toMatchObject({ isError: true, json: { error: "not_found" } });
  });

  it("rejects bad input before touching the menu", async () => {
    const client = await connect();
    const res = await client.callTool({ name: "start_order", arguments: { shop_slug: "mais-bakery", item_id: "x", qty: 0 } });
    expect(res.isError).toBe(true);
    expect((res.content as Array<{ text: string }>)[0].text).toMatch(/qty/);
  });
});
