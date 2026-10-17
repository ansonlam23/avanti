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
        "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-[3px] px-3 text-[14px] font-bold uppercase tracking-[0.08em] transition active:scale-95",
        muted ? "text-ink-muted hover:bg-ink/[0.06]" : "bg-ink text-paper",
        className,
      )}
    >
      {muted ? <VolumeX aria-hidden className="size-5" /> : <Volume2 aria-hidden className="size-5" />}
      {compact ? null : <span>{muted ? "Sound off" : "Sound on"}</span>}
    </button>
  );
}
