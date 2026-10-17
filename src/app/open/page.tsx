import type { Metadata } from "next";
import { OpenFlow, type Shot } from "@/components/open/open-flow";

export const metadata: Metadata = {
  title: "Open in 40 seconds",
  description: "Snap your counter, say your prices, turn on your sign. Your shop is open to people and AI shoppers.",
};

const SHOTS: readonly Shot[] = ["tags", "review", "live"];

export default async function OpenPage(props: PageProps<"/open">) {
  const q = await props.searchParams;
  // ?shot= replays a beat from the last REAL run in this tab (retakes); dev only.
  const raw = typeof q.shot === "string" ? q.shot : null;
  const shot = process.env.NODE_ENV === "development" && raw && (SHOTS as readonly string[]).includes(raw) ? (raw as Shot) : null;
  return <OpenFlow shot={shot} />;
}
