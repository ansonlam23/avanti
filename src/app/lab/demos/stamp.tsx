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
      title="Seals"
      intro="One vermilion ink for every decision: a square, double-ruled seal (a heavy outer rule, a thin inner one) with a slight ink texture, multiplied into the paper. Press: 0.6 s, settling from 1.08x as the ink fades in, a soft thunk at contact. Each kind rests a degree or two off square."
    >
      <Stage label="On paper · press" bg="paper" minH={360}>
        {(take) => (
          <div key={take} className="grid auto-rows-[90px] grid-cols-2 place-items-center gap-x-6 gap-y-3">
            {KINDS.map((k, i) => (
              <Delayed key={k} ms={i * 260}>
                <Stamp kind={k} animate label={k === "VERIFIED" ? "avanti shopper" : undefined} />
              </Delayed>
            ))}
          </div>
        )}
      </Stage>
      <Stage label="Sizes · faded history · honesty badge" bg="paper" minH={360}>
        {(take) => (
          <div key={take} className="flex flex-col items-center gap-7">
            <Stamp kind="VERIFIED" size="lg" label="avanti shopper" animate />
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
