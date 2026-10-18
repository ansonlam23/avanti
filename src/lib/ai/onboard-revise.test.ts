import { describe, expect, it } from "vitest";
import { validateRevision, type MenuSoFarItem } from "@/lib/ai/onboard-revise";

// Fixtures are shaped like real Gemini output for the revise schema.
const MENU: MenuSoFarItem[] = [
  { id: "r0", name: "Lemon bars", name_en: null, price_cents: null, price_source: "missing", description: null, tags: [], est_quantity: 6 },
  { id: "r1", name: "Brownies", name_en: null, price_cents: 300, price_source: "tag_in_photo", description: null, tags: ["contains-nuts"], est_quantity: 8 },
  { id: "r2", name: "Blueberry muffin", name_en: null, price_cents: null, price_source: "missing", description: null, tags: [], est_quantity: 4 },
];

function change(over: Record<string, unknown> = {}) {
  return {
    op: "update",
    id: "r0",
    name: null,
    name_en: null,
    price_action: "keep",
    price_evidence: null,
    price_cents: null,
    est_quantity: null,
    description: null,
    tags_add: [],
    tags_remove: [],
    ...over,
  };
}

function revise(changes: unknown[], words: { heard?: string; notes?: string }, extra: Record<string, unknown> = {}) {
  return validateRevision(
    { heard: words.heard ?? null, changes, shop_name: null, language: "en", unclear: [], ...extra },
    { menu: MENU, hasAudio: words.heard !== undefined, notes: words.notes ?? null },
  );
}

describe("validateRevision", () => {
  it("sets a price the owner said, with the mic mark", () => {
    const r = revise(
      [change({ price_action: "set", price_evidence: "four seventy five", price_cents: 475 })],
      { heard: "Lemon bars are four seventy five." },
    );
    expect(r.heard).toBe("Lemon bars are four seventy five.");
    expect(r.changes).toEqual([{ op: "update", id: "r0", patch: { price_cents: 475, price_source: "spoken" } }]);
  });

  it("marks a typed price as the owner's own", () => {
    const r = revise([change({ price_action: "set", price_evidence: "4.75", price_cents: 475 })], { notes: "lemon bars 4.75" });
    expect(r.heard).toBeNull();
    expect(r.changes).toEqual([{ op: "update", id: "r0", patch: { price_cents: 475, price_source: "owner" } }]);
  });

  it("drops a price the owner never said and asks instead", () => {
    const r = revise(
      [change({ price_action: "set", price_evidence: "usual price", price_cents: 450 })],
      { heard: "The lemon bars are really good today." },
    );
    expect(r.changes).toEqual([]);
    expect(r.unclear).toContain("check the price for Lemon bars");
  });

  it("fixes the dollars-for-cents slip only when the words prove it", () => {
    const r = revise([change({ price_action: "set", price_evidence: "5", price_cents: 5 })], { notes: "lemon bars are 5" });
    expect(r.changes).toEqual([{ op: "update", id: "r0", patch: { price_cents: 500, price_source: "owner" } }]);
  });

  it("adds a new item, and turns a duplicate add into an update", () => {
    const r = revise(
      [
        change({ op: "add", id: null, name: "Chocolate chip cookies", price_action: "set", price_evidence: "two fifty", price_cents: 250, est_quantity: 12 }),
        change({ op: "add", id: null, name: "lemon bars", price_action: "set", price_evidence: "four seventy five", price_cents: 475 }),
      ],
      { heard: "Add chocolate chip cookies, twelve of them, two fifty. Lemon bars four seventy five." },
    );
    expect(r.changes).toEqual([
      { op: "update", id: "r0", patch: { price_cents: 475, price_source: "spoken" } },
      {
        op: "add",
        item: {
          name: "Chocolate chip cookies",
          name_en: null,
          price_cents: 250,
          price_source: "spoken",
          description: null,
          tags: [],
          est_quantity: 12,
        },
      },
    ]);
  });

  it("capitalizes a name typed all in lowercase", () => {
    const r = revise([change({ op: "add", id: null, name: "oat milk latte", name_en: "oat milk latte" })], { notes: "add oat milk latte" });
    expect(r.changes).toMatchObject([{ op: "add", item: { name: "Oat milk latte", name_en: null } }]);
  });

  it("adds an item without a price as needing one", () => {
    const r = revise([change({ op: "add", id: null, name: "Scones" })], { notes: "we also have scones" });
    expect(r.changes).toMatchObject([{ op: "add", item: { name: "Scones", price_cents: null, price_source: "missing" } }]);
    expect(r.unclear).toContain("price for Scones");
  });

  it("removes by id and ignores ids that don't exist", () => {
    const r = revise([change({ op: "remove", id: "r2" }), change({ op: "remove", id: "nope" })], { notes: "no muffins today" });
    expect(r.changes).toEqual([{ op: "remove", id: "r2" }]);
  });

  it("finds the line by name when the id is missing", () => {
    const r = revise(
      [change({ id: null, name: "Brownies", price_action: "set", price_evidence: "3.50", price_cents: 350 })],
      { notes: "brownies are 3.50 now" },
    );
    expect(r.changes).toEqual([{ op: "update", id: "r1", patch: { price_cents: 350, price_source: "owner" } }]);
  });

  it("clears a price when the owner takes it back", () => {
    const r = revise([change({ id: "r1", price_action: "clear" })], { notes: "not sure about the brownie price yet" });
    expect(r.changes).toEqual([{ op: "update", id: "r1", patch: { price_cents: null, price_source: "missing" } }]);
  });

  it("keeps a diet tag only with a quote from the owner's words, and the latest words win", () => {
    const r = revise(
      [
        change({ id: "r1", tags_add: [{ tag: "nut-free", quote: "no nuts in the brownies" }] }),
        change({ id: "r0", tags_add: [{ tag: "gluten-free", quote: "gluten free recipe" }] }),
      ],
      { heard: "Actually there are no nuts in the brownies." },
    );
    // nut-free replaces the photo's contains-nuts; the gluten-free quote was never said
    expect(r.changes).toEqual([{ op: "update", id: "r1", patch: { tags: ["nut-free"] } }]);
  });

  it("returns nothing when the owner changed nothing", () => {
    const r = revise([change({ name: "Lemon bars" })], { notes: "lemon bars look great" });
    expect(r.changes).toEqual([]);
  });

  it("survives junk output", () => {
    expect(validateRevision("nope", { menu: MENU, hasAudio: false, notes: "hi" }).changes).toEqual([]);
    expect(revise([null, 3, { op: "explode" }], { notes: "hi" }).changes).toEqual([]);
  });

  it("ignores a transcript for typed changes and keeps the shop name it heard", () => {
    const r = revise([], { notes: "call it Anson's Snacks" }, { heard: "made up", shop_name: "Anson's Snacks" });
    expect(r.heard).toBeNull();
    expect(r.shop_name).toBe("Anson's Snacks");
  });
});
