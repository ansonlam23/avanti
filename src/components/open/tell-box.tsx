"use client";

import { ArrowUp, Mic, Square, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRecorder, type Recording } from "./use-recorder";
import { Waveform } from "./waveform";

// "Change anything": one line under the menu. Type a change, or tap the mic,
// talk, tap again. Each change is one AI call; the menu updates in place.

const MIN_MS = 800; // shorter recordings are accidents

export interface TellNote {
  text: string;
  tone: "plain" | "error";
}

export function TellBox({
  busy,
  note,
  hint,
  placeholder,
  onVoice,
  onText,
  inputRef,
  className,
}: {
  busy: boolean;
  /** What the last change did, or why it didn't work. */
  note: TellNote | null;
  /** Shown under the box until there's something to say. */
  hint: string;
  placeholder: string;
  onVoice: (r: Recording) => void;
  onText: (text: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const rec = useRecorder((r) => {
    if (r.durationMs < MIN_MS) {
      setTooShort(true);
      return;
    }
    onVoice(r);
  });
  const recording = rec.state === "recording";
  const typed = text.trim();

  const send = () => {
    if (busy || !typed) return;
    onText(typed);
    setText("");
  };
  const talk = () => {
    if (busy) return;
    if (recording) return rec.stop();
    if (rec.state !== "idle") return;
    setTooShort(false);
    void rec.start();
  };

  const s = Math.floor(rec.elapsedMs / 1000);
  const line: TellNote = rec.error
    ? { text: rec.error, tone: "error" }
    : tooShort
      ? { text: "That was quick. Tap the mic, talk, then tap it again.", tone: "error" }
      : rec.state === "requesting"
        ? { text: "Allow the mic…", tone: "plain" }
        : recording
          ? { text: "Listening. Tap the square when you're done.", tone: "plain" }
          : busy
            ? { text: " ", tone: "plain" }
            : (note ?? { text: hint, tone: "plain" });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex h-14 items-stretch"
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center border border-r-0 bg-paper transition-colors duration-200",
            "border-[rgb(22_58_66/0.34)] focus-within:border-carbon",
          )}
        >
          {recording ? (
            <div className="flex w-full min-w-0 items-center gap-3 pr-4">
              <button
                type="button"
                onClick={rec.cancel}
                aria-label="Cancel"
                className="grid size-12 shrink-0 place-items-center text-ink-muted transition-colors hover:text-ink"
              >
                <X className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
              <span aria-hidden className="size-2 shrink-0 bg-stamp" />
              <Waveform level={rec.level} live className="h-8 min-w-0 flex-1" />
              <span className="shrink-0 font-mono text-[17px] font-medium tabular-nums">
                {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
              </span>
            </div>
          ) : busy ? (
            <p className="open-pulse w-full truncate px-4 text-[17px] text-ink-muted">Updating your menu…</p>
          ) : (
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 600))}
              placeholder={placeholder}
              enterKeyHint="send"
              autoComplete="off"
              aria-label="Tell me a change"
              className="h-full w-full min-w-0 bg-transparent px-4 text-[17px] text-ink outline-none placeholder:text-ink-muted"
            />
          )}
        </div>
        {typed && !recording ? (
          <button
            type="submit"
            disabled={busy}
            aria-label="Send"
            className="grid w-14 shrink-0 place-items-center bg-carbon text-paper transition-colors duration-200 hover:bg-[#124b56] disabled:opacity-50"
          >
            <ArrowUp className="size-6" strokeWidth={1.75} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={talk}
            disabled={busy}
            aria-label={recording ? "Done talking" : "Talk"}
            aria-pressed={recording}
            className={cn(
              "grid w-14 shrink-0 place-items-center text-paper transition-colors duration-200 disabled:opacity-50",
              recording ? "bg-ink" : "bg-carbon hover:bg-[#124b56]",
            )}
          >
            {recording ? (
              <Square className="size-5 fill-current" strokeWidth={1.5} aria-hidden />
            ) : (
              <Mic className="size-6" strokeWidth={1.5} aria-hidden />
            )}
          </button>
        )}
      </form>
      <p
        aria-live="polite"
        className={cn(
          "min-h-6 px-1 text-[15px] leading-snug lg:text-[16px]",
          line.tone === "error" ? "font-semibold text-stamp-deep" : "text-ink-muted",
        )}
      >
        {line.text}
      </p>
    </div>
  );
}
