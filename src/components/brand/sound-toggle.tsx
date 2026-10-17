"use client";

import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { sfx, useSfxMuted } from "./sfx";

/**
 * Global sound on/off (muted by default, remembered on this device).
 * The tap that turns sound on is also the gesture that unlocks audio on iOS.
 */
export function SoundToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const muted = useSfxMuted();
  return (
    <button
      type="button"
      aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Mute sound"}
      title={muted ? "Sound is off. Tap to turn it on." : "Sound is on. Tap to mute."}
      onClick={() => {
        const next = !muted;
        sfx.setMuted(next);
        if (!next) sfx.play("switch", { gain: 0.6 });
      }}
      className={cn(
        "inline-flex h-11 min-w-11 items-center justify-center gap-2 border px-3 text-[13px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200",
        muted ? "border-ink/20 text-ink-muted hover:border-ink/45 hover:text-ink" : "border-carbon bg-carbon text-paper hover:bg-[#124b56]",
        className,
      )}
    >
      {muted ? <VolumeX aria-hidden className="size-5" /> : <Volume2 aria-hidden className="size-5" />}
      {compact ? null : <span>{muted ? "Sound off" : "Sound on"}</span>}
    </button>
  );
}
