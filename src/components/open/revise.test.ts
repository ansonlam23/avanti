import { describe, expect, it } from "vitest";
import type { MenuRow } from "./menu-board";
import { applyRevision, changeSummary, menuForRevise, pruneUnclear } from "./revise";

function row(over: Partial<MenuRow>): MenuRow {
  return {
    key: "k",
    name: "Lemon bars",
    name_en: null,
    description: null,
    price_cents: null,
    price_source: "missing",
    tags: [],
    stock: 6,
    box_2d: [10, 10, 200, 200],
    ai_orderable: true,
    ...over,
  };
}

const ROWS = [
  row({ key: "r0-Lemon bars" }),
  row({ key: "r1-Brownies", name: "Brownies", price_cents: 300, price_source: "tag_in_photo", stock: 8 }),
  row({ key: "new-1", name: "  ", stock: 1 }),
  row({ key: "r2-Muffin", name: "Blueberry muffin", stock: 4, ai_orderable: false }),
];

describe("menuForRevise", () => {
  it("sends named lines with short ids and remembers their keys", () => {
    const { menu, keys } = menuForRevise(ROWS);
    expect(keys).toEqual(["r0-Lemon bars", "r1-Brownies", "r2-Muffin"]);
    expect(menu.map((m) => m.id)).toEqual(["i0", "i1", "i2"]);
    expect(menu[1]).toEqual({
      id: "i1",
      name: "Brownies",
      name_en: null,
      price_cents: 300,
      price_source: "tag_in_photo",
      description: null,
      tags: [],
      est_quantity: 8,
    });
  });
});

describe("applyRevision", () => {
  const { keys } = menuForRevise(ROWS);
  const newKey = (i: number) => `said-${i}`;

  it("updates, removes and adds, keeping everything the change didn't touch", () => {
    const a = applyRevision(
      ROWS,
      [
        { op: "update", id: "i0", patch: { price_cents: 475, price_source: "spoken", est_quantity: 12 } },
        { op: "remove", id: "i2" },
        {
          op: "add",
          item: { name: "Cookies", name_en: null, price_cents: 250, price_source: "spoken", description: null, tags: ["nut-free"], est_quantity: null },
        },
      ],
      keys,
      newKey,
    );
    expect(a.rows.map((r) => r.key)).toEqual(["r0-Lemon bars", "r1-Brownies", "new-1", "said-0"]);
    expect(a.rows[0]).toMatchObject({ price_cents: 475, price_source: "spoken", stock: 12, box_2d: [10, 10, 200, 200] });
    expect(a.rows[1]).toBe(ROWS[1]);
    expect(a.rows[3]).toMatchObject({ name: "Cookies", price_cents: 250, stock: 1, box_2d: null, ai_orderable: true });
    expect(a.touched).toEqual(["r0-Lemon bars", "said-0"]);
    expect({ added: a.added, updated: a.updated, removed: a.removed }).toEqual({ added: 1, updated: 1, removed: 1 });
  });

  it("ignores ids it never sent", () => {
    const a = applyRevision(ROWS, [{ op: "remove", id: "i9" }, { op: "update", id: "r1-Brownies", patch: { price_cents: 1 } }], keys, newKey);
    expect(a.rows).toEqual(ROWS);
    expect(a.touched).toEqual([]);
  });
});

describe("pruneUnclear", () => {
  it("drops notes a change settled", () => {
    const rows = [row({ name: "Lemon bars", price_cents: 475, price_source: "spoken" }), row({ name: "Scones" })];
    expect(
      pruneUnclear(["price for Lemon bars", "price for Scones", "muffin label unreadable", "check the price for Muffin"], rows, ["Muffin"]),
    ).toEqual(["price for Scones"]);
  });
});

describe("changeSummary", () => {
  it("says what happened in a few words", () => {
    expect(changeSummary({ added: 1, updated: 2, removed: 0 })).toBe("Changed 2, added 1.");
    expect(changeSummary({ added: 0, updated: 0, removed: 1 })).toBe("Took off 1.");
    expect(changeSummary({ added: 0, updated: 0, removed: 0 })).toBe("Nothing to change there.");
  });
});
