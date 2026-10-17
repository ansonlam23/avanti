"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SimulatedBadge, Stamp, type StampKind } from "@/components/brand";
import { Section, Stage } from "../stage";

const KINDS: StampKind[] = ["VERIFIED", "HELD", "PAID", "RELEASED", "FAILED", "BLOCKED"];

/** Mounts its children after a delay (so each stamp lands on its own beat). */
export function Delayed({ ms, children }: { ms: number; children: ReactNode }) {
  const [show, setShow] = useState(ms === 0);
  useEffect(() => {
    if (ms === 0) return;
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return show ? <>{children}</> : null;
}

export function StampDemos() {
  return (
    <Section
      id="stamps"
      title="Stamps"
      intro="One red ink for every decision: a heavy frame with an inner rule, worn ink, multiplied into the paper. Slam: 0.25 s from scale 1.6 with blur, impact at 70% (thunk), a tiny shake. Each kind rests at its own angle."
    >
      <Stage label="On paper · slam" bg="paper" minH={360}>
        {(take) => (
          <div key={take} className="grid auto-rows-[90px] grid-cols-2 place-items-center gap-x-6 gap-y-3">
            {KINDS.map((k, i) => (
              <Delayed key={k} ms={i * 260}>
                <Stamp kind={k} animate label={k === "VERIFIED" ? "Open Sign Shopper" : undefined} />
              </Delayed>
            ))}
          </div>
        )}
      </Stage>
      <Stage label="Sizes · faded history · honesty badge" bg="paper" minH={360}>
        {(take) => (
          <div key={take} className="flex flex-col items-center gap-7">
            <Stamp kind="VERIFIED" size="lg" label="Open Sign Shopper" animate />
            <div className="flex items-center gap-6">
              <Stamp kind="HELD" size="sm" />
              <Stamp kind="PAID" size="sm" />
              <Stamp kind="HELD" text="Needs a price" size="sm" />
            </div>
            <div className="relative h-20 w-44">
              <Stamp kind="HELD" faded className="absolute left-2 top-2" />
              <Delayed ms={500}>
                <Stamp kind="PAID" animate className="absolute left-9 top-5" />
              </Delayed>
            </div>
            <SimulatedBadge />
          </div>
        )}
      </Stage>
    </Section>
  );
}
