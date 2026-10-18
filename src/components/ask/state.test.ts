import { describe, expect, it } from "vitest";
import { INITIAL, reducer, type Action, type State } from "./state";

const proposal = (item_id: string) => ({ ok: true, proposal: { item_id }, note: "" }) as never;
const run = (actions: Action[], from: State = INITIAL) => actions.reduce(reducer, from);
const card = (id: string, item: string, rid = "r1", proactive = false): Action => ({
  type: "tool",
  id,
  responseId: rid,
  name: "propose_order",
  args: {},
  result: proposal(item),
  proactive,
});

describe("ask state", () => {
  it("streams one reply into one bubble, and settles on done", () => {
    const s = run([
      { type: "user", id: "u", text: "cake", hidden: false, status: "Thinking…", responseId: "r1" },
      { type: "status", status: "Looking at shops near campus…" },
      { type: "text", id: "a", responseId: "r1", delta: " Mai's ", proactive: false },
      { type: "text", id: "b", responseId: "r1", delta: "has one.", proactive: false },
    ]);
    expect(s.feed.map((f) => f.kind)).toEqual(["user", "ai"]);
    expect(s.feed[1]).toMatchObject({ text: "Mai's has one.", streaming: true });
    expect(s).toMatchObject({ busy: true, status: null, activeResponse: "r1" });
    const done = reducer(s, { type: "done" });
    expect(done).toMatchObject({ busy: false, activeResponse: null });
    expect(done.feed[1]).toMatchObject({ streaming: false });
  });

  it("hidden event turns never show a bubble", () => {
    const s = reducer(INITIAL, { type: "user", id: "u", text: "[event] x", hidden: true, status: "…", responseId: "r1" });
    expect(s.feed).toEqual([]);
    expect(s.busy).toBe(true);
  });

  it("keeps one live set of cards: a newer reply's card replaces older unconfirmed ones", () => {
    const s = run([card("c1", "i1"), { type: "proposal", id: "c1", patch: { status: "failed" } }, card("c2", "i2", "r2")]);
    expect(s.proposals.c1.status).toBe("replaced");
    expect(s.proposals.c2.status).toBe("ready");
    const held = run([card("c1", "i1"), { type: "proposal", id: "c1", patch: { status: "held" } }, card("c2", "i2", "r2")]);
    expect(held.proposals.c1.status).toBe("held"); // a placed order is never 'replaced'
  });

  it("an errand: one reply's cards for different items stay side by side", () => {
    const s = run([card("c1", "cake"), card("c2", "flowers"), card("c3", "print")]);
    expect([s.proposals.c1.status, s.proposals.c2.status, s.proposals.c3.status]).toEqual(["ready", "ready", "ready"]);
    // the same reply re-proposing an item replaces only that item's card
    const again = reducer(s, card("c4", "flowers") as Action);
    expect(again.proposals.c2.status).toBe("replaced");
    expect([again.proposals.c1.status, again.proposals.c3.status, again.proposals.c4.status]).toEqual(["ready", "ready", "ready"]);
  });

  it("a proactive 'Heads up' card only stands in for its own item", () => {
    let s = run([card("c1", "cake"), card("c2", "flowers")]);
    s = reducer(s, { type: "gone", itemId: "cake", gone: true });
    s = reducer(s, card("c3", "other-cake", "r2", true) as Action);
    expect(s.proposals.c1.status).toBe("sold_out");
    expect(s.proposals.c2.status).toBe("ready"); // the rest of the errand is still on
    expect(s.proposals.c3.status).toBe("ready");
  });

  it("tracks a running Confirm all", () => {
    const s = reducer(INITIAL, { type: "batch", batch: { responseId: "r1", cards: ["c1", "c2"], current: "c1" } });
    expect(s.batch).toEqual({ responseId: "r1", cards: ["c1", "c2"], current: "c1" });
    expect(reducer(s, { type: "batch", batch: null }).batch).toBeNull();
  });

  it("sold out marks open cards for that item, and a restock brings them back", () => {
    let s = run([card("c1", "i1"), card("c2", "i2", "r2")]);
    expect(s.proposals.c1.status).toBe("replaced");
    s = run([card("c3", "i2")], INITIAL);
    s = reducer(s, { type: "gone", itemId: "i2", gone: true });
    expect(s.proposals.c3.status).toBe("sold_out");
    expect(s.gone).toEqual({ i2: true });
    s = reducer(s, { type: "gone", itemId: "i2", gone: false });
    expect(s.proposals.c3.status).toBe("ready");
    expect(s.gone).toEqual({});
  });

  it("an order card's idempotency key is fixed when the card appears and survives retries", () => {
    let s = reducer(INITIAL, { ...(card("c1", "i1") as Extract<Action, { type: "tool" }>), key: "key-1" });
    expect(s.proposals.c1.key).toBe("key-1");
    s = run(
      [
        { type: "proposal", id: "c1", patch: { status: "pending" } },
        { type: "proposal", id: "c1", patch: { status: "failed", error: { code: "network", message: "", retry: true } } },
        { type: "proposal", id: "c1", patch: { status: "pending" } },
      ],
      s,
    );
    expect(s.proposals.c1).toMatchObject({ status: "pending", key: "key-1" });
    expect(reducer(s, { type: "proposal", id: "nope", patch: { status: "held" } })).toBe(s); // unknown card: no-op
  });

  it("a card for an item already gone starts sold out", () => {
    const s = run([{ type: "gone", itemId: "i9", gone: true }, card("c1", "i9")]);
    expect(s.proposals.c1.status).toBe("sold_out");
  });

  it("tracks live orders and the reveal", () => {
    const order = { id: "o1", status: "held" } as never;
    let s = run([{ type: "order", order }, { type: "reveal", reveal: { orderId: "o1", step: "verified" } }]);
    expect(s.orders.o1).toBe(order);
    expect(s.reveal).toEqual({ orderId: "o1", step: "verified" });
    s = reducer(s, { type: "reveal", reveal: null });
    expect(s.reveal).toBeNull();
    expect(reducer(s, { type: "reset" })).toBe(INITIAL);
  });
});
