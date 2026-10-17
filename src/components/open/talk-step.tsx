"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { ArrowLeft, ArrowRight, Mic } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DUR, EASE } from "@/lib/motion";
import { CounterPhoto } from "./counter-photo";
import { StepHeading } from "./step-heading";
import { useWide } from "./use-wide";
import { MAX_RECORDING_MS, useRecorder, type Recording, type RecorderState } from "./use-recorder";
import { Waveform } from "./waveform";

// Beat 2: Say your prices. Hold-to-talk (tap-to-toggle fallback), 45 s cap,
// a square ink frame that breathes with the live mic level, the waveform
// drawing itself while you talk, and "Type instead".

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
            <button type="button" onClick={onRetake} className="btn-quiet -mb-2 mt-1 px-2 text-[15px]">
              Retake
            </button>
          </div>
        )}
      </StepHeading>

      {/* laptop: the photo you just took, big, on the right (it becomes the one the AI reads) */}
      {wide ? (
        <div className="flex flex-col items-center gap-5 self-center [grid-area:art]">
          <CounterPhoto src={photo.url} width={photo.width} height={photo.height} mode="print" layoutId="counter-photo" />
          <button type="button" onClick={onRetake} className="btn-quiet text-ink-muted">
            <ArrowLeft className="size-4" aria-hidden /> Retake the photo
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
            className="flex flex-col gap-4 lg:[grid-area:action]"
          >
            <label className="block">
              <span className="label-print mb-2 block text-ink-muted">Your menu, in your words</span>
              <textarea
                autoFocus
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
                placeholder={HINT.replace(/[“”]/g, "")}
                className="field-print block min-h-[168px] resize-none py-3 leading-[1.55]"
              />
            </label>
            <button type="button" onClick={() => onNotes(notes.trim())} className="btn-ink w-full justify-between!">
              {notes.trim() ? "Read my menu" : "Just use the photo"} <ArrowRight className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={() => setTyping(false)} className="link-ink self-center text-[19px]! lg:self-start">
              Use the mic instead <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="talk"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DUR.micro, ease: EASE.out }}
            className="flex flex-col gap-6 lg:gap-8 lg:[grid-area:action]"
          >
            <blockquote className="border-l-2 border-carbon/40 pl-4 text-[17px] leading-relaxed text-ink lg:max-w-[40ch] lg:text-[18px]">
              {HINT}
            </blockquote>

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

            <div className="-mt-3 flex flex-col items-center gap-1 lg:items-start">
              <p
                aria-live="polite"
                className={cn("min-h-6 text-center text-[16px] lg:text-left", message ? "font-semibold text-stamp-deep" : "text-ink-muted")}
              >
                {message ?? " "}
              </p>
              <button
                type="button"
                onClick={() => {
                  rec.cancel();
                  setTyping(true);
                }}
                className="link-ink text-[19px]!"
              >
                Type instead <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The mic key with its label, waveform and timer: stacked on a phone, side by side on a laptop. */
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

  const frameScale = useTransform(level, (v) => 1 + (reduce ? 0 : v * 0.1));
  const frameOpacity = useTransform(level, (v) => 0.3 + v * 0.7);

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
    <div className="flex flex-col items-center gap-5 lg:flex-row lg:items-center lg:gap-9">
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
        className="group relative grid size-[124px] shrink-0 touch-none select-none place-items-center [-webkit-touch-callout:none] lg:size-[116px]"
      >
        {/* a square frame that breathes with your voice */}
        <motion.span
          aria-hidden
          className="absolute -inset-3 border-[1.5px] border-carbon"
          style={{ scale: frameScale, opacity: live ? frameOpacity : 0 }}
        />
        <span
          className={cn(
            "relative grid size-full place-items-center text-paper transition-[background-color,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
            live ? "scale-[0.96] bg-ink" : "bg-carbon group-hover:bg-[#124b56]",
          )}
        >
          <Mic className="size-11" strokeWidth={1.4} aria-hidden />
          {/* the universal recording light */}
          {live ? <span aria-hidden className="absolute right-3.5 top-3.5 size-2 bg-stamp" /> : null}
        </span>
      </button>
      <div className="flex w-full max-w-[300px] flex-col items-center gap-2.5 lg:max-w-[280px] lg:gap-3 lg:items-start">
        <p className="font-display text-[24px] leading-none lg:text-[26px]">{label}</p>
        <Waveform level={level} live={live} className="h-10" />
        {children}
      </div>
    </div>
  );
}

function Timer({ ms, active }: { ms: number; active: boolean }) {
  const s = Math.floor(ms / 1000);
  return (
    <p className="flex items-baseline font-mono text-[18px] font-medium tabular-nums leading-none" aria-label={`${s} of 45 seconds`}>
      <span className={cn("inline-flex items-baseline", active ? "text-ink" : "text-ink-muted")}>
        <NumberFlow value={Math.floor(s / 60)} locales="en-US" />
        <span>:</span>
        <NumberFlow value={s % 60} locales="en-US" format={{ minimumIntegerDigits: 2 }} trend={1} />
      </span>
      <span className="ml-2 text-ink-muted">/ 0:{String(MAX_RECORDING_MS / 1000).padStart(2, "0")}</span>
    </p>
  );
}
