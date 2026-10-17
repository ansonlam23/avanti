import type { Metadata } from "next";
import { Lab } from "./lab";

export const metadata: Metadata = { title: "Design lab", robots: { index: false } };

// Every brand component in every state, with replay buttons.
//   /lab                 the whole lab
//   /lab?shot=<name>     one moment, full screen, for clean screen recordings
//                        (auto-plays; click / Space / R replays; M toggles sound)
//   ?speed=0.5           slows every token-based animation for retakes
export default async function LabPage({ searchParams }: PageProps<"/lab">) {
  const { shot } = await searchParams;
  return <Lab shot={typeof shot === "string" ? shot : null} />;
}
