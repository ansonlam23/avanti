import type { Metadata } from "next";
import { DemoStage } from "@/components/demo/demo-stage";
import { hasGemini, paymentMode } from "@/lib/env";

export const metadata: Metadata = { title: "Both sides", robots: { index: false } };

// Owner (left) + shopper (right) side by side at phone size, for recording.
// /demo?shop=<slug> — the owner pane uses the owner token already saved in
// this browser (open the owner link once first). The honesty line follows
// this deployment's real payment mode and AI status.
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const { shop } = await searchParams;
  return <DemoStage slug={typeof shop === "string" ? shop : ""} payments={paymentMode()} aiLive={hasGemini()} />;
}
