"use client";

import { Camera, ImageUp, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { StepHeading } from "./step-heading";

// Beat 1: Snap your counter. A paper frame with teal corner brackets + one
// primary action. On a laptop (no camera): choose a file, drop one on the
// frame, or try the sample bakery.

/** A real, freely licensed counter photo for people trying the demo without one (the AI still reads it live). */
const SAMPLE_PHOTO = {
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/The_Bakery_off_Augusta.jpg/1280px-The_Bakery_off_Augusta.jpg",
  credit: "“The Bakery off Augusta”, Greenville Daily Photo, CC0",
};

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
function subscribePointer(cb: () => void) {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useDesktop = () =>
  useSyncExternalStore(
    subscribePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );

const CORNERS = ["tl", "tr", "bl", "br"] as const;

export function SnapStep({
  busy,
  error,
  onFirstTap,
  onFile,
}: {
  busy: boolean;
  error: string | null;
  onFirstTap: () => void;
  onFile: (file: File) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const desktop = useDesktop();
  const [dragging, setDragging] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const pick = (input: HTMLInputElement | null) => {
    onFirstTap();
    input?.click();
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  };
  const loadSample = async () => {
    onFirstTap();
    setSampleError(null);
    setLoadingSample(true);
    try {
      const res = await fetch(SAMPLE_PHOTO.url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      onFile(new File([blob], "sample-counter.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      setSampleError("Couldn't load the sample. Any photo of food works, too.");
    } finally {
      setLoadingSample(false);
    }
  };

  const working = busy || loadingSample;
  const Icon = desktop ? ImageUp : Camera;

  return (
    // laptop: `contents`, so each piece takes its cell in the scene's two-pane grid (open.css)
    <div className="flex flex-col gap-6 lg:contents">
      <StepHeading step={1} title="Snap your counter." sub="One photo of what you're selling today." className="lg:[grid-area:head]" />

      <motion.button
        type="button"
        onClick={() => pick(desktop ? library.current : camera.current)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
          if (file) {
            onFirstTap();
            onFile(file);
          }
        }}
        disabled={working}
        whileTap={{ scale: 0.995 }}
        data-drag={dragging || undefined}
        data-busy={working || undefined}
        aria-label={desktop ? "Choose a photo of your counter" : "Take a photo of your counter"}
        className={cn(
          "open-frame relative grid h-[min(40dvh,340px)] min-h-[220px] w-full place-items-center",
          "lg:aspect-[4/3] lg:h-auto lg:max-h-[min(64dvh,540px)] lg:min-h-0 lg:self-center lg:[grid-area:art]",
        )}
      >
        {/* a viewfinder's corners: they draw in when a photo is on its way */}
        {CORNERS.map((c) => (
          <span key={c} aria-hidden data-c={c} className="open-corner" />
        ))}
        <span className="flex flex-col items-center gap-4 px-8 text-center">
          <Icon className={cn("size-10 text-carbon", working && "open-pulse")} strokeWidth={1.25} aria-hidden />
          <span className="text-[16px] text-ink-muted lg:text-[17px]">
            {working ? "Developing your photo…" : dragging ? "Drop it here." : desktop ? "Drop a photo here" : "Tap to open the camera"}
          </span>
        </span>
      </motion.button>

      {error || sampleError ? (
        <p role="alert" className="text-[16px] font-semibold text-stamp-deep lg:[grid-area:note]">
          {error ?? sampleError}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-3 lg:items-start lg:gap-5 lg:[grid-area:actions]">
        {desktop ? (
          <button type="button" onClick={() => pick(library.current)} disabled={working} className="btn-ink w-full lg:w-auto lg:min-w-[260px]">
            Choose a photo
          </button>
        ) : (
          <>
            <button type="button" onClick={() => pick(camera.current)} disabled={working} className="btn-ink w-full">
              Take a photo
            </button>
            <button type="button" onClick={() => pick(library.current)} disabled={working} className="btn-quiet">
              Upload from library
            </button>
          </>
        )}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <span className="flex flex-wrap items-center justify-center gap-x-3 lg:justify-start">
            <span className="text-[16px] text-ink-muted">No photo handy?</span>
            <button type="button" onClick={() => void loadSample()} disabled={working} className="link-ink text-[19px]!" title={SAMPLE_PHOTO.credit}>
              Use a sample bakery <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
            </button>
          </span>
          <span className="text-[15px] text-ink-muted">{SAMPLE_PHOTO.credit}</span>
        </div>
      </div>

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChange} />
      <input ref={library} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
}
