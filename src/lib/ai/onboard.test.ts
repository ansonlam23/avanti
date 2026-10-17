import { describe, expect, it } from "vitest";
import { amountsIn, fuzzyContains, normalizeTag, validateDraft } from "@/lib/ai/onboard";

// Fixtures are shaped like real Gemini output for the onboarding schema.
const HEARD =
  "Chocolate cake is eighteen dollars, croissants are four fifty, the vegan muffins are three twenty five, and there are no nuts in anything.";

const noNuts = { tag: "nut-free", source: "spoken", quote: "no nuts in anything" };

function item(over: Record<string, unknown> = {}) {
  return {
    name: "Chocolate cake",
    name_en: "Chocolate cake",
    price_evidence: "eighteen dollars",
    price_source: "spoken",
    price_cents: 1800,
    est_quantity: 2,
    description: "Two-layer chocolate cake",
    tags: [noNuts],
    box_2d: [120, 80, 460, 420],
    ...over,
  };
}

const voice = { hasAudio: true, notes: null };

describe("validateDraft: the happy path (voice note)", () => {
  const draft = validateDraft(
    {
      heard: HEARD,
      shop_name: null,
      language: "en",
      items: [
        item(),
        item({
          name: "Croissant",
          name_en: "Croissant",
          price_evidence: "four fifty",
          price_cents: 450,
          est_quantity: 6,
          description: null,
          box_2d: [500, 60, 700, 300],
        }),
        item({
          name: "Vegan muffin",
          name_en: "Vegan muffin",
          price_evidence: "three twenty five",
          price_cents: 325,
          est_quantity: 4,
          description: null,
          tags: [noNuts, { tag: "vegan", source: "spoken", quote: "the vegan muffins" }],
          box_2d: [520, 600, 760, 900],
        }),
      ],
      unclear: [],
    },
    voice,
  );

  it("keeps every traced price exactly", () => {
    expect(draft.items.map((i) => [i.name, i.price_cents, i.price_source])).toEqual([
      ["Chocolate cake", 1800, "spoken"],
      ["Croissant", 450, "spoken"],
      ["Vegan muffin", 325, "spoken"],
    ]);
  });

  it("keeps quoted allergen tags (blanket statements apply to all items)", () => {
    expect(draft.items[0].tags).toEqual(["nut-free"]);
    expect(draft.items[2].tags).toEqual(["nut-free", "vegan"]);
  });

  it("drops name_en when it repeats the name, keeps quantities, boxes and the transcript", () => {
    expect(draft.items[0].name_en).toBeNull();
    expect(draft.items.map((i) => i.est_quantity)).toEqual([2, 6, 4]);
    expect(draft.items[1].box_2d).toEqual([500, 60, 700, 300]);
    expect(draft.heard).toBe(HEARD);
    expect(draft.language).toBe("en");
    expect(draft.unclear).toEqual([]);
  });
});

describe("validateDraft: never invent a price", () => {
  it("rejects a spoken price the owner never said", () => {
    const d = validateDraft(
      {
        heard: HEARD,
        language: "en",
        items: [item({ name: "Banana bread", price_evidence: null, price_cents: 600, tags: [] })],
        unclear: [],
      },
      voice,
    );
    expect(d.items[0]).toMatchObject({ price_cents: null, price_source: "missing" });
    expect(d.unclear).toEqual(["check the price for Banana bread"]);
  });

  it("rejects a price whose evidence names a different number", () => {
    const d = validateDraft(
      { heard: HEARD, language: "en", items: [item({ price_cents: 1850 })], unclear: [] },
      voice,
    );
    expect(d.items[0].price_cents).toBeNull();
  });

  it("nulls a price marked missing, and notes it for the owner", () => {
    const d = validateDraft(
      {
        heard: HEARD,
        language: "en",
        items: [item({ name: "Round loaf", price_source: "missing", price_cents: 700, price_evidence: null, tags: [] })],
        unclear: [],
      },
      voice,
    );
    expect(d.items[0]).toMatchObject({ price_cents: null, price_source: "missing" });
    expect(d.unclear).toEqual(["price for Round loaf"]);
  });

  it("doesn't duplicate the model's own note about a missing price", () => {
    const d = validateDraft(
      {
        heard: HEARD,
        language: "en",
        items: [item({ name: "Round loaf", price_source: "missing", price_cents: null, price_evidence: null, tags: [] })],
        unclear: ["price for the round loaf"],
      },
      voice,
    );
    expect(d.unclear).toEqual(["price for the round loaf"]);
  });

  it("rejects 'spoken' prices when the owner said and typed nothing", () => {
    const d = validateDraft(
      { heard: null, language: "en", items: [item({ tags: [] })], unclear: [] },
      { hasAudio: false, notes: null },
    );
    expect(d.items[0].price_cents).toBeNull();
    expect(d.heard).toBeNull();
  });

  it("checks typed notes too", () => {
    const d = validateDraft(
      {
        heard: "should be ignored without audio",
        language: "en",
        items: [
          item({ price_evidence: "18", tags: [] }),
          item({ name: "Croissant", price_evidence: "4.50", price_cents: 450, tags: [] }),
          item({ name: "Cookie", price_evidence: null, price_cents: 300, tags: [] }),
        ],
        unclear: [],
      },
      { hasAudio: false, notes: "Chocolate cake 18, croissants 4.50" },
    );
    expect(d.items.map((i) => i.price_cents)).toEqual([1800, 450, null]);
    expect(d.heard).toBeNull();
  });

  it("fixes the dollars-for-cents slip only when the evidence proves it", () => {
    const d = validateDraft(
      {
        heard: null,
        language: "en",
        items: [item({ price_source: "tag_in_photo", price_evidence: "$18", price_cents: 18, tags: [] })],
        unclear: [],
      },
      { hasAudio: false, notes: null },
    );
    expect(d.items[0]).toMatchObject({ price_cents: 1800, price_source: "tag_in_photo" });
  });

  it("never turns another currency into dollars", () => {
    const d = validateDraft(
      {
        heard: null,
        language: "en",
        items: [
          item({ name: "Bun", price_source: "tag_in_photo", price_evidence: "£2.95", price_cents: 295, tags: [] }),
          item({ name: "Donut", price_source: "tag_in_photo", price_evidence: "10 baht", price_cents: 1000, tags: [] }),
          item({ name: "Pastel", price_source: "tag_in_photo", price_evidence: "$1.10", price_cents: 110, tags: [] }),
        ],
        unclear: [],
      },
      { hasAudio: false, notes: null },
    );
    expect(d.items.map((i) => i.price_cents)).toEqual([null, null, 110]);
  });

  it("reads fractional dollars as cents only when the quote proves it", () => {
    const d = validateDraft(
      {
        heard: null,
        language: "en",
        items: [
          item({ name: "Pastel", price_source: "tag_in_photo", price_evidence: "$1.10", price_cents: 1.1, tags: [] }),
          item({ name: "Bun", price_source: "tag_in_photo", price_evidence: "$1.10", price_cents: 1.5, tags: [] }),
        ],
        unclear: [],
      },
      { hasAudio: false, notes: null },
    );
    expect(d.items.map((i) => i.price_cents)).toEqual([110, null]);
  });

  it("requires a quote for prices read off the photo", () => {
    const d = validateDraft(
      {
        heard: null,
        language: "en",
        items: [item({ price_source: "tag_in_photo", price_evidence: null, price_cents: 500, tags: [] })],
        unclear: [],
      },
      { hasAudio: false, notes: null },
    );
    expect(d.items[0].price_cents).toBeNull();
  });

  it("clamps absurd prices and junk numbers", () => {
    const d = validateDraft(
      {
        heard: null,
        language: "en",
        items: [
          item({ name: "A", price_source: "tag_in_photo", price_evidence: "$2000", price_cents: 200000, tags: [] }),
          item({ name: "B", price_source: "tag_in_photo", price_evidence: "$-3", price_cents: -300, tags: [] }),
          item({ name: "C", price_source: "tag_in_photo", price_evidence: "$2.5", price_cents: "250", tags: [] }),
        ],
        unclear: [],
      },
      { hasAudio: false, notes: null },
    );
    expect(d.items.map((i) => i.price_cents)).toEqual([null, null, 250]);
  });

  it("accepts quoted prices in languages we can't parse when the quote is in the transcript", () => {
    const d = validateDraft(
      {
        heard: "Bánh bò giá mười hai đô.",
        language: "vi",
        items: [
          item({ name: "Bánh bò", name_en: "Steamed rice cake", price_evidence: "mười hai đô", price_cents: 1200, tags: [] }),
        ],
        unclear: [],
      },
      voice,
    );
    expect(d.items[0]).toMatchObject({ name: "Bánh bò", name_en: "Steamed rice cake", price_cents: 1200 });
    expect(d.language).toBe("vi");
  });
});

describe("validateDraft: allergen tags need a source", () => {
  it("drops bare (unsourced) tags and unknown tags, normalizes synonyms", () => {
    const d = validateDraft(
      {
        heard: HEARD,
        language: "en",
        items: [
          item({
            tags: [
              "nut-free",
              { tag: "Nut Free", source: "spoken", quote: "no nuts in anything" },
              { tag: "delicious", source: "spoken", quote: "chocolate cake" },
            ],
          }),
        ],
        unclear: [],
      },
      voice,
    );
    expect(d.items[0].tags).toEqual(["nut-free"]);
  });

  it("drops spoken tags whose quote wasn't said, and quotes that don't mention the allergen", () => {
    const d = validateDraft(
      {
        heard: HEARD,
        language: "en",
        items: [
          item({
            tags: [
              { tag: "gluten-free", source: "spoken", quote: "it's gluten free" },
              { tag: "dairy-free", source: "spoken", quote: "no nuts in anything" },
            ],
          }),
        ],
        unclear: [],
      },
      voice,
    );
    expect(d.items[0].tags).toEqual([]);
  });

  it("keeps tags written in the photo, even without a voice note", () => {
    const d = validateDraft(
      {
        heard: null,
        language: "en",
        items: [item({ price_source: "missing", price_cents: null, price_evidence: null, tags: [{ tag: "gluten-free", source: "written_in_photo", quote: "GF" }, { tag: "nut-free", source: "spoken", quote: "no nuts" }] })],
        unclear: [],
      },
      { hasAudio: false, notes: null },
    );
    expect(d.items[0].tags).toEqual(["gluten-free"]);
  });

  it("drops contradictory tags and tells the owner", () => {
    const d = validateDraft(
      {
        heard: "No nuts in anything. The brownies have walnuts.",
        language: "en",
        items: [
          item({
            name: "Brownie",
            price_source: "missing",
            price_cents: null,
            price_evidence: null,
            tags: [
              { tag: "nut-free", source: "spoken", quote: "No nuts in anything" },
              { tag: "contains-nuts", source: "spoken", quote: "The brownies have walnuts" },
            ],
          }),
        ],
        unclear: [],
      },
      voice,
    );
    expect(d.items[0].tags).toEqual([]);
    expect(d.unclear).toContain("allergy info for Brownie (nut-free vs contains-nuts)");
  });
});

describe("validateDraft: junk in, clean draft out", () => {
  it("survives garbage input", () => {
    expect(validateDraft(null, voice)).toEqual({ shop_name: null, language: "en", items: [], unclear: [], heard: null });
    expect(validateDraft({ items: "nope", unclear: [1, 2] }, voice).items).toEqual([]);
  });

  it("drops nameless items, merges duplicates, caps at 30, trims long names", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      item({ name: `Thing ${i}`, price_source: "missing", price_cents: null, price_evidence: null, tags: [] }),
    );
    const d = validateDraft(
      {
        heard: HEARD,
        language: "EN",
        items: [
          item({ name: "   " }),
          item({ name: "!!" }),
          item({ name: "Croissant", price_source: "missing", price_cents: null, price_evidence: null, est_quantity: null, box_2d: null, tags: [] }),
          item({ name: "croissant ", price_evidence: "four fifty", price_cents: 450, est_quantity: 6, tags: [] }),
          item({ name: "x".repeat(120), price_source: "missing", price_cents: null, price_evidence: null, tags: [] }),
          ...many,
        ],
        unclear: ["  a   note  ", "A NOTE", 7],
      },
      voice,
    );
    expect(d.items).toHaveLength(30);
    expect(d.items[0]).toMatchObject({ name: "Croissant", price_cents: 450, est_quantity: 6 });
    expect(d.items[0].box_2d).toEqual([120, 80, 460, 420]);
    expect(d.items[1].name).toHaveLength(80);
    expect(d.unclear[0]).toBe("a note");
    expect(d.unclear.filter((u) => u.toLowerCase() === "a note")).toHaveLength(1);
    expect(d.language).toBe("en");
  });

  it("coerces quantities and validates boxes", () => {
    const d = validateDraft(
      {
        heard: HEARD,
        language: "xx_bad lang!",
        items: [
          item({ est_quantity: 2.6, box_2d: [500, 10, 100, 20] }),
          item({ name: "B", est_quantity: -1, box_2d: [0, 0, 1001, 10] }),
          item({ name: "C", est_quantity: "3", box_2d: "nope" }),
        ],
        unclear: [],
      },
      { hasAudio: true, notes: null, languageHint: "es" },
    );
    expect(d.items.map((i) => i.est_quantity)).toEqual([3, null, 3]);
    expect(d.items.map((i) => i.box_2d)).toEqual([null, null, null]);
    expect(d.language).toBe("es");
  });
});

describe("amountsIn", () => {
  const has = (text: string, cents: number) => amountsIn(text).has(cents);
  it.each([
    ["eighteen dollars", 1800],
    ["four fifty", 450],
    ["croissants are four fifty a piece", 450],
    ["three twenty five", 325],
    ["twelve ninety nine", 1299],
    ["a dollar fifty", 150],
    ["one dollar and fifty cents", 150],
    ["fifty cents", 50],
    ["twenty five", 2500],
    ["a hundred", 10000],
    ["$4.50", 450],
    ["4,50", 450],
    ["4.5", 450],
    ["4 50", 450],
    ["cake 18", 1800],
    ["eighteen and four fifty", 1800],
    ["eighteen and four fifty", 450],
    ["450", 450],
    ["4 dollars and 50 cents", 450],
    ["Bánh croissant giá 4 đô 50", 450],
    ["los cuernitos cuestan 4 dólares con 50", 450],
    ["50 cents", 50],
    ["75¢", 75],
  ])("%s → %i", (text, cents) => {
    expect(has(text, cents)).toBe(true);
  });

  it("doesn't read prices that aren't there", () => {
    expect(has("croissants are four fifty a piece", 451)).toBe(false);
    expect(has("eighteen dollars", 1850)).toBe(false);
    expect(amountsIn("no nuts in anything").size).toBe(0);
    expect(amountsIn("a croissant").size).toBe(0);
  });
});

describe("helpers", () => {
  it("normalizeTag", () => {
    expect(normalizeTag("Nut Free")).toBe("nut-free");
    expect(normalizeTag("contains_dairy")).toBe("contains-dairy");
    expect(normalizeTag("plant-based")).toBe("vegan");
    expect(normalizeTag("tasty")).toBeNull();
  });

  it("fuzzyContains", () => {
    expect(fuzzyContains(HEARD, "no nuts in anything")).toBe(true);
    expect(fuzzyContains(HEARD, "there are no nuts")).toBe(true);
    expect(fuzzyContains(HEARD, "it's gluten free")).toBe(false);
    expect(fuzzyContains(HEARD, "")).toBe(false);
  });
});
