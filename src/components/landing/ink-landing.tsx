"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// The landing: one ink plate, edge to edge. The drawn lake fills the screen,
// the CRT-headed AI shopper stands at the water, two cranes and three small
// birds cross the sky behind the wordmark. Only "avanti" and one quiet link
// sit on top. Styles: `land-*` in src/styles/landing.css. Media: /public/landing.

const MEDIA = "/landing";
const FW = 1920; // the plate's own pixel grid (1920 × 1080)

// Robot: one static body + 18 head-turn patches (a 6 × 3 sheet).
const R = { w: 827, h: 808, patch: [34, 1, 756, 623] as const, cols: 6, frames: 18, ref: 6 };

type Flyer = { src: string; frames: number; cw: number; ch: number; ax: number; ay: number; lag: number; dy: number; phase: number; scale?: number; img?: HTMLImageElement };

// Cranes and the three small birds that trail them in the original plate.
const CRANES: Flyer[] = [
  { src: `${MEDIA}/crane-b.webp`, frames: 25, cw: 320, ch: 280, ax: 146, ay: 116, lag: 0, dy: 6, phase: 0 },
  { src: `${MEDIA}/crane-a.webp`, frames: 27, cw: 320, ch: 280, ax: 147, ay: 175, lag: 235, dy: -26, phase: 9 },
];
const SMALL: Flyer = { src: `${MEDIA}/bird-s.webp`, frames: 15, cw: 56, ch: 40, ax: 28, ay: 20, lag: 0, dy: 0, phase: 0 };
const FLOCK: [number, number, number][] = [
  [420, -52, 0],
  [505, -18, 5],
  [462, 14, 10],
];
const SPEED = 66; // plate px/s
const X0 = 2100; // entry x
const X1 = -120; // exit x of the last bird
const SCALE = 0.85;
const PERIOD = (X0 - X1 + 505) / SPEED;

export function InkLanding() {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const robotRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLCanvasElement>(null);
  const birdsRef = useRef<HTMLCanvasElement>(null);
  const brandRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    const robot = robotRef.current;
    const rc = headRef.current;
    const bc = birdsRef.current;
    const brand = brandRef.current;
    if (!stage || !video || !robot || !rc || !bc || !brand) return;
    const rx = rc.getContext("2d");
    const bx = bc.getContext("2d");
    if (!rx || !bx) return;

    let alive = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

    // The plate loops (muted autoplay). React sets `muted` as a property, so make sure it plays.
    if (reduce) video.pause();
    else {
      video.muted = true;
      video.play().catch(() => {});
    }

    /* ---------- robot: static body + one head patch per frame, turned by the pointer or the cranes ---------- */
    const body = new Image();
    const heads = new Image();
    body.src = `${MEDIA}/robot-body.webp`;
    heads.src = `${MEDIA}/robot-heads.webp`;
    let ready = false;
    let cur = R.ref;
    let target = R.ref;
    let stepClock = 0;
    let lastPointer = -1e9;
    const drawHead = (k: number) => {
      const [px, py, pw, ph] = R.patch;
      const c = k % R.cols;
      const r = Math.floor(k / R.cols);
      rx.clearRect(0, 0, R.w, R.h);
      rx.drawImage(body, 0, 0);
      rx.clearRect(px, py, pw, ph);
      rx.drawImage(heads, c * pw, r * ph, pw, ph, px, py, pw, ph);
    };
    Promise.all([body.decode(), heads.decode()])
      .then(() => {
        if (!alive) return;
        ready = true;
        drawHead(cur);
        robot.dataset.live = "true";
      })
      .catch(() => {});
    const lookAt = (t: number) => {
      // t in [-1, 1]: the viewer's left … right
      t = Math.max(-1, Math.min(1, t));
      return Math.round(t < 0 ? R.ref * (1 + t) : R.ref + t * (R.frames - 1 - R.ref));
    };
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const b = robot.getBoundingClientRect();
      target = lookAt((e.clientX - (b.left + b.width / 2)) / Math.max(260, innerWidth * 0.42));
      lastPointer = performance.now();
    };
    if (finePointer && !reduce) addEventListener("pointermove", onPointer, { passive: true });

    /* ---------- cranes and small birds: wing-beat cycles cut from the plate, flying right to left behind the wordmark ---------- */
    const cranes = CRANES.map((c) => ({ ...c, img: new Image() }));
    cranes.forEach((c) => (c.img.src = c.src));
    const sbImg = new Image();
    sbImg.src = SMALL.src;
    const flock = FLOCK.map(([lag, dy, phase]) => ({ ...SMALL, lag, dy, phase, scale: 1, img: sbImg }));
    const flyers = [...cranes, ...flock];
    const loaded = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
    let yBase = 160;
    let k = 1;
    let ox = 0;
    let oy = 0;
    const t0 = performance.now() - ((X0 - 1420) / SPEED) * 1000;
    let redraw = () => {}; // reduced motion repaints the still birds after each resize

    const birdAt = (c: Flyer, t: number) => {
      const span = PERIOD * SPEED;
      const d = (((t * SPEED) % span) + span) % span;
      const x = X0 + c.lag - d;
      const p = (X0 - x) / (X0 - X1);
      // enter low on the right, rise into the wordmark, then glide out level
      const y = yBase + c.dy + 90 * (1 - p) * (1 - p) - 12 * p + 7 * Math.sin(t * 0.7 + c.phase);
      return { x, y, f: Math.floor(t * 24 + c.phase) % c.frames };
    };
    const drawBirds = (t: number) => {
      bx.clearRect(0, 0, bc.width, bc.height);
      for (const c of flyers) {
        if (!loaded(c.img)) continue;
        const { x, y, f } = birdAt(c, t);
        const sc = c.scale || SCALE;
        if (x < -300 || x > FW + 300) continue;
        bx.drawImage(c.img, f * c.cw, 0, c.cw, c.ch, ox + (x - c.ax * sc) * k, oy + (y - c.ay * sc) * k, c.cw * sc * k, c.ch * sc * k);
      }
    };
    const fit = () => {
      if (!alive) return;
      const h = bc.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      bc.width = Math.round(h.width * dpr);
      bc.height = Math.round(h.height * dpr);
      k = (s.width * dpr) / FW; // canvas px per plate px
      ox = (s.left - h.left) * dpr;
      oy = (s.top - h.top) * dpr;
      // fly level with the wordmark, so the birds cross behind its letters
      const b = brand.getBoundingClientRect();
      yBase = ((b.top + b.height * 0.38 - s.top) * dpr) / k; // through the letters, mostly clear of the link
      redraw();
    };

    /* ---------- one loop for both; it sleeps while the tab is hidden ---------- */
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden || !alive) return;
      const t = (now - t0) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      drawBirds(t);
      if (ready) {
        if (now - lastPointer > 2600) {
          // no recent pointer: watch the lead crane while it is close
          const lead = birdAt(cranes[0], t);
          target = Math.abs(lead.x - FW / 2) < 820 ? lookAt((lead.x - FW / 2) / 640) : R.ref;
        }
        stepClock += dt;
        if (cur !== target && stepClock > 1 / 20) {
          stepClock = 0;
          cur += Math.sign(target - cur);
          drawHead(cur);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!raf && alive) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const onVisible = () => {
      if (!document.hidden) start();
    };

    fit();
    addEventListener("resize", fit);
    document.fonts?.ready.then(fit);
    if (reduce) {
      redraw = () => drawBirds((X0 - 560) / SPEED); // still: the birds in the open sky left of the head
      [...cranes.map((c) => c.img), sbImg].forEach((im) => im.decode().then(redraw, redraw));
    } else {
      start();
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener("resize", fit);
      removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <main className="land-hero">
      <div ref={stageRef} className="land-stage" aria-hidden>
        <video ref={videoRef} className="land-video" autoPlay muted loop playsInline preload="auto" poster={`${MEDIA}/land.webp`}>
          <source src={`${MEDIA}/land.mp4`} type="video/mp4" />
        </video>
        <div ref={robotRef} className="land-robot">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed still under the head canvas */}
          <img src={`${MEDIA}/robot-body.webp`} alt="" width={827} height={808} decoding="sync" />
          <canvas ref={headRef} width={827} height={808} />
        </div>
      </div>
      <canvas ref={birdsRef} className="land-birds" aria-hidden />

      <header className="land-top">
        <h1 ref={brandRef} className="land-brand">
          avanti<span className="sr-only">: every shop, open to every AI</span>
        </h1>
        <Link href="/start" className="land-start">
          <span>get started</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </Link>
      </header>
    </main>
  );
}
