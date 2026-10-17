"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A real stopwatch: starts at the owner's first tap, stops when the shop is
// live. Nothing here is estimated; the live screen prints this exact time.

interface Watch {
  startedAt: number | null;
  stoppedAt: number | null;
  frozenMs: number | null; // ?shot replays show the time measured on the real run
}

const IDLE: Watch = { startedAt: null, stoppedAt: null, frozenMs: null };

export function useStopwatch() {
  const ref = useRef<Watch>(IDLE);
  const [w, setW] = useState<Watch>(IDLE);
  const [now, setNow] = useState(0);

  const running = w.startedAt !== null && w.stoppedAt === null && w.frozenMs === null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const commit = useCallback((next: Watch) => {
    ref.current = next;
    setW(next);
  }, []);

  const start = useCallback(() => {
    const s = ref.current;
    if (s.startedAt !== null || s.frozenMs !== null) return;
    commit({ ...s, startedAt: performance.now() });
  }, [commit]);

  /** Current reading in ms (works between renders). */
  const read = useCallback((): number => {
    const s = ref.current;
    if (s.frozenMs !== null) return s.frozenMs;
    if (s.startedAt === null) return 0;
    return (s.stoppedAt ?? performance.now()) - s.startedAt;
  }, []);

  /** Stops the watch and returns the measured time (ms). */
  const stop = useCallback((): number => {
    const s = ref.current;
    if (s.startedAt !== null && s.stoppedAt === null && s.frozenMs === null) {
      commit({ ...s, stoppedAt: performance.now() });
    }
    return read();
  }, [commit, read]);

  const freeze = useCallback((ms: number) => commit({ startedAt: null, stoppedAt: null, frozenMs: ms }), [commit]);

  let elapsedMs = 0;
  if (w.frozenMs !== null) elapsedMs = w.frozenMs;
  else if (w.startedAt !== null) elapsedMs = Math.max(0, (w.stoppedAt ?? now) - w.startedAt);

  return { elapsedMs, running, started: w.startedAt !== null || w.frozenMs !== null, start, stop, freeze, read };
}
