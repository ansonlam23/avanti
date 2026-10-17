"use client";

import { motion } from "motion/react";
import { Camera, ImageUp } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";
import { StepHeading } from "./step-heading";

// Beat 1: Snap your counter. A frame with crop marks on the counter + one
// primary action. On a laptop (no camera): choose a file, drag-and-drop, or a sample.

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
        whileTap={{ scale: 0.99 }}
        aria-label={desktop ? "Choose a photo of your counter" : "Take a photo of your counter"}
        className={cn(
          "relative grid h-[min(40dvh,360px)] min-h-[230px] w-full place-items-center rounded-[3px] transition-colors",
          "lg:aspect-[4/3] lg:h-auto lg:max-h-[min(66dvh,560px)] lg:min-h-0 lg:self-center lg:[grid-area:art]",
          dragging ? "bg-paper/70" : "bg-counter-deep/45 lg:hover:bg-counter-deep/60",
        )}
      >
        {/* crop marks, like a print shop's */}
        {(
          [
            "left-4 top-4 border-l-[3px] border-t-[3px]",
            "right-4 top-4 border-r-[3px] border-t-[3px]",
            "left-4 bottom-4 border-b-[3px] border-l-[3px]",
            "right-4 bottom-4 border-b-[3px] border-r-[3px]",
          ] as const
        ).map((c) => (
          <span key={c} aria-hidden className={cn("absolute size-8 border-ink", c)} />
        ))}
        <span className="flex flex-col items-center gap-3">
          <motion.span
            className="grid size-20 place-items-center rounded-full border-[2.5px] border-ink"
            animate={working ? { scale: [1, 0.92, 1] } : { scale: 1 }}
            transition={working ? { duration: 1.2, repeat: Infinity, ease: EASE.inOut } : undefined}
          >
            {desktop ? <ImageUp className="size-9" aria-hidden /> : <Camera className="size-9" aria-hidden />}
          </motion.span>
          {working || dragging || desktop ? (
            <span className="text-[16px] text-ink-muted">
              {working ? "Developing your photo…" : dragging ? "Drop it here." : "Drop a photo here"}
            </span>
          ) : null}
        </span>
      </motion.button>

      {error || sampleError ? (
        <p role="alert" className="text-[15px] font-bold text-stamp-deep lg:[grid-area:note]">
          {error ?? sampleError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 lg:items-start lg:gap-3 lg:[grid-area:actions]">
        {desktop ? (
          <button type="button" onClick={() => pick(library.current)} disabled={working} className="btn-ink w-full lg:w-auto lg:px-9">
            <ImageUp className="size-6" aria-hidden /> Choose a photo
          </button>
        ) : (
          <>
            <button type="button" onClick={() => pick(camera.current)} disabled={working} className="btn-ink w-full">
              <Camera className="size-6" aria-hidden /> Take photo
            </button>
            <button type="button" onClick={() => pick(library.current)} disabled={working} className="btn-quiet">
              Upload from library
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void loadSample()}
          disabled={working}
          className="btn-quiet flex-col gap-0.5! text-center no-underline! lg:items-start lg:px-0 lg:text-left"
          title={SAMPLE_PHOTO.credit}
        >
          <span className="underline decoration-ink/35 decoration-[1.5px] underline-offset-4">No photo handy? Use a sample bakery</span>
          <span className="text-[14px] text-ink-muted">{SAMPLE_PHOTO.credit}</span>
        </button>
      </div>

      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChange} />
      <input ref={library} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
}
