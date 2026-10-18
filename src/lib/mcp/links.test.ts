import { describe, expect, it } from "vitest";
import { isAsap, linkOrigin, MAX_PROMPT_CHARS, orderLink, orderPrompt, pickupPhrase } from "./links";

const cake = { qty: 1, item_name: "Chocolate cake", item_name_en: null, shop_name: "Mai's Bakery", pickup_label: "5:30 PM" };

describe("linkOrigin", () => {
  it("uses NEXT_PUBLIC_APP_URL when it's a valid http(s) URL (origin only)", () => {
    expect(linkOrigin("https://try-avanti.vercel.app/", "http://localhost:3100")).toBe("https://try-avanti.vercel.app");
    expect(linkOrigin(" https://try-avanti.vercel.app/some/path ", "http://x")).toBe("https://try-avanti.vercel.app");
  });

  it("falls back to the request origin when unset or not a URL", () => {
    expect(linkOrigin(undefined, "http://localhost:3100")).toBe("http://localhost:3100");
    expect(linkOrigin("", "https://try-avanti.vercel.app")).toBe("https://try-avanti.vercel.app");
    expect(linkOrigin("not a url", "http://localhost:3100")).toBe("http://localhost:3100");
    expect(linkOrigin("ftp://files.example", "http://localhost:3100")).toBe("http://localhost:3100");
  });
});

describe("order prompt", () => {
  it("names the qty, item, shop and pickup", () => {
    expect(orderPrompt(cake, { asap: false })).toBe("Order 1 × Chocolate cake from Mai's Bakery, pickup today at 5:30 PM");
    expect(orderPrompt({ ...cake, qty: 2, pickup_label: "tomorrow 9 AM" }, { asap: false })).toBe(
      "Order 2 × Chocolate cake from Mai's Bakery, pickup tomorrow at 9 AM",
    );
    expect(orderPrompt(cake, { asap: true })).toBe("Order 1 × Chocolate cake from Mai's Bakery, pickup as soon as possible");
  });

  it("adds the English name when the item has one", () => {
    const pho = { ...cake, item_name: "Phở bò", item_name_en: "Beef pho", shop_name: "Pho Corner" };
    expect(orderPrompt(pho, { asap: true })).toBe("Order 1 × Phở bò (Beef pho) from Pho Corner, pickup as soon as possible");
  });

  it("fits in the composer (≤ 300 chars) even with very long names", () => {
    const long = { ...cake, item_name: "Cake ".repeat(60), item_name_en: "Torte ".repeat(40), shop_name: "Shop ".repeat(40) };
    expect(orderPrompt(long, { asap: false }).length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  });

  it("reads pickup labels as phrases", () => {
    expect(pickupPhrase("5:30 PM")).toBe("today at 5:30 PM");
    expect(pickupPhrase("Sunday 9 AM")).toBe("Sunday at 9 AM");
    expect(pickupPhrase("soon")).toBe("soon");
  });

  it("treats a missing time or asap as the earliest pickup", () => {
    expect([null, undefined, "", "asap", " ASAP ", "now", "soonest"].every(isAsap)).toBe(true);
    expect(isAsap("17:30")).toBe(false);
  });
});

describe("orderLink", () => {
  it("is <origin>/ask?q=<prompt>, form-encoded so Markdown never breaks it", () => {
    const prompt = orderPrompt(cake, { asap: false });
    const link = orderLink("https://try-avanti.vercel.app", prompt);
    expect(link).toBe(
      "https://try-avanti.vercel.app/ask?q=Order+1+%C3%97+Chocolate+cake+from+Mai%27s+Bakery%2C+pickup+today+at+5%3A30+PM",
    );
    expect(link).not.toMatch(/[\s'()]/);
    expect(new URL(link).searchParams.get("q")).toBe(prompt);
  });
});
