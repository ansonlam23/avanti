"use client";

// Sfx: a tiny sound kit synthesized with Web Audio (no audio files, nothing to
// license). One sound per material event: printer chatter, paper tear, stamp
// thunk, a slip spiked on the spindle, the shop doorbell, a switch click.
// (neon-*, flip, clack and chalk are kept for older callers.)
//
// Rules: muted by default (persisted in localStorage), and nothing plays until
// the user has tapped/clicked/typed at least once (browser autoplay rules; on
// iOS the first tap also unlocks the AudioContext and asks for the "playback"
// audio session so the silent switch doesn't swallow the sounds).

import { useSyncExternalStore } from "react";

export type SfxName =
  | "switch"
  | "neon-tick"
  | "neon-hum"
  | "neon-off"
  | "stamp"
  | "printer"
  | "doorbell"
  | "clack"
  | "flip"
  | "chalk"
  | "tear"
  | "spike";

export interface SfxOptions {
  /** Seconds from now. */
  delay?: number;
  /** 0…1+, scales the sound's own level. */
  gain?: number;
  /** Seconds, for sounds that have a length (printer, chalk, neon-hum). */
  duration?: number;
}

const STORAGE_KEY = "open-sign:sound";

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = true;
let gestured = false;
let booted = false;
const listeners = new Set<() => void>();

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) !== "on";
  } catch {
    muted = true;
  }
  const unlock = () => {
    gestured = true;
    if (!muted) audio();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchend", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchend", unlock, true);
}

/** The shared AudioContext, created/resumed only when allowed. */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  boot();
  if (muted || !gestured) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    // iOS: play through the silent switch, like a video would.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {
        /* older iOS */
      }
    }
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(comp).connect(ctx.destination);
    // iOS unlock: a one-sample silent buffer inside the gesture.
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function emit() {
  for (const l of listeners) l();
}

export const sfx = {
  play(name: SfxName, opts: SfxOptions = {}) {
    const c = audio();
    if (!c || !out) return;
    const t = c.currentTime + 0.01 + Math.max(0, opts.delay ?? 0);
    try {
      SYNTH[name](c, out, t, opts.gain ?? 1, opts.duration);
    } catch {
      /* never let a sound break the UI */
    }
  },
  isMuted() {
    boot();
    return muted;
  },
  /** Call from a click/tap handler (that click is the user gesture). */
  setMuted(next: boolean) {
    boot();
    muted = next;
    gestured = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "off" : "on");
    } catch {
      /* private mode */
    }
    if (next) {
      if (ctx && ctx.state === "running") void ctx.suspend();
    } else {
      audio();
    }
    emit();
  },
  subscribe(fn: () => void) {
    boot();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

/** React: current mute state (muted on the server and before hydration). */
export function useSfxMuted(): boolean {
  return useSyncExternalStore(sfx.subscribe, sfx.isMuted, () => true);
}

// ── Synth building blocks ────────────────────────────────────

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const len = Math.floor(c.sampleRate * 1.5);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  noise = b;
  return b;
}

/** Exponential attack/decay envelope on a gain param. */
function envelope(g: AudioParam, t: number, peak: number, attack: number, decay: number) {
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseHit(
  c: AudioContext,
  dest: AudioNode,
  t: number,
  o: { type: BiquadFilterType; freq: number; q?: number; peak: number; attack?: number; decay: number; freqEnd?: number },
) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.attack ?? 0.002) + o.decay);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  envelope(g.gain, t, o.peak, o.attack ?? 0.002, o.decay);
  src.connect(f).connect(g).connect(dest);
  const offset = (t * 7.31) % 1; // vary the slice of noise per hit
  src.start(t, offset, (o.attack ?? 0.002) + o.decay + 0.05);
}

function tone(
  c: AudioContext,
  dest: AudioNode,
  t: number,
  o: { type: OscillatorType; f0: number; f1?: number; peak: number; attack?: number; decay: number; lowpass?: number },
) {
  const osc = c.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.attack ?? 0.003) + o.decay);
  const g = c.createGain();
  envelope(g.gain, t, o.peak, o.attack ?? 0.003, o.decay);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lowpass;
    node = osc.connect(lp);
  }
  node.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + (o.attack ?? 0.003) + o.decay + 0.05);
}

type Synth = (c: AudioContext, dest: AudioNode, t: number, gain: number, duration?: number) => void;

const SYNTH: Record<SfxName, Synth> = {
  // A wall switch: press click, relay thump, release click.
  switch(c, d, t, g) {
    noiseHit(c, d, t, { type: "highpass", freq: 2600, peak: 0.32 * g, decay: 0.012 });
    tone(c, d, t, { type: "triangle", f0: 2300, f1: 1700, peak: 0.12 * g, decay: 0.02 });
    tone(c, d, t + 0.004, { type: "sine", f0: 120, f1: 60, peak: 0.28 * g, decay: 0.07 });
    noiseHit(c, d, t + 0.075, { type: "highpass", freq: 3200, peak: 0.12 * g, decay: 0.01 });
  },
  // Electric crackle on each flicker cut: a zap + a short 120 Hz buzz grain.
  "neon-tick"(c, d, t, g) {
    noiseHit(c, d, t, { type: "bandpass", freq: 4200, q: 0.9, peak: 0.16 * g, decay: 0.018 });
    tone(c, d, t, { type: "sawtooth", f0: 120, peak: 0.05 * g, decay: 0.045, lowpass: 1400 });
  },
  // Transformer hum settling in (mains 60 Hz → 120 Hz buzz), quiet.
  "neon-hum"(c, d, t, g, duration = 1.6) {
    const peak = 0.045 * g;
    for (const [f, k] of [
      [120, 1],
      [240, 0.45],
      [360, 0.2],
    ] as const) {
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      const amp = c.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(peak * k, t + 0.04);
      amp.gain.setValueAtTime(peak * k, t + duration * 0.35);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(lp).connect(amp).connect(d);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
  },
  // Power cut: a falling zap.
  "neon-off"(c, d, t, g) {
    noiseHit(c, d, t, { type: "bandpass", freq: 3000, freqEnd: 900, q: 1.2, peak: 0.12 * g, decay: 0.09 });
    tone(c, d, t, { type: "sawtooth", f0: 120, f1: 55, peak: 0.06 * g, decay: 0.22, lowpass: 900 });
  },
  // Rubber stamp on paper: low thunk + paper slap + tiny tack.
  stamp(c, d, t, g) {
    tone(c, d, t, { type: "sine", f0: 150, f1: 48, peak: 0.75 * g, attack: 0.002, decay: 0.14 });
    tone(c, d, t, { type: "triangle", f0: 330, f1: 190, peak: 0.26 * g, attack: 0.002, decay: 0.06 }); // audible on phone speakers
    noiseHit(c, d, t, { type: "lowpass", freq: 1100, peak: 0.42 * g, decay: 0.05 });
    noiseHit(c, d, t, { type: "bandpass", freq: 2600, q: 1.5, peak: 0.16 * g, decay: 0.012 });
  },
  // Thermal receipt printer: stepper ticks + motor whine + paper rustle.
  printer(c, d, t, g, duration = 0.9) {
    const rate = 32;
    const n = Math.max(1, Math.round(duration * rate));
    for (let i = 0; i < n; i++) {
      const jit = (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.006;
      noiseHit(c, d, t + i / rate + jit, { type: "bandpass", freq: 3600, q: 2.2, peak: (0.07 + (i % 3) * 0.02) * g, decay: 0.006 });
    }
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(410, t);
    osc.frequency.linearRampToValueAtTime(440, t + duration);
    const amp = c.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.018 * g, t + 0.05);
    amp.gain.setValueAtTime(0.018 * g, t + duration - 0.05);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.04);
    osc.connect(amp).connect(d);
    osc.start(t);
    osc.stop(t + duration + 0.1);
    noiseHit(c, d, t, { type: "lowpass", freq: 1600, peak: 0.03 * g, attack: 0.05, decay: duration });
  },
  // A little brass shop bell on the door: three quick strikes, inharmonic partials.
  doorbell(c, d, t, g) {
    const strikes: [number, number][] = [
      [0, 2093],
      [0.09, 2349],
      [0.2, 2637],
    ];
    for (const [dt, f0] of strikes) {
      for (const [ratio, amp, decay] of [
        [1, 0.16, 1.1],
        [2.76, 0.06, 0.6],
        [5.4, 0.03, 0.32],
        [8.93, 0.012, 0.18],
      ] as const) {
        tone(c, d, t + dt, { type: "sine", f0: f0 * ratio, peak: amp * g, attack: 0.002, decay });
      }
      noiseHit(c, d, t + dt, { type: "highpass", freq: 5000, peak: 0.05 * g, decay: 0.01 });
    }
  },
  // A hanging sign knocking the door glass: a woody knock + a smaller settle.
  clack(c, d, t, g) {
    noiseHit(c, d, t, { type: "bandpass", freq: 1300, q: 3.5, peak: 0.42 * g, decay: 0.05 });
    tone(c, d, t, { type: "sine", f0: 420, f1: 300, peak: 0.22 * g, decay: 0.05 });
    noiseHit(c, d, t + 0.085, { type: "bandpass", freq: 1800, q: 3, peak: 0.14 * g, decay: 0.03 });
  },
  // The sign turning in the air.
  flip(c, d, t, g) {
    noiseHit(c, d, t, { type: "bandpass", freq: 600, freqEnd: 1900, q: 1.1, peak: 0.07 * g, attack: 0.05, decay: 0.16 });
  },
  // Paper torn against the printer's cutter: a fast ripple of crackles + a soft rip.
  tear(c, d, t, g) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const dt = i * 0.0105 + ((i * 7919) % 13) / 2600;
      noiseHit(c, d, t + dt, {
        type: "bandpass",
        freq: 2300 + (i % 3) * 950,
        q: 1.3,
        peak: Math.max(0.03, 0.17 - i * 0.012) * g,
        decay: 0.012,
      });
    }
    noiseHit(c, d, t, { type: "highpass", freq: 1100, peak: 0.07 * g, attack: 0.012, decay: 0.12 });
  },
  // A paper slip pushed onto the receipt spindle: a soft slap + a tiny steel tick.
  spike(c, d, t, g) {
    noiseHit(c, d, t, { type: "lowpass", freq: 1700, peak: 0.24 * g, decay: 0.045 });
    noiseHit(c, d, t, { type: "bandpass", freq: 3800, q: 2, peak: 0.06 * g, decay: 0.01 });
    tone(c, d, t + 0.004, { type: "triangle", f0: 2900, f1: 2500, peak: 0.045 * g, decay: 0.035 });
  },
  // Chalk on slate: scratchy bursts while a line is written.
  chalk(c, d, t, g, duration = 0.5) {
    const strokes = Math.max(1, Math.round(duration * 11));
    for (let i = 0; i < strokes; i++) {
      const dt = (i / strokes) * duration;
      noiseHit(c, d, t + dt, { type: "highpass", freq: 2600 + (i % 4) * 300, peak: 0.045 * g, attack: 0.012, decay: 0.05 });
    }
  },
};
