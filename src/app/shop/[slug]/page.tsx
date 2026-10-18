import type { Metadata } from "next";
import { InkBackdrop } from "@/components/brand/ink-backdrop";
import { CounterApp } from "@/components/counter/counter-app";

export const metadata: Metadata = { title: "Behind the counter", robots: { index: false } };

// Owner dashboard. Data loads client-side with the owner token (see useOwnerToken).
export default async function CounterPage({ params }: PageProps<"/shop/[slug]">) {
  const { slug } = await params;
  return (
    <>
      {/* laptops: trees in the side margins; a thin river strip along the bottom, never behind the counter */}
      <InkBackdrop variant="thin" />
      <CounterApp slug={slug} />
    </>
  );
}
