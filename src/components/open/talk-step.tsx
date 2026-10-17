"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { Keyboard, Mic } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { CounterPhoto } from "./counter-photo";
import { StepHeading } from "./step-heading";
import { useWide } from "./use-wide";
import { MAX_RECORDING_MS, useRecorder, type Recording, type RecorderState } from "./use-recorder";

// Beat 2: Say your prices. Hold-to-talk (tap-to-toggle fallback), 45 s cap,
// an ink ring that breathes with the live mic level, and "Type instead".

const HINT = "“This is Mai's Bakery. Chocolate cake is 18, croissants 4.50, no nuts.”";
const TAP_MS = 350; // shorter than this = a tap → toggle mode
const MIN_MS = 800; // shorter recordings are accidents

export function TalkStep({
  photo,
  startTyping = false,
  onVoice,
  onNotes,
  onRetake,
}: {
  photo: { url: string; width: number; height: number };
  startTyping?: boolean;
  onVoice: (r: Recording) => void;
  onNotes: (notes: string) => void;
  onRetake: () => void;
}) {
  const [typing, setTyping] = useState(startTyping);
  const [notes, setNotes] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const rec = useRecorder((r) => {
    if (r.durationMs < MIN_MS) {
      setTooShort(true);
      return;
    }
    onVoice(r);
  });
  const message = rec.error ?? (tooShort && rec.state === "idle" ? "That was quick. Hold the button while you talk." : null);
  const wide = useWide();

  return (
    // laptop: `contents`, so each piece takes its cell in the scene's two-pane grid (open.css)
    <div className="flex flex-col gap-6 lg:contents">
      <StepHeading step={2} title="Say your prices." sub="Your shop's name, what's here, what it costs." className="lg:[grid-area:head]">
        {wide ? null : (
          <div className="flex shrink-0 flex-col items-center pt-1">
            <CounterPhoto src={photo.url} width={photo.width} height={photo.height} mode="thumb" />
            <button type="button" onClick={onRetake} className="btn-quiet -mb-2 mt-1 px-2 text-[14px]">
              Retake
            </button>
          </div>
        )}
      </StepHeading>

      {/* laptop: the photo you just took, big, on the right (it becomes the one the AI reads) */}
      {wide ? (
        <div className="flex flex-col items-center gap-4 self-center [grid-area:art]">
          <CounterPhoto src={photo.url} width={photo.width} height={photo.height} mode="print" layoutId="counter-photo" />
          <button type="button" onClick={onRetake} className="btn-quiet">
            Retake the photo
          </button>
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {typing ? (
          <motion.div
            key="type"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DUR.micro, ease: EASE.out }}
            className="flex flex-col gap-3 lg:[grid-area:action]"
          >
            <label className="block">
              <span className="label-print mb-2 block text-ink-muted">Your menu, in your words</span>
              <textarea
                autoFocus
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
                placeholder={HINT.replace(/[“”]/g, "")}
                className="field-print block min-h-[160px] resize-none py-3 leading-[1.5]"
              />
            </label>
            <button type="button" onClick={() => onNotes(notes.trim())} className="btn-ink w-full">
              {notes.trim() ? "Read my menu" : "Just use the photo"}
            </button>
            <button type="button" onClick={() => setTyping(false)} className="btn-quiet lg:self-start lg:px-0">
              <Mic className="size-4" aria-hidden /> Use the mic instead
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="talk"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DUR.micro, ease: EASE.out }}
            className="flex flex-col items-center gap-5 lg:items-start lg:[grid-area:action]"
          >
            <p className="max-w-[30ch] text-center text-[16px] leading-relaxed text-ink-muted lg:max-w-[36ch] lg:text-left lg:text-[17px]">{HINT}</p>

            <MicButton
              state={rec.state}
              level={rec.level}
              start={() => {
                setTooShort(false);
                return rec.start();
              }}
              stop={rec.stop}
            >
              <Timer ms={rec.elapsedMs} active={rec.state === "recording"} />
            </MicButton>

            <p aria-live="polite" className={cn("min-h-6 text-center text-[15px] lg:text-left lg:text-[16px]", message ? "font-bold text-stamp-deep" : "text-ink-muted")}>
              {message ?? " "}
            </p>

            <button
              type="button"
              onClick={() => {
                rec.cancel();
                setTyping(true);
              }}
              className="btn-quiet -mt-3 lg:px-0"
            >
              <Keyboard className="size-4" aria-hidden /> Type instead
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The mic key with its label (and, as children, the timer): stacked on a phone, side by side on a laptop. */
function MicButton({
  state,
  level,
  start,
  stop,
  children,
}: {
  state: RecorderState;
  level: MotionValue<number>;
  start: () => Promise<void>;
  stop: () => void;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const pressAt = useRef(0);
  const toggleMode = useRef(false);
  const [toggle, setToggle] = useState(false);
  const live = state === "recording";

  const ringScale = useTransform(level, (v) => 1 + (reduce ? 0 : v * 0.16));
  const ringOpacity = useTransform(level, (v) => 0.25 + v * 0.75);

  const begin = () => {
    pressAt.current = performance.now();
    toggleMode.current = false;
    setToggle(false);
    void start();
  };
  const end = (cancelled: boolean) => {
    if (toggleMode.current) return;
    const held = performance.now() - pressAt.current;
    if (held < TAP_MS || (cancelled && state !== "recording")) {
      toggleMode.current = true; // a tap (or the permission sheet stole the touch): keep listening
      setToggle(true);
      return;
    }
    stop();
  };

  const label =
    state === "requesting" ? "Allow the mic…" : live ? (toggle ? "Tap to finish" : "Release to finish") : "Hold to talk";

  return (
    <div className="flex flex-col items-center gap-3 lg:flex-row lg:gap-8">
      <button
        type="button"
        aria-label={live ? "Stop recording" : "Hold to record your voice note"}
        aria-pressed={live}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          if (live || state === "requesting") {
            if (toggleMode.current) {
              toggleMode.current = false;
              setToggle(false);
              stop();
            }
            return;
          }
          begin();
        }}
        onPointerUp={() => end(false)}
        onPointerCancel={() => end(true)}
        onKeyDown={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          e.preventDefault();
          if (e.repeat) return;
          if (live) stop();
          else if (state === "idle") {
            begin();
            toggleMode.current = true;
            setToggle(true);
          }
        }}
        className="relative grid size-[148px] touch-none select-none place-items-center rounded-full [-webkit-touch-callout:none]"
      >
        {/* the ring breathes with your voice */}
        <motion.span
          aria-hidden
          className="absolute -inset-3 rounded-full border-[3px] border-ink"
          style={{ scale: ringScale, opacity: live ? ringOpacity : 0 }}
        />
        <span
          className={cn(
            "relative grid size-[132px] place-items-center rounded-full bg-ink text-paper shadow-[var(--shadow-key)] transition-transform duration-150",
            live && "scale-95",
          )}
        >
          <Mic className="size-12" aria-hidden />
          {/* the universal recording light */}
          {live ? <span aria-hidden className="absolute right-7 top-7 size-3 rounded-full bg-stamp" /> : null}
        </span>
      </button>
      <div className="flex flex-col items-center gap-5 lg:items-start lg:gap-2">
        <p className="font-display text-[22px] font-extrabold uppercase lg:text-[26px]">{label}</p>
        {children}
      </div>
    </div>
  );
}

function Timer({ ms, active }: { ms: number; active: boolean }) {
  const s = Math.floor(ms / 1000);
  return (
    <p className={cn("-mt-1 flex items-baseline", active ? "text-ink" : "text-ink-muted")} aria-label={`${s} of 45 seconds`}>
      <span className="dot inline-flex text-[34px]">
        <NumberFlow value={Math.floor(s / 60)} locales="en-US" />
        <span>:</span>
        <NumberFlow value={s % 60} locales="en-US" format={{ minimumIntegerDigits: 2 }} trend={1} />
      </span>
      <span className="ml-2 text-[15px] text-ink-muted">/ 0:{String(MAX_RECORDING_MS / 1000).padStart(2, "0")}</span>
    </p>
  );
}
