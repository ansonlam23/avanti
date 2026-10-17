import { describe, expect, it } from "vitest";
import { parseSse } from "./sse";
import { possessive, statusFor } from "./status";

describe("parseSse", () => {
  it("parses complete events and keeps the partial tail", () => {
    const { events, rest } = parseSse('data: {"type":"text","delta":"Hi"}\n\ndata: {"type":"done"}\n\ndata: {"type":"te');
    expect(events).toEqual([{ type: "text", delta: "Hi" }, { type: "done" }]);
    expect(rest).toBe('data: {"type":"te');
  });

  it("reassembles events split across chunks", () => {
    let buffer = "";
    const out: unknown[] = [];
    for (const chunk of ['data: {"type":"te', 'xt","delta":"A"}\n', "\n", 'data: {"type":"done"}\n\n']) {
      const r = parseSse(buffer + chunk);
      out.push(...r.events);
      buffer = r.rest;
    }
    expect(out).toEqual([{ type: "text", delta: "A" }, { type: "done" }]);
    expect(buffer).toBe("");
  });

  it("tolerates CRLF, comments and junk", () => {
    const { events } = parseSse(': ping\r\n\r\ndata: not json\r\n\r\ndata: {"type":"done"}\r\n\r\n');
    expect(events).toEqual([{ type: "done" }]);
  });
});

describe("status sentences", () => {
  const names = { "mais-bakery": "Mai's Bakery", "pho-corner": "Pho Corner" };
  it("says what the AI is doing, in shop-counter words", () => {
    expect(statusFor("search_shops", {}, names)).toBe("Looking at shops near campus…");
    expect(statusFor("get_menu", { shop_slug: "mais-bakery" }, names)).toBe("Reading Mai's Bakery's menu…");
    expect(statusFor("ask_shop", { shop_slug: "pho-corner" }, names)).toBe("Checking what Pho Corner says…");
    expect(statusFor("ask_shop", { shop_slug: "unknown" }, names)).toBe("Checking what the shop says…");
    expect(statusFor("propose_order", {}, names)).toBe("Writing up your order…");
    expect(statusFor("check_order", {}, names)).toBe("Checking your order…");
  });

  it("makes possessives", () => {
    expect(possessive("Mai's Bakery")).toBe("Mai's Bakery's");
    expect(possessive("Sweets")).toBe("Sweets'");
  });
});
