"use client";

import { useState } from "react";
import { OpenSign, type NeonState, type NeonTone } from "@/components/brand";
import { Pill, Section, Stage } from "../stage";

/** A sign you can drive through all four states. */
function DrivenSign({
  text,
  tone,
  size,
  spill,
  mount,
}: {
  text?: string;
  tone?: NeonTone;
  size?: "sm" | "md" | "lg" | "xl";
  spill?: boolean;
  mount?: "plate" | "bare";
}) {
  const [state, setState] = useState<NeonState>("flickering-on");
  const [run, setRun] = useState(0);
  const [lit, setLit] = useState(0);
  return (
    <div className="flex flex-col items-center gap-6">
      <OpenSign
        key={run}
        text={text}
        tone={tone}
        size={size}
        spill={spill}
        mount={mount}
        state={state}
        onLit={() => setLit((n) => n + 1)}
      />
      <div className="relative z-10 flex flex-wrap justify-center gap-2">
        <Pill
          onClick={() => {
            setRun((r) => r + 1);
            setState("flickering-on");
          }}
        >
          Print
        </Pill>
        <Pill onClick={() => setState("sputtering-off")}>Tear away</Pill>
        <Pill onClick={() => setState("on")} active={state === "on"}>
          On
        </Pill>
        <Pill onClick={() => setState("off")} active={state === "off"}>
          Off
        </Pill>
      </div>
      <p className="label-print relative z-10 text-ink-muted" aria-live="polite">
        state {state} · onLit ×{lit}
      </p>
    </div>
  );
}

export function SignDemos() {
  return (
    <Section
      id="sign"
      title="OPEN sign"
      intro="A thermal printer feeds a slip out of its slot in 9 steps (with the print head's jitter), a reverse-printed black block with OPEN in white; then the slip is torn at the cutter and swings to rest (onLit fires). Tear away = the slip drops off and falls. Off = no paper."
    >
      <Stage label="Hero · xl · on the counter" width="wide" minH={520}>
        {(take) => <DrivenSign key={take} size="xl" spill />}
      </Stage>
      <Stage label="Phone · lg" minH={420}>
        {(take) => <DrivenSign key={take} size="lg" />}
      </Stage>
      <Stage label="Bare slip · md · shop name" minH={360}>
        {(take) => <DrivenSign key={take} text="Mai's Bakery" size="md" mount="bare" />}
      </Stage>
      <Stage label="Sizes · off and on" minH={420}>
        {(take) => (
          <div key={take} className="flex flex-col items-center gap-6">
            <div className="flex items-center gap-5">
              <OpenSign size="sm" mount="bare" state="off" />
              <OpenSign size="sm" mount="bare" state="on" />
            </div>
            <div className="flex items-start gap-5">
              <OpenSign size="md" state="off" />
              <OpenSign size="md" state="on" />
            </div>
            <OpenSign size="md" text="Ask AI" tone="ai" mount="bare" state="on" />
          </div>
        )}
      </Stage>
      <Stage label="In context · counter header" minH={200}>
        {(take) => <HeaderMock key={take} />}
      </Stage>
    </Section>
  );
}

/** How the small slip sits in the owner's header (mirrors /shop/[slug]). */
function HeaderMock() {
  const [open, setOpen] = useState(true);
  return (
    <div className="w-full max-w-md">
      <header className="flex items-center gap-4">
        <OpenSign size="sm" mount="bare" state={open ? "flickering-on" : "off"} />
        <h1 className="truncate font-display text-[30px] font-extrabold uppercase leading-none">Mai&apos;s Bakery</h1>
      </header>
      <div className="mt-6 flex justify-center">
        <Pill onClick={() => setOpen((o) => !o)}>{open ? "Close the shop" : "Open the shop"}</Pill>
      </div>
    </div>
  );
}
