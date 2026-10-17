import type { Metadata } from "next";
import { Chooser } from "@/components/start/chooser";

export const metadata: Metadata = {
  title: "Start",
  description: "Shopping, or the shop? Ask avanti's AI shopper for anything nearby, or open your shop to AI shoppers in a minute.",
};

// "get started" lands here: are you shopping (→ /ask) or the shop (→ /open)?
export default function StartPage() {
  return <Chooser />;
}
