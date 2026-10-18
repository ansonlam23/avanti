import { describe, expect, it } from "vitest";
import {
  alreadyLine,
  askLine,
  doneLine,
  exampleItem,
  findAmount,
  isAlready,
  menuNoun,
  missLine,
  parseBest,
  parseCommand,
  words,
  type ParseResult,
  type VoiceItem,
} from "./voice-commands";

const item = (id: string, name: string, extra: Partial<VoiceItem> = {}): VoiceItem => ({ id, name, stock: 5, sold_out: false, ...extra });

// A bakery with one of each.
const BAKERY = [
  item("croissant", "Croissant"),
  item("lemon", "Lemon bar"),
  item("brownie", "Brownie"),
  item("bday", "Chocolate birthday cake"),
  item("loaf", "Round loaf"),
  item("sour", "Sourdough"),
  item("muffin", "Blueberry muffin"),
  item("bagel", "Everything bagel"),
  item("plain", "Plain bagel"),
  item("soup", "Soup of the day"),
];
// Near twins, for ties.
const TWINS = [
  item("almond", "Almond croissant"),
  item("butter", "Butter croissant"),
  item("choc", "Chocolate cake"),
  item("bday", "Chocolate birthday cake"),
];
// An owner who writes the menu in Vietnamese (with English names).
const CORNER = [
  item("banhmi", "Bánh mì thịt", { name_en: "Pork banh mi" }),
  item("caphe", "Cà phê sữa đá", { name_en: "Iced milk coffee" }),
];

/** The command as a short string, so cases read like a table. */
function said(text: string, items: readonly VoiceItem[] = BAKERY): string {
  return show(parseCommand(text, items));
}
function show(r: ParseResult): string {
  if (!r.ok) {
    if (r.reason === "ambiguous") return `ask ${r.intent.kind}: ${r.candidates.map((c) => c.id).join(" | ")}`;
    if (r.reason === "no_item") return `no_item ${r.intent.kind}`;
    if (r.reason === "bad_amount") return `bad_amount ${r.cents}`;
    return r.reason;
  }
  const c = r.command;
  switch (c.kind) {
    case "sold_out":
      return `${c.sold_out ? "sold out" : "back"}: ${c.item.id}`;
    case "ai_orderable":
      return `ai ${c.ai_orderable ? "on" : "off"}: ${c.item.id}`;
    case "ai_limit":
      return `cap: ${c.cents ?? "none"}`;
    case "accept_ai":
      return c.accept ? "accept ai" : "pause ai";
  }
}

describe("sold out", () => {
  it.each([
    ["we're out of croissants", "croissant"],
    ["We’re out of croissants.", "croissant"],
    ["sold out of the lemon bars", "lemon"],
    ["no more brownies", "brownie"],
    ["we ran out of sourdough", "sour"],
    ["the brownies are all gone", "brownie"],
    ["Croissants: sold out", "croissant"],
    ["mark the lemon bars as sold out", "lemon"],
    ["um, okay so, we're, uh, all out of the brownies please", "brownie"],
    ["86 the sourdough", "sour"],
    ["eighty six the croissants", "croissant"],
    ["we don't have any more brownies", "brownie"],
    ["the blueberry muffins are not available", "muffin"],
    ["no more round loaves", "loaf"],
    ["take the brownies off the menu", "brownie"],
  ])("%s", (text, id) => {
    expect(said(text)).toBe(`sold out: ${id}`);
  });
});

describe("back in stock", () => {
  it.each([
    ["croissants are back", "croissant"],
    ["back in stock: brownies", "brownie"],
    ["we have more lemon bars", "lemon"],
    ["restock the sourdough", "sour"],
    ["croissants aren't sold out anymore", "croissant"],
    ["the brownies are available again", "brownie"],
    ["fresh croissants just came out of the oven", "croissant"],
    ["we made more blueberry muffins", "muffin"],
  ])("%s", (text, id) => {
    expect(said(text)).toBe(`back: ${id}`);
  });
});

describe("small typos, plurals and word runs", () => {
  it.each([
    ["were out of crossants", "sold out: croissant"],
    ["sold out of lemmon bars", "sold out: lemon"],
    ["out of croissnats", "sold out: croissant"],
    ["no more blueberry muffin", "sold out: muffin"],
    ["out of everything bagels", "sold out: bagel"],
    ["we're out of soup of the day", "sold out: soup"],
    ["out of crois", "sold out: croissant"],
  ])("%s", (text, expected) => {
    expect(said(text)).toBe(expected);
  });

  it("matches a name said apart that the menu runs together", () => {
    const menu = [item("cheese", "Cheesecake"), item("carrot", "Carrot cake")];
    expect(said("we're out of cheese cake", menu)).toBe("sold out: cheese");
    expect(said("no more carrot cake", menu)).toBe("sold out: carrot");
  });

  it("matches a menu written in another language by its English name, accents or not", () => {
    expect(said("we're out of the pork banh mi", CORNER)).toBe("sold out: banhmi");
    expect(said("out of bánh mì", CORNER)).toBe("sold out: banhmi");
    expect(said("iced milk coffee is back", CORNER)).toBe("back: caphe");
  });
});

describe("AI rules", () => {
  it.each([
    ["AI orders up to forty dollars", "cap: 4000"],
    ["AI orders up to $40", "cap: 4000"],
    ["A.I. orders up to 25 bucks", "cap: 2500"],
    ["set the AI limit to twelve fifty", "cap: 1250"],
    ["cap AI orders at one hundred and twenty five dollars", "cap: 12500"],
    ["raise the AI limit to a hundred", "cap: 10000"],
    ["let AI order anything up to 30 dollars", "cap: 3000"],
    ["no cap on AI orders", "cap: none"],
    ["remove the AI limit", "cap: none"],
    ["AI orders can be any amount", "cap: none"],
    ["AI can't order the birthday cake", "ai off: bday"],
    ["AI cannot order the birthday cake", "ai off: bday"],
    ["don't let AI order the croissants", "ai off: croissant"],
    ["the birthday cake is in-person only", "ai off: bday"],
    ["let AI order the cake again", "ai on: bday"],
    ["AI can order croissants again", "ai on: croissant"],
    ["pause AI orders", "pause ai"],
    ["stop taking AI orders for now", "pause ai"],
    ["no more AI orders", "pause ai"],
    ["start taking AI orders", "accept ai"],
    ["resume AI orders", "accept ai"],
    ["AI orders are no longer paused", "accept ai"],
  ])("%s", (text, expected) => {
    expect(said(text)).toBe(expected);
  });

  it("refuses caps outside $1–$1,000", () => {
    expect(said("AI orders up to five thousand dollars")).toBe("bad_amount 500000");
    expect(said("AI orders up to fifty cents")).toBe("bad_amount 50");
  });

  it("doesn't read a count of things as dollars", () => {
    expect(said("AI orders up to 2 items")).toBe("unknown");
    expect(said("AI can't order the box of 6", [item("box", "Box of 6"), item("cake", "Cake")])).toBe("ai off: box");
  });

  it("still reads an item whose name has an AI word in it", () => {
    expect(said("we're out of robot cookies", [item("robot", "Robot cookie")])).toBe("sold out: robot");
  });

  it("names the per-item rule when the item isn't on the menu", () => {
    expect(said("AI can't order the tiramisu")).toBe("no_item ai_orderable");
  });
});

describe("ties ask which one", () => {
  it.each([
    ["we're out of croissants", "ask sold_out: almond | butter"],
    ["the cake is sold out", "ask sold_out: choc | bday"],
    ["AI can't order the croissants", "ask ai_orderable: almond | butter"],
  ])("%s", (text, expected) => {
    expect(said(text, TWINS)).toBe(expected);
  });

  it("but a clear winner wins", () => {
    expect(said("out of the almond croissants", TWINS)).toBe("sold out: almond");
    expect(said("chocolate cake is sold out", TWINS)).toBe("sold out: choc"); // the whole name beats a longer one
    expect(said("AI can't order the birthday cake", TWINS)).toBe("ai off: bday");
    expect(said("we're out of croissants", [item("plain", "Croissant"), item("almond", "Almond croissant")])).toBe("sold out: plain");
  });

  it("an answer to the question picks one", () => {
    const first = parseCommand("we're out of croissants", TWINS);
    if (first.ok || first.reason !== "ambiguous") throw new Error("expected a question");
    const pending = { intent: first.intent, candidates: first.candidates.map((c) => c.id) };
    expect(show(parseCommand("the almond one", TWINS, { pending }))).toBe("sold out: almond");
    expect(show(parseCommand("no, butter", TWINS, { pending }))).toBe("sold out: butter");
    expect(show(parseCommand("the second one", TWINS, { pending }))).toBe("sold out: butter");
    // a new command of its own still works
    expect(show(parseCommand("pause AI orders", TWINS, { pending }))).toBe("pause ai");
    expect(show(parseCommand("never mind", TWINS, { pending }))).toBe("cancel");
  });
});

describe("misses", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["what's the weather like", "unknown"],
    ["croissants", "unknown"],
    ["we're running low on croissants", "unknown"],
    ["croissants back tomorrow", "unknown"],
    ["we're out of bagels", "ask sold_out: bagel | plain"],
    ["we're out of tiramisu", "no_item sold_out"],
    ["we're sold out", "no_item sold_out"],
    ["pause AI orders for the day", "pause ai"], // "Soup of the day" isn't named by "day" alone
  ])("%j", (text, expected) => {
    expect(said(text)).toBe(expected);
  });
});

describe("speech alternatives", () => {
  it("takes the guess that makes a command", () => {
    expect(show(parseBest(["where out of Chris aunts", "we're out of croissants"], BAKERY))).toBe("sold out: croissant");
    expect(show(parseBest(["hey I orders up to forty", "AI orders up to forty"], BAKERY))).toBe("cap: 4000");
    expect(show(parseBest([], BAKERY))).toBe("empty");
  });
});

describe("words and amounts", () => {
  it("normalizes what speech engines and keyboards produce", () => {
    expect(words("We’re OUT of Mai's crème brûlée!")).toEqual(["we", "are", "out", "of", "mais", "creme", "brulee"]);
    expect(words("A.I. can't order it")).toEqual(["ai", "can", "not", "order", "it"]);
    expect(words("a i orders up to $1,000")).toEqual(["ai", "orders", "up", "to", "1000", "dollars"]);
  });

  it.each([
    ["forty dollars", 4000],
    ["$12.50", 1250],
    ["twelve fifty", 1250],
    ["twelve dollars and fifty cents", 1250],
    ["forty-five bucks", 4500],
    ["fifteen hundred", 150000],
    ["a hundred and five", 10500],
  ])("%s", (text, cents) => {
    expect(findAmount(words(text))?.cents).toBe(cents);
  });
});

describe("replies", () => {
  const almond = item("almond", "Almond croissant");
  it("says what changed, in plain words", () => {
    expect(doneLine({ kind: "sold_out", item: almond, sold_out: true })).toBe("Done. Almond croissants are sold out.");
    expect(doneLine({ kind: "sold_out", item: item("l", "Round loaf"), sold_out: false })).toBe("Done. Round loaves are back in stock.");
    expect(doneLine({ kind: "sold_out", item: item("b", "Lemon bars"), sold_out: true })).toBe("Done. Lemon bars are sold out.");
    expect(doneLine({ kind: "sold_out", item: item("c", "Coffee"), sold_out: true })).toBe("Done. Coffee is sold out.");
    expect(doneLine({ kind: "sold_out", item: item("x", "Box of 6 donuts"), sold_out: true })).toBe("Done. Box of 6 donuts is sold out.");
    expect(doneLine({ kind: "sold_out", item: CORNER[0], sold_out: true })).toBe("Done. Bánh mì thịt: sold out.");
    expect(doneLine({ kind: "ai_orderable", item: TWINS[3], ai_orderable: false })).toBe("Done. Chocolate birthday cake is in-person only.");
    expect(doneLine({ kind: "ai_orderable", item: TWINS[3], ai_orderable: true })).toBe("Done. AI can order Chocolate birthday cake again.");
    expect(doneLine({ kind: "ai_limit", cents: 4000 })).toBe("Done. AI orders up to $40.");
    expect(doneLine({ kind: "ai_limit", cents: 1250 })).toBe("Done. AI orders up to $12.50.");
    expect(doneLine({ kind: "ai_limit", cents: null })).toBe("Done. No cap on AI orders.");
    expect(doneLine({ kind: "accept_ai", accept: false })).toBe("Done. AI orders are paused.");
    expect(doneLine({ kind: "accept_ai", accept: true })).toBe("Done. Taking AI orders again.");
  });

  it("pluralizes only plain English names", () => {
    expect(menuNoun(item("p", "Pastry")).text).toBe("Pastries");
    expect(menuNoun(item("s", "Sandwich")).text).toBe("Sandwiches");
    expect(menuNoun(item("h", "Hummus")).text).toBe("Hummus");
    expect(menuNoun(CORNER[1])).toMatchObject({ text: "Cà phê sữa đá", english: false });
  });

  it("knows when there's nothing to change", () => {
    const items = [item("almond", "Almond croissant", { sold_out: true }), item("bday", "Chocolate birthday cake", { stock: 0 })];
    const rules = { max_per_order: 2, accept_ai_orders: true, ai_max_order_cents: 4000, ai_blocked_items: ["bday"] };
    const state = { items, rules };
    expect(isAlready({ kind: "sold_out", item: items[0], sold_out: true }, state)).toBe(true);
    expect(isAlready({ kind: "sold_out", item: items[0], sold_out: false }, state)).toBe(false);
    expect(isAlready({ kind: "sold_out", item: items[1], sold_out: false }, state)).toBe(false); // none left: restock it
    expect(isAlready({ kind: "ai_orderable", item: items[1], ai_orderable: false }, state)).toBe(true);
    expect(isAlready({ kind: "ai_limit", cents: 4000 }, state)).toBe(true);
    expect(isAlready({ kind: "ai_limit", cents: null }, state)).toBe(false);
    expect(isAlready({ kind: "accept_ai", accept: true }, state)).toBe(true);
    expect(alreadyLine({ kind: "sold_out", item: items[0], sold_out: true })).toBe("Almond croissants are already sold out.");
    expect(alreadyLine({ kind: "ai_limit", cents: 4000 })).toBe("AI orders are already capped at $40.");
    expect(alreadyLine({ kind: "accept_ai", accept: false })).toBe("AI orders are already paused.");
  });

  it("explains a miss with an example from this menu", () => {
    expect(exampleItem(TWINS)).toEqual({ many: "chocolate cakes", one: "chocolate cake" }); // the shortest name
    expect(exampleItem([])).toEqual({ many: "croissants", one: "croissant" });
    expect(missLine(parseCommand("we're out of tiramisu", TWINS), TWINS)).toBe("I didn’t catch an item. Try “we’re out of chocolate cakes”.");
    expect(missLine(parseCommand("AI can't order the tiramisu", TWINS), TWINS)).toBe("I didn’t catch an item. Try “AI can’t order the chocolate cake”.");
    expect(missLine(parseCommand("hello there", TWINS), TWINS)).toBe("I didn’t catch that. Try “we’re out of chocolate cakes”.");
    expect(missLine(parseCommand("", TWINS), TWINS)).toBe("I didn’t hear anything.");
    expect(missLine(parseCommand("AI orders up to 5000 dollars", TWINS), TWINS)).toBe("AI limits go from $1 to $1,000.");
    expect(askLine(TWINS.slice(0, 2))).toBe("Which one: Almond croissant or Butter croissant?");
    expect(askLine(TWINS.slice(0, 3))).toBe("Which one: Almond croissant, Butter croissant or Chocolate cake?");
  });
});
