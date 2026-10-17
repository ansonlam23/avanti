"use client";

import { useState } from "react";
import { ChalkMenu, PriceTag, type ChalkMenuItem } from "@/components/brand";
import { Pill, Section, Stage } from "../stage";

export const MENU: ChalkMenuItem[] = [
  { id: "croissant", name: "Croissant", price_cents: 450, tags: ["butter"] },
  { id: "cake", name: "Chocolate cake", price_cents: 1800, tags: ["nut-free"] },
  { id: "banh-mi", name: "Bánh mì", price_cents: 900, note: "pork baguette" },
  { id: "loaf", name: "Round loaf", price_cents: null },
  { id: "tart", name: "Lemon tart", price_cents: 650 },
];

function LiveMenu({ animateIn }: { animateIn?: boolean }) {
  const [soldOut, setSoldOut] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const items = MENU.map((i) => ({ ...i, sold_out: i.id === soldOut }));
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <ChalkMenu title="Mai's Bakery" items={items} highlightId={highlight} animateIn={animateIn} className="max-w-[340px]" />
      <div className="flex flex-wrap justify-center gap-2">
        <Pill onClick={() => setSoldOut(soldOut ? null : "tart")} active={!!soldOut}>
          {soldOut ? "Restock tart" : "Sell out tart"}
        </Pill>
        <Pill onClick={() => setHighlight(highlight === "cake" ? "croissant" : "cake")}>Highlight</Pill>
        <Pill onClick={() => setHighlight(null)}>Clear</Pill>
      </div>
    </div>
  );
}

export function MenuDemos() {
  return (
    <Section
      id="menu"
      title="Menu slip"
      intro="The shop's menu on a thermal slip with torn ends. Missing price: a red NEEDS A PRICE stamp. Sold out: struck through in the owner's blue pen, 'sold out' written beside it. The item a shopper asks about gets a highlighter swipe. animateIn prints it line by line."
    >
      <Stage label="Prints line by line" minH={640}>
        {(take) => <LiveMenu key={take} animateIn />}
      </Stage>
      <Stage label="Static · sold out + highlight" minH={640}>
        {(take) => (
          <ChalkMenu
            key={take}
            title="Today"
            items={MENU.map((i) => ({ ...i, sold_out: i.id === "banh-mi" }))}
            highlightId="cake"
            className="max-w-[340px]"
          />
        )}
      </Stage>
      <Stage label="Edge cases · long names" minH={520}>
        {(take) => (
          <ChalkMenu
            key={take}
            title="Phở Hà Nội"
            highlightId="dac-biet"
            items={[
              { id: "dac-biet", name: "Phở đặc biệt tái nạm gầu", price_cents: 1650, note: "special beef pho", tags: ["spicy"] },
              { id: "goi", name: "Gỏi cuốn", price_cents: 700, sold_out: true, note: "fresh spring rolls" },
              { id: "tra", name: "Trà đá", price_cents: null },
            ]}
            className="max-w-[320px]"
          />
        )}
      </Stage>
    </Section>
  );
}

export function TagDemos() {
  return (
    <Section
      id="labels"
      title="Price labels"
      intro="Deli-scale labels: the item, the price in heavy type and a real barcode. They land like a sticker being slapped on (SPRING.tag). A missing price gets the red stamp; sold out is struck in the owner's pen."
    >
      <Stage label="Slap on" width="wide" minH={300}>
        {(take) => (
          <div key={take} className="flex flex-wrap items-start justify-center gap-6">
            <PriceTag label="Croissant" price_cents={450} swing />
            <PriceTag label="Chocolate cake" price_cents={1800} swing tilt={4} />
            <PriceTag label="Round loaf" price_cents={null} swing tilt={-5} />
            <PriceTag label="Lemon tart" price_cents={650} variant="sold-out" swing tilt={2} />
          </div>
        )}
      </Stage>
    </Section>
  );
}
