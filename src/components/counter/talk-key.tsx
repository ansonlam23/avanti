"use client";

import { ArrowRight, Mic } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { sec } from "@/components/brand/motion-prefs";
import { INK_EASE } from "@/components/open/ink";
import { cn } from "@/lib/utils";
import { holdSpeech, speakLine } from "./speak";
import { useCanListen, useListen } from "./use-listen";
import { useWide } from "./use-wide";
import "./voice.css";

export interface VoiceReply {
  /** done: saved · same: nothing to change · miss: not understood · error: not saved · ask: which item? */
  tone: "done" | "same" | "miss" | "error" | "ask";
  /** Said aloud (when sound is on) and shown. */
  line: string;
  /** A second toast line, never spoken. */
  note?: string;
  /** For "ask": the items to pick from. */
  choices?: { id: string; label: string }[];
}

type Phase = "idle" | "listening" | "working" | "typing" | "asking";
type Via = "voice" | "typed" | "tap";

const MIC_TROUBLE = new Map([
  ["not-allowed", "The microphone is blocked for this page."],
  ["service-not-allowed", "Voice is turned off in this browser."],
  ["audio-capture", "No microphone found."],
  ["network", "Voice isn’t available right now."],
]);

/**
 * The counter's Talk key: tap, say "we're out of croissants", and the counter
 * does it and says so. The words appear live in the owner's brush while it
 * listens; it stops on silence or a second tap. Browsers without speech
 * recognition (Firefox) get a small "Type a command" box that does the same.
 * Replies are a toast plus the counter's voice (when sound is on); a question
 * ("Which one?") or a typing slip stays open in the slip under the key.
 */
export function TalkKey({
  example,
  onCommand,
  onChoose,
}: {
  /** An item from this menu, as the owner would say it ("almond croissants"). */
  example: string;
  onCommand: (readings: string[]) => Promise<VoiceReply>;
  /** The owner tapped one of the "Which one?" choices. */
  onChoose: (itemId: string) => Promise<VoiceReply>;
}) {
  const wide = useWide();
  const canListen = useCanListen();
  // Phones: replies toast at the bottom, so they never cover the keys (the top bar is the whole width there).
  const at = wide ? undefined : ({ position: "bottom-center" } as const);
  const [phase, setPhaseState] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  /** Bumped whenever listening starts: a "listen after asking" from an older question is stale. */
  const listenSeq = useRef(0);
  const [mode, setMode] = useState<"voice" | "typed">("voice");
  const [heard, setHeard] = useState("");
  const [settled, setSettled] = useState(false);
  const [inline, setInline] = useState<string | null>(null);
  const [choices, setChoices] = useState<NonNullable<VoiceReply["choices"]>>([]);
  /** What the owner said that led to "Which one?" (shown while they answer). */
  const [asked, setAsked] = useState("");
  const [text, setText] = useState("");
  const keyRef = useRef<HTMLButtonElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const listen = useListen({
    onWords: (words, final) => {
      setHeard(words);
      setSettled(final);
    },
    onDone: (readings) => {
      if (!readings.length) return present({ tone: "miss", line: "I didn’t hear anything." }, "voice");
      void run(readings, "voice");
    },
    onError: (code) => {
      holdSpeech(false);
      toast(`${MIC_TROUBLE.get(code) ?? "Voice isn’t working here."} Type a command instead.`, at);
      openTyping();
    },
  });

  function begin(keepChoices = false) {
    listenSeq.current += 1;
    holdSpeech(true); // the counter goes quiet so the mic hears only the owner
    setMode("voice");
    setHeard("");
    setSettled(false);
    setInline(null);
    if (!keepChoices) {
      setChoices([]);
      setAsked("");
    }
    if (!listen.start()) {
      holdSpeech(false);
      openTyping();
      return;
    }
    setPhase("listening");
  }

  function openTyping() {
    setMode("typed");
    setInline(null);
    setChoices([]);
    setAsked("");
    setPhase("typing");
  }

  function close() {
    listen.cancel();
    holdSpeech(false);
    setPhase("idle");
    setHeard("");
    setSettled(false);
    setInline(null);
    setChoices([]);
    setAsked("");
    setText("");
  }

  async function run(readings: string[], via: Via) {
    setPhase("working");
    let reply: VoiceReply;
    try {
      reply = await onCommand(readings);
    } catch {
      reply = { tone: "error", line: "That didn’t save. Try again." };
    }
    present(reply, via, readings[0]);
  }

  async function choose(id: string) {
    listen.cancel();
    setPhase("working");
    let reply: VoiceReply;
    try {
      reply = await onChoose(id);
    } catch {
      reply = { tone: "error", line: "That didn’t save. Try again." };
    }
    present(reply, "tap");
  }

  function present(reply: VoiceReply, via: Via, said = "") {
    if (reply.tone === "ask") {
      setChoices(reply.choices ?? []);
      setAsked(said);
      setPhase("asking");
      // Hands-free: ask aloud, then listen once for the answer (if nobody tapped or talked meanwhile).
      const seq = listenSeq.current;
      const listenAfter = () => {
        if (phaseRef.current === "asking" && listenSeq.current === seq) begin(true);
      };
      speakLine(reply.line, via === "voice" && canListen ? listenAfter : undefined);
      holdSpeech(false);
      return;
    }
    if (via === "typed" && (reply.tone === "miss" || reply.tone === "error")) {
      // keep the box open, the reason under it, the words ready to fix
      setInline(reply.line);
      setPhase("typing");
      speakLine(reply.line);
      holdSpeech(false);
      return;
    }
    if (reply.tone === "done") toast.success(reply.line, { ...at, description: reply.note });
    else if (reply.tone === "error") toast.error(reply.line, at);
    else toast(reply.line, at);
    speakLine(reply.line);
    close();
  }

  function onKey() {
    if (phase === "listening") return listen.stop(); // a second tap: what was said so far is the command
    if (phase === "working") return;
    if (phase === "typing") return close();
    if (phase === "asking") return canListen ? begin(true) : close();
    if (canListen) begin();
    else openTyping();
  }

  function submitTyped() {
    const t = text.trim();
    if (!t || phase === "working") return;
    setHeard(t);
    void run([t], "typed");
  }

  // Escape closes; a tap outside closes a typing box or a question (never the mic mid-sentence).
  const onWindowKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    close();
    keyRef.current?.focus();
  });
  const onWindowDown = useEffectEvent((e: PointerEvent) => {
    if (phase !== "typing" && phase !== "asking") return;
    const t = e.target as Node;
    if (slipRef.current?.contains(t) || keyRef.current?.contains(t)) return;
    close();
  });
  const open = phase !== "idle";
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => onWindowKey(e);
    const down = (e: PointerEvent) => onWindowDown(e);
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", down);
    };
  }, [open]);

  useEffect(() => {
    if (phase === "typing") inputRef.current?.focus();
  }, [phase]);
  useEffect(() => {
    if (inline) inputRef.current?.select();
  }, [inline]);

  const listening = phase === "listening";
  const typingView = phase === "typing" || (phase === "working" && mode === "typed" && !choices.length);
  const hint = `Try “we’re out of ${example}”`;
  const label = phase === "working" ? "Saving…" : choices.length ? "Which one?" : wide ? null : "Listening";
  const typeInstead = (
    <button
      type="button"
      onClick={() => {
        listen.cancel();
        holdSpeech(false);
        openTyping();
      }}
      className="btn-quiet -my-2.5 -mr-3 shrink-0 px-3 text-[15px]! text-ink-muted"
    >
      Type instead
    </button>
  );

  return (
    <>
      <button
        ref={keyRef}
        type="button"
        onClick={onKey}
        data-listening={listening || undefined}
        aria-pressed={listening}
        aria-expanded={open}
        aria-label={listening ? "Stop listening" : phase === "working" ? "Saving" : canListen ? "Talk to the counter" : "Type a command"}
        aria-busy={phase === "working" || undefined}
        title={listening ? "Listening. Tap to stop." : `Say a command, like “we’re out of ${example}”`}
        className={cn(
          "voice-key inline-flex h-11 min-w-11 items-center justify-center gap-2 border px-3 font-sans text-[13px] font-semibold uppercase tracking-[0.12em] transition-colors duration-200",
          listening || phase === "working"
            ? "border-carbon bg-carbon text-paper hover:bg-[#124b56]"
            : open
              ? "border-carbon text-carbon"
              : "border-ink/25 text-ink hover:border-ink/55",
        )}
      >
        {wide ? (
          // "Talk" ↔ "Listening" without the bar shifting: the cell keeps the longer word's width
          <span className="grid items-center justify-items-center">
            <span className="col-start-1 row-start-1 inline-flex items-center gap-2">
              <Mic aria-hidden className="size-5" strokeWidth={1.75} />
              {listening ? "Listening" : "Talk"}
            </span>
            <span aria-hidden className="invisible col-start-1 row-start-1 inline-flex items-center gap-2">
              <Mic className="size-5" />
              Listening
            </span>
          </span>
        ) : (
          <Mic aria-hidden className="size-5" strokeWidth={1.75} />
        )}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={slipRef}
            key="voice-slip"
            role="group"
            aria-label="Voice command"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: sec(0.25) } }}
            transition={{ duration: sec(0.6), ease: INK_EASE }}
            className="paper absolute inset-x-0 top-full z-40 mt-3 px-5 pb-5 pt-4 shadow-[var(--shadow-lift)] lg:left-auto lg:w-[460px] lg:px-6"
          >
            {typingView ? (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitTyped();
                  }}
                >
                  <label htmlFor={inputId} className="sr-only">
                    Type a command
                  </label>
                  <input
                    ref={inputRef}
                    id={inputId}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setInline(null);
                    }}
                    readOnly={phase === "working"}
                    placeholder="Type a command"
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    className="field-print min-w-0 flex-1"
                  />
                  <button
                    type="submit"
                    aria-label="Send"
                    disabled={!text.trim() || phase === "working"}
                    className="inline-flex size-12 shrink-0 items-center justify-center border border-carbon bg-carbon text-paper transition-colors duration-200 hover:bg-[#124b56] disabled:opacity-45"
                  >
                    <ArrowRight aria-hidden className="size-5" strokeWidth={1.75} />
                  </button>
                </form>
                <p aria-live="polite" className={cn("mt-3 text-[15px] leading-snug lg:text-[16px]", inline ? "text-ink" : "text-ink-muted")}>
                  {inline ?? hint}
                </p>
              </>
            ) : (
              <>
                {/* a status line when there's something to say: the laptop key already says "Listening",
                    the phone's key is only a mic */}
                {label ? (
                  <div className="mb-2 flex min-h-6 items-center justify-between gap-4">
                    <p aria-live="polite" className="label-print text-carbon">
                      {label}
                    </p>
                    {listening ? typeInstead : null}
                  </div>
                ) : null}
                {heard || asked || listening ? (
                  // the owner's words, live, in their brush (one line held open so the slip doesn't jump);
                  // while they answer "Which one?", what they first said stays, quieter
                  // (laptop, words alone: tall enough to cover the day's totals under it, not half of them)
                  <div className={cn("flex min-h-[44px] items-center justify-between gap-4", label ? "lg:min-h-[50px]" : "lg:min-h-[84px]")}>
                    {heard || asked ? (
                      <p
                        className={cn(
                          "voice-heard font-pen text-[30px] leading-[1.12] lg:text-[36px]",
                          !heard || (listening && !settled) ? "text-ink-muted" : "text-ink",
                        )}
                      >
                        {heard || asked}
                      </p>
                    ) : (
                      <p className="text-[16px] leading-snug text-ink-muted">{hint}</p>
                    )}
                    {!label && listening ? typeInstead : null}
                  </div>
                ) : null}
                {choices.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {choices.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={phase === "working"}
                        onClick={() => void choose(c.id)}
                        className="inline-flex min-h-11 items-center border border-ink/25 bg-paper px-4 text-left text-[16px] text-ink transition-colors duration-200 hover:border-carbon hover:bg-highlight/40 disabled:opacity-45"
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
