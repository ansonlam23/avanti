import { describe, expect, it } from "vitest";
import { hereLine, missingProgressColumn, readyLine, shareText, shortShop, ticketSteps } from "./progress";

const base = { status: "held" as const };

describe("ticketSteps", () => {
  const steps = (o: Parameters<typeof ticketSteps>[0]) => ticketSteps(o);
  const now = (o: Parameters<typeof ticketSteps>[0]) => steps(o).find((s) => s.current)?.label;

  it("reads Sent → Preparing → Ready → Picked up", () => {
    expect(steps(base).map((s) => s.label)).toEqual(["Sent", "Preparing", "Ready", "Picked up"]);
  });

  it("is Sent until the counter has shown the order", () => {
    expect(now(base)).toBe("Sent");
    expect(steps(base).some((s) => s.done)).toBe(false);
    // the shopper saying "I'm here" doesn't mean the shop has seen it
    expect(now({ ...base, here_at: "t" })).toBe("Sent");
  });

  it("is Preparing once seen, Ready once the owner taps Ready", () => {
    expect(now({ ...base, seen_at: "t" })).toBe("Preparing");
    const ready = steps({ ...base, seen_at: "t", ready_at: "t" });
    expect(ready.map((s) => s.done)).toEqual([true, true, false, false]);
    expect(ready.find((s) => s.current)?.label).toBe("Ready");
    // ready without a recorded "seen" still counts as past Preparing
    expect(now({ ...base, ready_at: "t" })).toBe("Ready");
  });

  it("marks every step done once picked up, with nothing in progress", () => {
    const paid = steps({ ...base, status: "paid" });
    expect(paid.every((s) => s.done)).toBe(true);
    expect(paid.some((s) => s.current)).toBe(false);
  });

  it("has nothing in progress for a released order", () => {
    expect(steps({ ...base, status: "released" }).some((s) => s.current || s.done)).toBe(false);
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
