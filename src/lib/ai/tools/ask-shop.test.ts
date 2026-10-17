import { describe, expect, it } from "vitest";
import { askShopResult } from "./ask-shop";
import { demoStreet } from "./fixtures";

describe("ask_shop", () => {
  it("answers allergen questions only with the shop's own words", () => {
    const { mai } = demoStreet();
    const r = askShopResult(mai, "Does the chocolate cake have nuts?");
    expect(r.items.map((i) => i.name)).toEqual(["Chocolate cake"]);
    expect(r.topics).toEqual([
      {
        topic: "nuts",
        shop_says: ['shop notes: "No nuts in anything."'],
        items: [{ id: mai.items[0].id, name: "Chocolate cake", says: ["tag: nut-free"] }],
      },
    ]);
    expect(r.answer_rule).toContain("Mai's Bakery didn't say. Want me to ask?");
  });

  it("returns empty 'says' when the shop didn't say (so the AI must not guess)", () => {
    const { ave } = demoStreet();
    const r = askShopResult(ave, "Is the birthday cake gluten free?");
    expect(r.topics[0].topic).toBe("gluten");
    expect(r.topics[0].shop_says).toEqual([]);
    expect(r.topics[0].items.every((i) => i.says.length === 0)).toBe(true);
  });

  it("covers the whole menu when the question names no item", () => {
    const { mai } = demoStreet();
    const r = askShopResult(mai, "Is anything vegan?");
    expect(r.items).toHaveLength(3);
    expect(r.topics[0].topic).toBe("vegan");
  });
});
