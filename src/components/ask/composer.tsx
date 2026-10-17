"use client";

import { ArrowUp, Mic, Square } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

// The bar at the bottom: type, or tap the mic (iOS Safari has
// webkitSpeechRecognition; started only from a tap). Typing always works.

interface SpeechResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognizerCtor = new () => Recognizer;

function speechCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

export function Composer({
  value,
  onChange,
  onSend,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  busy: boolean;
}) {
  const canSpeak = useSyncExternalStore(noop, () => speechCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognizer | null>(null);
  const heardRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = value.trim().length > 0 && !busy;

  function submit() {
    if (!ready) return;
    onSend(value.trim());
    // Phones: drop the keyboard so the shop slips and the order are visible.
    if (window.matchMedia("(pointer: coarse)").matches) inputRef.current?.blur();
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    heardRef.current = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      heardRef.current = text;
      onChange(text);
    };
    rec.onerror = () => {
      setListening(false);
      inputRef.current?.focus();
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const heard = heardRef.current.trim();
      if (heard && !busy) onSend(heard);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="ask-composer flex items-center gap-1.5 py-1.5 pl-4 pr-1.5 lg:py-2 lg:pl-5 lg:pr-2"
    >
      <label htmlFor="ask-input" className="sr-only">
        Ask the AI shopper
      </label>
      <input
        id="ask-input"
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={listening ? "Listening…" : "Ask for anything nearby…"}
        autoComplete="off"
        autoCorrect="on"
        enterKeyHint="send"
        maxLength={500}
        className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-muted focus:outline-none lg:text-[17px]"
      />
      {canSpeak ? (
        <button
          type="button"
          onClick={toggleMic}
          aria-label={listening ? "Stop listening" : "Speak instead"}
          aria-pressed={listening}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center border transition-colors",
            listening ? "border-carbon bg-carbon text-paper" : "border-transparent text-carbon hover:border-ink/20",
          )}
        >
          {listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-5" strokeWidth={1.6} />}
        </button>
      ) : null}
      <button
        type="submit"
        disabled={!ready}
        aria-label="Send"
        className="flex size-11 shrink-0 items-center justify-center bg-carbon text-paper transition-[background-color,opacity] duration-200 enabled:hover:bg-[#124b56] enabled:active:translate-y-px disabled:bg-carbon/25 disabled:text-paper"
      >
        <ArrowUp className="size-5" strokeWidth={1.8} />
      </button>
    </form>
  );
}
