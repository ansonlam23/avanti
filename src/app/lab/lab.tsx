"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SoundToggle } from "@/components/brand";
import { motionSpeed } from "@/lib/motion";
import { MenuDemos, TagDemos } from "./demos/chalk";
import { BotWallDemos, FocusDemos, SoundDemos, SpindleDemos } from "./demos/door";
import { SignDemos } from "./demos/neon";
import { ReceiptDemos } from "./demos/receipt";
import { StampDemos } from "./demos/stamp";
import { ShotView, SHOTS } from "./shots";

const SECTIONS = [
  { id: "sign", label: "OPEN sign" },
  { id: "menu", label: "Menu slip" },
  { id: "labels", label: "Price labels" },
  { id: "receipt", label: "Receipt" },
  { id: "stamps", label: "Stamps" },
  { id: "spindle", label: "Spindle" },
  { id: "bots", label: "Door log" },
  { id: "focus", label: "Focus reveal" },
  { id: "sounds", label: "Sounds" },
];

const SPEEDS = [0.25, 0.5, 1, 2];

export function Lab({ shot }: { shot: string | null }) {
  if (shot) return <ShotView name={shot} />;
  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-8">
      <header className="flex flex-wrap items-center gap-3 py-6">
        <div className="mr-auto">
          <p className="label-print text-ink-muted">Open Sign</p>
          <h1 className="font-display text-[44px] font-black uppercase leading-none">Design lab</h1>
        </div>
        <SpeedPicker />
        <SoundToggle />
      </header>

      <nav aria-label="Sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex h-11 items-center rounded-[3px] px-3 text-[14px] font-bold uppercase tracking-[0.05em] underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="paper mt-6 rounded-[3px] p-5 shadow-slip">
        <p className="label-print text-ink-muted">Shots for recording</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {Object.entries(SHOTS).map(([name, s]) => (
            <li key={name}>
              <Link
                href={`/lab?shot=${name}`}
                className="inline-flex h-11 items-center rounded-[3px] border-2 border-ink px-3 text-[14px] hover:bg-ink hover:text-paper"
                title={s.title}
              >
                ?shot={name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[14px] text-ink-muted">
          A shot plays after a short pre-roll. Click, Space or R replays; M toggles sound. Add{" "}
          <code className="text-ink">&amp;speed=0.5</code> for slow motion.
        </p>
      </div>

      <SignDemos />
      <MenuDemos />
      <TagDemos />
      <ReceiptDemos />
      <StampDemos />
      <SpindleDemos />
      <BotWallDemos />
      <FocusDemos />
      <SoundDemos />
    </main>
  );
}

const noSubscribe = () => () => {};

function SpeedPicker() {
  const speed = useSyncExternalStore(noSubscribe, motionSpeed, () => null);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Animation speed">
      {SPEEDS.map((s) => (
        <a
          key={s}
          href={s === 1 ? "/lab" : `/lab?speed=${s}`}
          aria-current={speed === s ? "true" : undefined}
          className="inline-flex h-11 min-w-11 items-center justify-center rounded-[3px] px-2 text-[14px] text-ink-muted aria-[current=true]:bg-ink aria-[current=true]:text-paper"
        >
          {s}×
        </a>
      ))}
    </div>
  );
}
