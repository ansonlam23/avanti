import { describe, expect, it } from "vitest";
import { hasWord, itemSaysAbout, normalize, notesSayAbout, queryTerms, scoreItem, stem, topicsIn } from "./match";

const cake = { name: "Chocolate cake", name_en: null, description: "Rich sponge. Made with butter.", tags: ["nut-free", "contains-dairy"] };
const brownie = { name: "Walnut brownie", name_en: null, description: null, tags: ["contains-nuts"] };
const pho = { name: "Phở bò", name_en: "Beef pho", description: null, tags: [] };

describe("normalize + stem", () => {
  it("strips accents and punctuation", () => {
    expect(normalize("Phở bò!")).toBe("pho bo");
    expect(normalize("Mai's  Bakery")).toBe("mais bakery");
    expect(normalize("nut-free")).toBe("nut free");
  });

  it("strips plurals to a prefix of the singular", () => {
    expect(stem("cakes")).toBe("cake");
    expect(stem("cookies")).toBe("cook");
    expect(stem("pastries")).toBe("pastr");
    expect(stem("pies")).toBe("pie");
    expect(stem("boxes")).toBe("box");
    expect(stem("glass")).toBe("glass");
    expect(stem("hummus")).toBe("hummus");
  });

  it("matches word prefixes only", () => {
    expect(hasWord("chocolate chip cookie", "cook")).toBe(true);
    expect(hasWord("donut", "nut")).toBe(false);
  });
});

describe("queryTerms", () => {
  it("keeps product words and pulls out diet words", () => {
    const t = queryTerms("Birthday cake near campus by 6, no nuts");
    expect(t.keywords.map((k) => k.word)).toEqual(["cake"]);
    expect(t.diet).toEqual(["nut"]);
  });

  it("expands everyday words", () => {
    const t = queryTerms("something sweet for dessert");
    expect(t.keywords.find((k) => k.word === "dessert")?.alts).toContain("cake");
  });
});

describe("scoreItem", () => {
  it("scores name hits above description/tag hits", () => {
    const t = queryTerms("cake");
    expect(scoreItem(cake, t)).toBe(2);
    expect(scoreItem({ ...cake, name: "Sponge", description: "a light cake" }, t)).toBe(1);
    expect(scoreItem(brownie, t)).toBe(0);
  });

  it("never matches nut items just because the shopper said 'no nuts'", () => {
    expect(scoreItem(brownie, queryTerms("cake no nuts"))).toBe(0);
  });

  it("matches the English name of a non-English item", () => {
    expect(scoreItem(pho, queryTerms("pho"))).toBe(2);
    expect(scoreItem(pho, queryTerms("beef noodle soup"))).toBe(2);
  });

  it("uses tags for diet-only queries", () => {
    expect(scoreItem(cake, queryTerms("anything nut-free?"))).toBe(1);
  });
});

describe("what the shop says", () => {
  it("finds allergen topics in a question", () => {
    expect(topicsIn("Does the chocolate cake have nuts?")).toEqual(["nuts"]);
    expect(topicsIn("Is it vegan and gluten free?")).toEqual(["gluten", "vegan"]);
    expect(topicsIn("What time do you close?")).toEqual([]);
    expect(topicsIn("any donuts?")).toEqual([]);
  });

  it("quotes only the shop's own tags and descriptions", () => {
    expect(itemSaysAbout(cake, "nuts")).toEqual(["tag: nut-free"]);
    expect(itemSaysAbout(cake, "dairy")).toEqual(["tag: contains-dairy", 'description: "Made with butter."']);
    expect(itemSaysAbout(cake, "gluten")).toEqual([]); // the shop didn't say
    expect(itemSaysAbout(brownie, "nuts")).toEqual(["tag: contains-nuts"]);
  });

  it("quotes shop-wide notes", () => {
    expect(notesSayAbout("Cash or card. No nuts in anything.", "nuts")).toEqual(['shop notes: "No nuts in anything."']);
    expect(notesSayAbout(null, "nuts")).toEqual([]);
  });
});
