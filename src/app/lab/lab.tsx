"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { APP_BAR, AppLogo, SoundToggle } from "@/components/brand";
import { motionSpeed } from "@/lib/motion";
import { MenuDemos, TagDemos } from "./demos/chalk";
import { BotWallDemos, FocusDemos, SoundDemos, SpindleDemos } from "./demos/door";
import { SignDemos } from "./demos/neon";
import { ReceiptDemos } from "./demos/receipt";
import { StampDemos } from "./demos/stamp";
import { ShotView, SHOTS } from "./shots";

const SECTIONS = [
  { id: "sign", label: "Shop sign" },
  { id: "menu", label: "Menu card" },
  { id: "labels", label: "Price labels" },
  { id: "receipt", label: "Receipt" },
  { id: "stamps", label: "Seals" },
  { id: "spindle", label: "Turned away" },
  { id: "bots", label: "Door log" },
  { id: "focus", label: "Focus reveal" },
  { id: "sounds", label: "Sounds" },
];

const SPEEDS = [0.25, 0.5, 1, 2];

export function Lab({ shot }: { shot: string | null }) {
  if (shot) return <ShotView name={shot} />;
  return (
    <>
    {/* the avanti logo home, in /start's spot like every page */}
    <div className={APP_BAR}>
      <AppLogo />
    </div>
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-8">
      <header className="flex flex-wrap items-center gap-3 py-6">
        <div className="mr-auto">
          <h1 className="font-display text-[44px] leading-none">Design lab</h1>
        </div>
        <SpeedPicker />
        <SoundToggle />
      </header>

      <nav aria-label="Sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex h-11 items-center px-3 text-[16px] font-medium text-ink-muted underline decoration-transparent underline-offset-[6px] transition-colors duration-300 hover:text-ink hover:decoration-current"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="paper mt-6 p-6 shadow-slip">
        <p className="label-print text-[13px] text-ink-muted">Shots for recording</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {Object.entries(SHOTS).map(([name, s]) => (
            <li key={name}>
              <Link
                href={`/lab?shot=${name}`}
                className="inline-flex h-11 items-center border border-ink/40 px-3 font-mono text-[14px] text-ink transition-colors hover:border-carbon hover:bg-carbon hover:text-paper"
                title={s.title}
              >
                ?shot={name}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[15px] text-ink-muted">
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
    </>
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
          className="inline-flex h-11 min-w-11 items-center justify-center border border-transparent px-2 font-mono text-[14px] text-ink-muted hover:border-ink/30 aria-[current=true]:border-carbon aria-[current=true]:bg-carbon aria-[current=true]:text-paper"
        >
          {s}×
        </a>
      ))}
    </div>
  );
}
