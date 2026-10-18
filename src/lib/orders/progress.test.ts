import { describe, expect, it } from "vitest";
import { hereLine, missingProgressColumn, readyLine, shareText, shortShop, ticketSteps } from "./progress";

const base = { shop_name: "Mai's Bakery (demo)", status: "held" as const };

describe("ticketSteps", () => {
  it("waits on the shop to see a fresh hold", () => {
    const steps = ticketSteps(base);
    expect(steps.map((s) => s.label)).toEqual(["Sent", "Mai's Bakery saw it", "Ready", "Picked up"]);
    expect(steps.map((s) => s.done)).toEqual([true, false, false, false]);
    expect(steps.find((s) => s.current)?.key).toBe("seen");
  });

  it("moves on as the owner sees it and marks it ready", () => {
    expect(ticketSteps({ ...base, seen_at: "t" }).find((s) => s.current)?.key).toBe("ready");
    const ready = ticketSteps({ ...base, ready_at: "t" });
    // ready implies seen, even if the counter's "seen" ping was missed
    expect(ready.map((s) => s.done)).toEqual([true, true, true, false]);
    expect(ready.find((s) => s.current)?.key).toBe("picked");
  });

  it("marks every step done once picked up, with nothing current", () => {
    const steps = ticketSteps({ ...base, status: "paid" });
    expect(steps.every((s) => s.done)).toBe(true);
    expect(steps.some((s) => s.current)).toBe(false);
  });

  it("has nothing current for a released order", () => {
    expect(ticketSteps({ ...base, status: "released" }).some((s) => s.current)).toBe(false);
  });
});

describe("lines", () => {
  it("says who is at the door", () => {
    expect(hereLine({ customer_name: "Anson", qty: 1, item_name: "Chocolate cake" })).toBe("Anson is here for the chocolate cake.");
    expect(hereLine({ customer_name: "  ", qty: 2, item_name: "Lemon bar" })).toBe("Your shopper is here for 2 lemon bars.");
    expect(hereLine({ customer_name: null, qty: 3, item_name: "Bánh mì" })).toBe("Your shopper is here for 3 bánh mì.");
  });

  it("tells the shopper it's ready", () => {
    expect(readyLine({ qty: 1, item_name: "Chocolate cake" })).toBe("Your chocolate cake is ready.");
    expect(readyLine({ qty: 2, item_name: "Croissants" })).toBe("Your 2 croissants are ready.");
    expect(readyLine({ qty: 2, item_name: "Cherry" })).toBe("Your 2 cherries are ready.");
  });

  it("writes the note for a shared ticket", () => {
    expect(shareText({ shop_name: "Mai's Bakery (demo)", qty: 1, item_name: "Chocolate cake", pickup_code: "4821" })).toBe(
      "Can you pick this up for me at Mai's Bakery? 1 × Chocolate cake, pickup code 4821.",
    );
  });

  it("keeps a shop name that is only a label", () => {
    expect(shortShop("Petal Cart")).toBe("Petal Cart");
    expect(shortShop("(demo)")).toBe("(demo)");
  });
});

describe("missingProgressColumn", () => {
  it("spots the unapplied migration, and nothing else", () => {
    expect(missingProgressColumn({ code: "42703", message: 'column orders.seen_at does not exist' })).toBe(true);
    expect(missingProgressColumn({ code: "PGRST204", message: "Could not find the 'here_at' column" })).toBe(true);
    expect(missingProgressColumn({ code: "42703", message: "column orders.shopper_key does not exist" })).toBe(false);
    expect(missingProgressColumn(null)).toBe(false);
  });
});
