"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue } from "motion/react";

// Hold-to-talk voice note: MediaRecorder for the file, Web Audio
// AnalyserNode for a live mic level (0–1) that drives the neon ring.
// iOS Safari records audio/mp4, Chrome audio/webm; we send whatever we get.

export type RecorderState = "idle" | "requesting" | "recording";

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export const MAX_RECORDING_MS = 45_000;
// AAC-in-MP4 first: it's what iPhone Safari records, and Gemini lists AAC
// (not WebM) among its audio formats. Chrome falls back to WebM/Opus.
const MIME_CANDIDATES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/aac",
];

interface Internals {
  stream?: MediaStream;
  ctx?: AudioContext;
  rec?: MediaRecorder;
  raf?: number;
  ticker?: ReturnType<typeof setInterval>;
  cap?: ReturnType<typeof setTimeout>;
  chunks: Blob[];
  startedAt: number;
  cancelled: boolean;
}

export function useRecorder(onDone: (r: Recording) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const level = useMotionValue(0);
  const r = useRef<Internals>({ chunks: [], startedAt: 0, cancelled: false });
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const release = useCallback(() => {
    const s = r.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (s.ticker) clearInterval(s.ticker);
    if (s.cap) clearTimeout(s.cap);
    s.stream?.getTracks().forEach((t) => t.stop());
    void s.ctx?.close().catch(() => {});
    s.raf = s.ticker = s.cap = undefined;
    s.stream = s.ctx = s.rec = undefined;
    level.set(0);
  }, [level]);

  const stop = useCallback(() => {
    const s = r.current;
    if (s.rec && s.rec.state !== "inactive") s.rec.stop();
    else if (!s.rec) {
      // still waiting for mic permission: give up quietly
      s.cancelled = true;
    }
  }, []);

  const start = useCallback(async () => {
    const s = r.current;
    if (s.rec || s.stream) return;
    setError(null);
    s.cancelled = false;

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. Type it instead.");
      return;
    }

    // Create/resume the AudioContext inside the user gesture (iOS requires it).
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = AC ? new AC() : undefined;
    void ctx?.resume().catch(() => {});
    s.ctx = ctx;
    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      release();
      setState("idle");
      const name = (err as DOMException)?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Mic access is off, so I can't hear you. Type it instead."
          : "I couldn't find a microphone. Type it instead.",
      );
      return;
    }
    if (s.cancelled) {
      stream.getTracks().forEach((t) => t.stop());
      release();
      setState("idle");
      return;
    }
    s.stream = stream;

    // Live level for the neon ring.
    if (ctx) {
      try {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let smooth = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const target = Math.min(1, Math.sqrt(sum / buf.length) * 7);
          smooth += (target - smooth) * (target > smooth ? 0.55 : 0.12);
          level.set(smooth);
          s.raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // level is decoration; recording still works without it
      }
    }

    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t));
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 }) : new MediaRecorder(stream);
    } catch {
      release();
      setState("idle");
      setError("This browser can't record audio. Type it instead.");
      return;
    }
    s.chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) s.chunks.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = performance.now() - s.startedAt;
      const type = (rec.mimeType || mimeType || "audio/webm").toLowerCase();
      const blob = new Blob(s.chunks, { type });
      const cancelled = s.cancelled;
      release();
      setState("idle");
      setElapsedMs(0);
      if (!cancelled && blob.size > 0) onDoneRef.current({ blob, mimeType: type, durationMs });
    };
    s.rec = rec;
    rec.start(250);
    s.startedAt = performance.now();
    setElapsedMs(0);
    setState("recording");
    s.ticker = setInterval(() => setElapsedMs(performance.now() - s.startedAt), 100);
    s.cap = setTimeout(() => stop(), MAX_RECORDING_MS);
  }, [level, release, stop]);

  /** Stop without delivering the recording. */
  const cancel = useCallback(() => {
    r.current.cancelled = true;
    stop();
  }, [stop]);

  useEffect(() => {
    const s = r.current;
    return () => {
      s.cancelled = true;
      if (s.rec && s.rec.state !== "inactive") s.rec.stop();
      release();
    };
  }, [release]);

  return { state, error, setError, elapsedMs, level, start, stop, cancel };
}
