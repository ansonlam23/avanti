"use client";

import { useState } from "react";
import { BotWall, ClosedSign, FocusReveal, Receipt, sfx, SoundToggle, Stamp, type SfxName } from "@/components/brand";
import type { BlockReason } from "@/lib/types";
import { Pill, Section, Stage } from "../stage";
import { ORDER } from "./receipt";

const REASONS: BlockReason[] = ["unsigned", "unknown_agent", "replayed", "digest_mismatch", "bad_signature", "expired"];

/** A deterministic attack: n bots spread over the reasons. */
export function attack(prev: Partial<Record<BlockReason, number>>, n: number) {
  const next = { ...prev };
  for (let i = 0; i < n; i++) {
    const r = REASONS[(i * 5 + (i >> 2)) % REASONS.length];
    next[r] = (next[r] ?? 0) + 1;
  }
  return next;
}

function LiveSpindle() {
  const [flips, setFlips] = useState(0);
  const [reason, setReason] = useState<BlockReason>("replayed");
  const bump = (n: number) => {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        setReason(REASONS[i % REASONS.length]);
        setFlips((f) => f + 1);
      }, i * 45);
    }
  };
  return (
    <div className="flex flex-col items-center gap-5">
      <ClosedSign flips={flips} reason={reason} face="open" />
      <div className="flex flex-wrap justify-center gap-2">
        <Pill onClick={() => bump(1)}>+1 bot</Pill>
        <Pill onClick={() => bump(10)}>+10</Pill>
        <Pill onClick={() => bump(50)}>+50</Pill>
      </div>
      <p className="label-print text-ink-muted">spiked {flips}</p>
    </div>
  );
}

export function SpindleDemos() {
  return (
    <Section
      id="spindle"
      title="Spindle"
      intro="Every blocked request prints a small REJECTED slip with a red VOID stamp and its reason, and it drops down the steel spike onto the pile (a slap + a steel tick). The newest reason is always on top."
    >
      <Stage label="Live · one slip per bot" minH={380}>
        {(take) => <LiveSpindle key={take} />}
      </Stage>
      <Stage label="Static · landing illustration" minH={300}>
        {(take) => <ClosedSign key={take} pile={["unsigned", "digest_mismatch", "replayed"]} />}
      </Stage>
    </Section>
  );
}

function LiveBotWall() {
  const [blocked, setBlocked] = useState(0);
  const [reasons, setReasons] = useState<Partial<Record<BlockReason, number>>>({});
  const hit = (n: number) => {
    setReasons((r) => attack(r, n));
    setBlocked((b) => b + n);
  };
  return (
    <div className="flex w-full flex-col items-center gap-5">
      <BotWall blocked={blocked} reasons={reasons} reachedVisa={0} verified={3} />
      <div className="flex flex-wrap justify-center gap-2">
        <Pill onClick={() => hit(50)}>Send 50 bots</Pill>
        <Pill onClick={() => hit(1)}>+1</Pill>
      </div>
    </div>
  );
}

export function BotWallDemos() {
  return (
    <Section
      id="bots"
      title="Door log"
      intro="The bot attack as a Z-report: slips pile up on the spindle, TURNED AWAY ticks up, the reason lines update, and the hero number never moves: REACHED VISA 0. Numbers come from props (the real door log); 50 bots play in ≈2.2 s."
    >
      <Stage label="Phone · send an attack" minH={780}>
        {(take) => <LiveBotWall key={take} />}
      </Stage>
    </Section>
  );
}

function FocusDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <FocusReveal
        open={open}
        onDismiss={() => setOpen(false)}
        eyebrow="Order verified"
        title="Signed by a known agent"
        object={(cue) => (
          <div className="paper rounded-[2px] px-7 py-6 shadow-[var(--shadow-lift)]">
            <p className="label-print text-ink-muted">Signed request</p>
            <p className="mt-1 font-display text-[26px] font-extrabold uppercase leading-none">Open Sign Shopper</p>
            <Stamp kind="VERIFIED" size="lg" animate={cue} className="mt-4" />
          </div>
        )}
        card={<p>Checked before anything else. Then Visa was asked for a hold.</p>}
        className="h-[640px] w-full max-w-[390px] rounded-[6px]"
      >
        <div className="flex h-full flex-col items-center gap-4 bg-counter p-5">
          <Receipt {...ORDER} mode="sandbox" status="held" />
        </div>
      </FocusReveal>
      <Pill onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Open the focus reveal"}</Pill>
    </div>
  );
}

export function FocusDemos() {
  return (
    <Section
      id="focus"
      title="Focus reveal"
      intro="One reusable focus pull for big moments: the counter pushes in, the room dims → eyebrow 0.4 s → title 0.6 s → the tilted paper object 0.9 s (a stamp can land exactly on that beat) → the supporting slip from 1.1 s."
    >
      <Stage label="VERIFIED over the counter" minH={720}>
        {(take) => <FocusDemo key={take} />}
      </Stage>
    </Section>
  );
}

const SOUNDS: { name: SfxName; label: string; opts?: { duration?: number } }[] = [
  { name: "printer", label: "Printer", opts: { duration: 1 } },
  { name: "tear", label: "Tear" },
  { name: "stamp", label: "Stamp" },
  { name: "spike", label: "Spike" },
  { name: "doorbell", label: "Doorbell" },
  { name: "switch", label: "Switch" },
];

export function SoundDemos() {
  return (
    <Section
      id="sounds"
      title="Sounds"
      intro="Synthesized with Web Audio (no files). Muted by default and remembered on this device; nothing plays before the first tap. On iPhone the first tap unlocks audio and asks for the playback session (so the silent switch doesn't mute it)."
    >
      <Stage label="Sound kit" minH={220}>
        {() => (
          <div className="flex flex-col items-center gap-4">
            <SoundToggle />
            <div className="flex flex-wrap justify-center gap-2">
              {SOUNDS.map((s) => (
                <Pill key={s.name} onClick={() => sfx.play(s.name, s.opts)}>
                  {s.label}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </Stage>
    </Section>
  );
}
