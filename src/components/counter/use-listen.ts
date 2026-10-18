"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// The browser's own speech recognition (Chrome, Edge, Safari): free, and no
// AI calls. One utterance per tap: it ends on silence, on a second tap
// (stop), or after MAX_MS. Firefox has none: the Talk key types instead.

interface Alternative {
  readonly transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: Alternative;
}
interface RecognitionEvent {
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const never = () => () => {};

/** Whether this browser can listen (false on the server and in Firefox). */
export function useCanListen(): boolean {
  return useSyncExternalStore(never, () => recognition() !== null, () => false);
}

export interface Listener {
  /** The words so far, live; `final` once the engine has settled on them. */
  onWords: (text: string, final: boolean) => void;
  /** Listening ended: each reading of what was said, best first ([] = silence). */
  onDone: (readings: string[]) => void;
  /** It couldn't listen: "not-allowed", "audio-capture", "network", … */
  onError: (code: string) => void;
}

const MAX_MS = 12_000;
/** After a stop, how long to wait for the engine to say it ended before ending anyway (Safari can stay silent). */
const STOP_GRACE_MS = 2_500;

/** Readings of the whole utterance: the settled words, then each guess for the last stretch. */
function readings(finals: string[][], interim: string): string[] {
  const tail = interim.trim();
  if (!finals.length) return tail ? [tail] : [];
  const head = finals
    .slice(0, -1)
    .map((alts) => alts[0] ?? "")
    .join(" ");
  const out = finals[finals.length - 1].map((alt) => `${head} ${alt} ${tail}`.replace(/\s+/g, " ").trim()).filter(Boolean);
  return [...new Set(out)];
}

export function useListen(listener: Listener) {
  const rec = useRef<Recognition | null>(null);
  const timers = useRef<number[]>([]);
  const finish = useRef<(() => void) | null>(null);
  const handlers = useRef(listener);
  useEffect(() => {
    handlers.current = listener;
  });
  const [listening, setListening] = useState(false);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  /** Stop listening and say nothing (Escape, "Type instead", leaving the page). */
  const cancel = useCallback(() => {
    clearTimers();
    finish.current = null;
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try {
      r.abort();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  /** Finish now: whatever was heard so far is the command. */
  const stop = useCallback(() => {
    if (!rec.current) return;
    try {
      rec.current.stop();
    } catch {
      /* already stopping */
    }
    // if the engine never reports the end, end anyway, so the key can't stay stuck on "Listening"
    timers.current.push(window.setTimeout(() => finish.current?.(), STOP_GRACE_MS));
  }, []);

  const start = useCallback((): boolean => {
    const Ctor = recognition();
    if (!Ctor || rec.current) return false;
    let r: Recognition;
    try {
      r = new Ctor();
      r.lang = "en-US";
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 3;
    } catch {
      return false;
    }
    let finals: string[][] = [];
    let interim = "";
    let error: string | null = null;
    r.onresult = (e) => {
      finals = [];
      interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const alts: string[] = [];
          for (let k = 0; k < res.length; k++) alts.push(res[k].transcript);
          finals.push(alts);
        } else interim += res[0]?.transcript ?? "";
      }
      const settled = finals.map((alts) => alts[0] ?? "").join(" ");
      const text = `${settled} ${interim}`.replace(/\s+/g, " ").trim();
      handlers.current.onWords(text, !interim.trim() && !!settled.trim());
    };
    r.onerror = (e) => {
      error = e.error;
    };
    // Exactly once, from the engine's end or from the stop watchdog.
    const end = () => {
      if (finish.current !== end) return;
      finish.current = null;
      clearTimers();
      rec.current = null;
      // an engine that never said it ended lets go of the mic now, and can't write words in later
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try {
        r.abort();
      } catch {
        /* already ended */
      }
      setListening(false);
      // silence and an engine-side abort end like a stop: the words so far (maybe none) are the answer
      if (error && error !== "no-speech" && error !== "aborted") handlers.current.onError(error);
      else handlers.current.onDone(readings(finals, interim));
    };
    r.onend = end;
    try {
      r.start();
    } catch {
      return false;
    }
    rec.current = r;
    finish.current = end;
    setListening(true);
    timers.current.push(window.setTimeout(stop, MAX_MS));
    return true;
  }, [stop]);

  useEffect(() => cancel, [cancel]);
  return { listening, start, stop, cancel };
}
