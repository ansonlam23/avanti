import { describe, expect, it } from "vitest";
import { prunePickups, upsertPickups, waitingFirst, type SavedPickup } from "./saved-pickups";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function order(id: string, status: SavedPickup["status"]) {
  return { id, shop_name: "Mai's Bakery", item_name: "Chocolate cake", qty: 1, pickup_time: null, status };
}

describe("upsertPickups", () => {
  it("saves held tickets, not ones that never held", () => {
    const list = upsertPickups([], [order("a", "held"), order("b", "failed"), order("c", "pending")], NOW);
    expect(list.map((p) => p.id)).toEqual(["a"]);
    expect(list[0]).toMatchObject({ shop: "Mai's Bakery", item: "Chocolate cake", status: "held", saved: NOW });
  });

  it("keeps a picked-up ticket for a day, then drops it", () => {
    const held = upsertPickups([], [order("a", "held")], NOW);
    const paid = upsertPickups(held, [order("a", "paid")], NOW + HOUR);
    expect(paid[0]).toMatchObject({ status: "paid", paid: NOW + HOUR, saved: NOW });
    expect(prunePickups(paid, NOW + 20 * HOUR)).toHaveLength(1);
    expect(prunePickups(paid, NOW + 26 * HOUR)).toHaveLength(0);
  });

  it("drops a released ticket at once", () => {
    const held = upsertPickups([], [order("a", "held")], NOW);
    expect(upsertPickups(held, [order("a", "released")], NOW + 1)).toEqual([]);
  });

  it("doesn't touch tickets it wasn't given", () => {
    const list = upsertPickups([], [order("a", "held"), order("b", "held")], NOW);
    expect(upsertPickups(list, [order("b", "paid")], NOW + 1).find((p) => p.id === "a")?.status).toBe("held");
  });
});

describe("waitingFirst", () => {
  it("puts tickets still waiting first, newest first", () => {
    const list: SavedPickup[] = [
      { ...upsertPickups([], [order("old", "held")], NOW)[0] },
      { ...upsertPickups([], [order("done", "paid")], NOW + 2)[0] },
      { ...upsertPickups([], [order("new", "held")], NOW + 1)[0] },
    ];
    expect(waitingFirst(list).map((p) => p.id)).toEqual(["new", "old", "done"]);
  });
});
