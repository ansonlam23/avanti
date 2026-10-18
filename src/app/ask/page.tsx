import type { Metadata, Viewport } from "next";
import { AskApp } from "@/components/ask/ask-app";
import { InkBackdrop } from "@/components/brand/ink-backdrop";

export const metadata: Metadata = {
  title: "Ask the AI shopper",
  description: "Ask an AI for something from a small shop nearby. It answers from the shop's own menu and holds your order with Visa.",
};

// viewport-fit=cover so the iPhone safe-area insets apply (notch + home bar).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ebe5de",
};

// /ask?q=<prompt> prefills the composer (handy for retakes).
export default async function AskPage({ searchParams }: PageProps<"/ask">) {
  const { q } = await searchParams;
  return (
    <>
      {/* laptops: trees in the side margins; a thin river strip along the bottom, faint behind the chat bar */}
      <InkBackdrop variant="thin" />
      <AskApp initialPrompt={typeof q === "string" ? q.slice(0, 300) : ""} />
    </>
  );
}
