"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// The landing: one ink plate, edge to edge. The drawn lake fills the screen,
// the CRT-headed AI shopper stands at the water, two cranes and three small
// birds cross the sky behind the wordmark. Only "avanti" and one quiet link
// sit on top. Styles: `land-*` in src/styles/landing.css. Media: /public/landing.
//
// The robot is alive in small ways, all in the plate's ink: its screen eyes blink,
// their pupils follow you, they go wide when you come close and smile (^ ^) for
// "get started", after a surprise, at its visitor and now and then on their own;
// a few seconds after the page opens (and on later passes) one of the small birds
// lands on its monitor for a while. A plum blossom sits in its lapel.

const MEDIA = "/landing";
const FW = 1920; // the plate's own pixel grid (1920 × 1080)
const FH = 1080;

// Robot: one static body + 18 head-turn patches (a 6 × 3 sheet).
const R = { w: 827, h: 808, patch: [34, 1, 756, 623] as const, cols: 6, frames: 18, ref: 6 };

type Eye = readonly [cx: number, cy: number, w: number, h: number];
// Its screen eyes in each head frame: the left and right eye's centre and size, in the robot canvas.
const EYES: readonly (readonly [Eye, Eye])[] = [
  [[269.5, 153.8, 50.1, 73.9], [383.5, 151.9, 65.5, 79.3]],
  [[273.3, 152.2, 51.6, 74.7], [389.0, 150.7, 66.2, 79.3]],
  [[283.6, 150.0, 53.9, 75.5], [403.1, 149.5, 67.8, 79.3]],
  [[293.8, 148.7, 57.0, 76.2], [415.3, 149.0, 68.5, 79.3]],
  [[304.2, 147.5, 59.3, 77.0], [427.7, 148.4, 68.5, 80.1]],
  [[320.0, 146.0, 61.6, 77.0], [445.2, 147.5, 67.8, 80.1]],
  [[328.8, 145.0, 62.4, 77.8], [454.4, 146.9, 67.0, 80.1]],
  [[342.4, 143.8, 61.6, 78.5], [468.0, 146.2, 67.0, 80.1]],
  [[355.3, 143.9, 61.6, 77.8], [480.0, 146.7, 66.2, 80.1]],
  [[370.6, 143.4, 61.6, 77.8], [493.5, 146.9, 63.9, 80.1]],
  [[390.3, 142.0, 60.8, 78.5], [510.5, 146.2, 61.6, 79.3]],
  [[401.2, 142.6, 59.3, 78.5], [519.3, 146.9, 60.1, 79.3]],
  [[414.9, 143.4, 57.8, 77.8], [529.8, 147.7, 57.8, 78.5]],
  [[424.1, 143.2, 56.2, 77.8], [536.5, 147.9, 56.2, 78.5]],
  [[433.2, 143.3, 54.7, 77.0], [543.1, 148.5, 53.9, 77.8]],
  [[445.4, 143.7, 53.9, 77.0], [551.3, 149.3, 51.6, 77.0]],
  [[452.0, 144.0, 52.4, 77.0], [555.4, 150.0, 49.3, 76.2]],
  [[460.1, 144.4, 50.8, 76.2], [560.1, 150.9, 47.0, 76.2]],
];
// The same screens with the eyes painted out (a 6 × 3 sheet of 251 × 144 cells), so the eyes can close, smile or
// go wide: per head frame, the region [x, y, w, h] it covers in the robot canvas.
const EYELESS = {
  src: `${MEDIA}/robot-eyes.webp`,
  cw: 251,
  ch: 144,
  rects: [
    [214, 82, 233, 140], [217, 81, 236, 140], [226, 79, 241, 141], [235, 79, 245, 140], [244, 78, 248, 141], [259, 77, 251, 141],
    [267, 76, 251, 141], [281, 74, 251, 143], [294, 75, 250, 142], [309, 74, 247, 143], [329, 72, 243, 144], [341, 73, 239, 144],
    [356, 74, 233, 143], [366, 74, 229, 144], [375, 74, 226, 144], [388, 75, 220, 143], [395, 75, 216, 144], [404, 76, 210, 143],
  ] as const,
};
// The top of the monitor above the screen's centre, per head frame (y in the robot canvas): where a bird stands.
const PERCH_TOP = [21, 20, 17, 16, 14, 12, 11, 10, 8, 8, 8, 8, 10, 11, 11, 11, 12, 14];
// A plum blossom with a pine tuft in the lapel, in the robot's ink. It is baked into robot-body.webp too; the canvas
// redraws it only where the head patch covers the body.
const CLOTHES = [{ src: `${MEDIA}/robot-blossom.webp`, x: 500, y: 548 }];
// A small bird perched: sitting, head cocked, wings raised (landing / taking off). Cells at 3× plate scale, feet at
// (fx, fy); drawn a touch larger than the flock (`size`) so it reads on the monitor.
const PERCHED = { src: `${MEDIA}/bird-perch.webp`, cw: 102, ch: 87, fx: 48, fy: 78, scale: 3, size: 1.25 };

// The eyes' own look: pale paper with a soft halo on the dark screen and a thin ring; ink pupils with a catchlight.
const EYE_PAPER = "#ede7e0";
const EYE_GLOW = "rgba(242, 237, 229, 0.95)";
const EYE_RING = "rgba(84, 112, 118, 0.5)";
const PUPIL = "#0c2f38";
const PUPIL_R = 12.5; // one pupil size in every head frame and every state (robot canvas px): pupils move, never scale
type EyeMode = "open" | "squint" | "closed" | "happy" | "wide";

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
const LANDER = 2; // the small bird that can land on the monitor
const SPEED = 66; // plate px/s
const X0 = 2100; // entry x
const X1 = -120; // exit x of the last bird
const SCALE = 0.85;
const PERIOD = (X0 - X1 + 505) / SPEED;

const bez = (a: number, b: number, c: number, u: number) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;

export function InkLanding() {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const robotRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLCanvasElement>(null);
  const birdsRef = useRef<HTMLCanvasElement>(null);
  const brandRef = useRef<HTMLHeadingElement>(null);
  const startRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    const robot = robotRef.current;
    const rc = headRef.current;
    const bc = birdsRef.current;
    const brand = brandRef.current;
    const startLink = startRef.current;
    if (!stage || !video || !robot || !rc || !bc || !brand || !startLink) return;
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
    const eyeless = new Image();
    body.src = `${MEDIA}/robot-body.webp`;
    heads.src = `${MEDIA}/robot-heads.webp`;
    eyeless.src = EYELESS.src;
    const clothes = CLOTHES.map((c) => {
      const im = new Image();
      im.src = c.src;
      return { ...c, im };
    });
    let ready = false;
    let eyelessReady = false;
    let cur = R.ref;
    let target = R.ref;
    let stepClock = 0;
    let hold = false; // a bird is landing on (or sitting on) the monitor: the head keeps still
    let lastPointer = -1e9;
    let pointer = { x: 0, y: 0 }; // the mouse, in client px
    let hovered = false; // "get started" under the mouse
    let focused = false; // "get started" focused
    let mode: EyeMode = "open";
    const look = { x: 0, y: 0.15 }; // where the pupils point: a vector inside the unit circle, eased
    const want = { x: 0, y: 0.15 };
    let painted = ""; // what the head canvas shows now, so identical frames aren't repainted
    const pupils = !reduce; // reduced motion: the plain open eyes

    const faceAt = (k: number) => {
      const [a, b] = EYES[k];
      return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 };
    };
    const drawEye = ([cx, cy, w, h]: Eye, m: EyeMode) => {
      rx.save();
      rx.shadowColor = EYE_GLOW;
      rx.shadowBlur = 16;
      rx.fillStyle = EYE_PAPER;
      rx.strokeStyle = EYE_PAPER;
      rx.lineCap = "round";
      if (m === "wide" || m === "squint") {
        const sx = m === "wide" ? 1.18 : 1.02;
        const sy = m === "wide" ? 1.14 : 0.3;
        const y = cy + (m === "squint" ? h * 0.12 : 0);
        rx.beginPath();
        rx.ellipse(cx, y, (w / 2) * sx, (h / 2) * sy, 0, 0, Math.PI * 2);
        rx.fill();
        rx.fill();
        rx.shadowBlur = 0;
        rx.strokeStyle = EYE_RING;
        rx.lineWidth = 2.2;
        rx.beginPath();
        rx.ellipse(cx, y, (w / 2) * sx - 1.5, Math.max(1, (h / 2) * sy - 1.5), 0, 0, Math.PI * 2);
        rx.stroke();
      } else {
        // closed: a soft line with a little smile in it; happy: an upturned arc (^ ^)
        const happy = m === "happy";
        const y = cy + h * (happy ? 0.16 : 0.08);
        rx.lineWidth = w * (happy ? 0.19 : 0.13);
        rx.beginPath();
        rx.moveTo(cx - w * 0.44, y);
        rx.quadraticCurveTo(cx, happy ? cy - h * 0.42 : y + h * 0.14, cx + w * 0.44, y);
        rx.stroke();
        rx.stroke();
      }
      rx.restore();
    };
    const drawPupil = ([cx, cy, w, h]: Eye, wide: boolean) => {
      // the same size everywhere; only how far it can travel follows the eye (wide eyes are drawn 1.18 × 1.14)
      const r = PUPIL_R;
      const ew = wide ? w * 1.18 : w;
      const eh = wide ? h * 1.14 : h;
      const x = cx + look.x * Math.max(0, ew / 2 - r - 5);
      const y = cy + look.y * Math.max(0, eh / 2 - r - 6);
      rx.save();
      rx.fillStyle = PUPIL;
      rx.shadowColor = "rgba(12, 47, 56, 0.45)";
      rx.shadowBlur = 2;
      rx.beginPath();
      rx.arc(x, y, r, 0, Math.PI * 2);
      rx.fill();
      rx.shadowBlur = 0;
      rx.fillStyle = "rgba(243, 238, 231, 0.9)";
      rx.beginPath();
      rx.arc(x - r * 0.34, y - r * 0.36, r * 0.26, 0, Math.PI * 2);
      rx.fill();
      rx.restore();
    };
    const paintHead = () => {
      if (!ready) return;
      const k = cur;
      const m: EyeMode = mode !== "open" && !eyelessReady ? "open" : mode;
      const sig = `${k}|${m}|${pupils ? `${Math.round(look.x * 60)},${Math.round(look.y * 60)}` : "-"}`;
      if (sig === painted) return;
      painted = sig;
      const [px, py, pw, ph] = R.patch;
      const c = k % R.cols;
      const r = Math.floor(k / R.cols);
      rx.clearRect(0, 0, R.w, R.h);
      rx.drawImage(body, 0, 0);
      rx.clearRect(px, py, pw, ph);
      rx.drawImage(heads, c * pw, r * ph, pw, ph, px, py, pw, ph);
      const eyes = EYES[k];
      if (m !== "open") {
        const [ex, ey, ew, eh] = EYELESS.rects[k];
        rx.drawImage(eyeless, c * EYELESS.cw, r * EYELESS.ch, ew, eh, ex, ey, ew, eh);
        for (const e of eyes) drawEye(e, m);
      }
      if (pupils && (m === "open" || m === "wide")) for (const e of eyes) drawPupil(e, m === "wide");
      // the blossom over the head patch (the body image already has it below)
      rx.save();
      rx.beginPath();
      rx.rect(px, py, pw, ph);
      rx.clip();
      for (const cl of clothes) rx.drawImage(cl.im, cl.x, cl.y);
      rx.restore();
    };
    Promise.all([body.decode(), heads.decode(), ...clothes.map((c) => c.im.decode())])
      .then(() => {
        if (!alive) return;
        ready = true;
        painted = "";
        paintHead();
        robot.dataset.live = "true";
      })
      .catch(() => {});
    eyeless
      .decode()
      .then(() => {
        eyelessReady = true;
        painted = "";
        paintHead();
      })
      .catch(() => {});
    const lookAt = (t: number) => {
      // t in [-1, 1]: the viewer's left … right
      t = Math.max(-1, Math.min(1, t));
      return Math.round(t < 0 ? R.ref * (1 + t) : R.ref + t * (R.frames - 1 - R.ref));
    };

    /* ---------- the eyes: a blink every few seconds, wide when you come close, and long ^ ^ smiles:
       while "get started" is hovered or focused and 3 s after, 3.5 s after a surprise, at the bird once it has
       landed, and now and then on their own (3–5 s). A blink during a smile is a quick squeeze. ---------- */
    let surpriseAt = -1e9;
    let smileFrom = -1e9; // a smile can outlast its cause
    let smileUntil = -1e9;
    const smile = (from: number, until: number) => {
      // extend a smile that is on (or about to be) rather than cut it short
      if (from <= smileUntil && smileFrom <= from) smileUntil = Math.max(smileUntil, until);
      else {
        smileFrom = from;
        smileUntil = until;
      }
    };
    let nextIdleSmile = performance.now() + 9000 + Math.random() * 6000;
    let nextBlink = performance.now() + 2500 + Math.random() * 2500;
    let blinkAt = -1e9;
    let twice = false;
    const blinkPhase = (t: number): EyeMode | null => (t < 0 ? null : t < 40 ? "squint" : t < 150 ? "closed" : t < 190 ? "squint" : null);
    const eyeMode = (now: number, birdHere: boolean): EyeMode => {
      if (now - surpriseAt < 900) return "wide";
      if (now >= nextBlink) {
        blinkAt = now;
        twice = Math.random() < 0.25;
        nextBlink = now + 3000 + Math.random() * 3000;
      }
      const tb = now - blinkAt;
      const blink = blinkPhase(tb) ?? (twice ? blinkPhase(tb - 300) : null);
      let happy = hovered || focused || (now >= smileFrom && now < smileUntil);
      if (now >= nextIdleSmile) {
        // a smile of its own now and then, when nothing else is going on
        if (!happy && !birdHere) {
          smile(now, now + 3000 + Math.random() * 2000);
          happy = true;
        }
        nextIdleSmile = now + 12000 + Math.random() * 8000;
      }
      if (happy) return blink === "closed" ? "closed" : "happy";
      return blink ?? "open";
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const now = performance.now();
      pointer = { x: e.clientX, y: e.clientY };
      lastPointer = now;
      const b = robot.getBoundingClientRect();
      if (!hold) target = lookAt((e.clientX - (b.left + b.width / 2)) / Math.max(260, innerWidth * 0.42));
      // come close to its face and the eyes go wide for a moment
      const f = faceAt(cur);
      const fx = b.left + (f.x / R.w) * b.width;
      const fy = b.top + (f.y / R.h) * b.height;
      if (!hovered && !focused && now - surpriseAt > 4000 && Math.hypot(e.clientX - fx, e.clientY - fy) < Math.max(90, b.height * 0.3)) {
        surpriseAt = now;
        smile(now + 900, now + 900 + 3500); // then a long smile
      }
    };
    if (finePointer && !reduce) addEventListener("pointermove", onPointer, { passive: true });
    const onEnter = () => (hovered = true);
    const onLeave = () => {
      hovered = false;
      smile(performance.now(), performance.now() + 3000); // keep smiling a while after the pointer leaves
    };
    const onFocus = () => (focused = true);
    const onBlur = () => {
      focused = false;
      smile(performance.now(), performance.now() + 3000);
    };
    startLink.addEventListener("pointerenter", onEnter);
    startLink.addEventListener("pointerleave", onLeave);
    startLink.addEventListener("focus", onFocus);
    startLink.addEventListener("blur", onBlur);

    /* ---------- cranes and small birds: wing-beat cycles cut from the plate, flying right to left behind the wordmark ---------- */
    const cranes = CRANES.map((c) => ({ ...c, img: new Image() }));
    cranes.forEach((c) => (c.img.src = c.src));
    const sbImg = new Image();
    sbImg.src = SMALL.src;
    const perchImg = new Image();
    perchImg.src = PERCHED.src;
    const flock = FLOCK.map(([lag, dy, phase]) => ({ ...SMALL, lag, dy, phase, scale: 1, img: sbImg }));
    const landerFlyer = flock[LANDER];
    const flyers = [...cranes, ...flock];
    const loaded = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
    let yBase = 160;
    let k = 1;
    let ox = 0;
    let oy = 0;
    let rob = { x: 0, y: 0, s: 1 }; // the robot canvas in plate px: left, top, plate px per robot px
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
    // the lander's state: in the flock, flying in, perched, flying off, or gone until the flock's next pass
    const lander = { phase: "flock" as "flock" | "in" | "perch" | "out" | "gone", t0: 0, x: 0, y: 0, fx: 0, fy: 0, act: 1, actAt: 0, landed: -1e9, stay: 7000 };
    const drawBirds = (t: number) => {
      bx.clearRect(0, 0, bc.width, bc.height);
      for (const c of flyers) {
        if (!loaded(c.img)) continue;
        if (c === landerFlyer && lander.phase !== "flock") continue;
        const { x, y, f } = birdAt(c, t);
        const sc = c.scale || SCALE;
        if (x < -300 || x > FW + 300) continue;
        bx.drawImage(c.img, f * c.cw, 0, c.cw, c.ch, ox + (x - c.ax * sc) * k, oy + (y - c.ay * sc) * k, c.cw * sc * k, c.ch * sc * k);
      }
    };
    const drawFlight = (x: number, y: number, f: number) => {
      // the small birds' own flight cycle, body centre at (x, y)
      if (!loaded(sbImg)) return;
      bx.drawImage(sbImg, f * SMALL.cw, 0, SMALL.cw, SMALL.ch, ox + (x - SMALL.ax) * k, oy + (y - SMALL.ay) * k, SMALL.cw * k, SMALL.ch * k);
    };
    const drawPerched = (x: number, y: number, f: number) => {
      // feet at (x, y)
      if (!loaded(perchImg)) return;
      const s = PERCHED.size / PERCHED.scale;
      bx.drawImage(perchImg, f * PERCHED.cw, 0, PERCHED.cw, PERCHED.ch, ox + (x - PERCHED.fx * s) * k, oy + (y - PERCHED.fy * s) * k, PERCHED.cw * s * k, PERCHED.ch * s * k);
    };
    const toRobot = (x: number, y: number) => ({ x: (x - rob.x) / rob.s, y: (y - rob.y) / rob.s });
    const perchPoint = () => ({ x: rob.x + faceAt(cur).x * rob.s, y: rob.y + (PERCH_TOP[cur] + 2.5) * rob.s });
    const updateLander = (t: number, now: number) => {
      const L = lander;
      if (L.phase === "flock") {
        if (!ready) return;
        // every pass of the flock (the first a few seconds after the page opens), whatever the mouse is doing:
        // the lander peels off and glides down onto the monitor
        const p = birdAt(landerFlyer, t);
        if (now - L.landed > 9000 && p.x > 700 && p.x < 1750) {
          L.phase = "in";
          L.t0 = now;
          L.fx = p.x;
          L.fy = p.y + 8; // its feet, under the body
          hold = true;
          target = cur;
        }
        return;
      }
      if (L.phase === "gone") {
        // back in the flock once it re-enters from the right on its next pass
        if (birdAt(landerFlyer, t).x > FW + 60) L.phase = "flock";
        return;
      }
      const P = perchPoint();
      if (L.phase === "in") {
        const u = Math.min(1, (now - L.t0) / 1800);
        const e = 1 - Math.pow(1 - u, 3);
        L.x = bez(L.fx, P.x + (L.fx >= P.x ? 260 : -260), P.x, e); // it comes in from its own side
        L.y = bez(L.fy, P.y - 170, P.y, e);
        if (u < 0.86) drawFlight(L.x, L.y - 8, Math.floor(t * 24 * (1 - 0.45 * u)) % SMALL.frames);
        else drawPerched(L.x, L.y, 2);
        if (u >= 1) {
          L.phase = "perch";
          L.t0 = now;
          L.landed = now;
          L.stay = 6500 + Math.random() * 1500;
          L.act = Math.random() < 0.6 ? 1 : 2;
          L.actAt = now + 1200 + Math.random() * 800;
          smile(now + 1000, now + 3800); // it looks up at its visitor, smiles, then watches it again
        }
        return;
      }
      if (L.phase === "perch") {
        // now and then it cocks its head up at you, or gives a small hop
        let f = 0;
        let dy = 0;
        const ta = now - L.actAt;
        if (ta >= 0) {
          const dur = L.act === 1 ? 800 : 200;
          if (ta < dur) {
            if (L.act === 1) f = 1;
            else dy = -3 * Math.sin((ta / dur) * Math.PI);
          } else {
            L.act = Math.random() < 0.6 ? 1 : 2;
            L.actAt = now + 1300 + Math.random() * 1100;
          }
        }
        L.x = P.x;
        L.y = P.y;
        drawPerched(P.x, P.y + dy, f);
        // it stays a while (6.5–8 s), then flies off on its own; the mouse doesn't scare it
        if (now - L.t0 > L.stay) {
          L.phase = "out";
          L.t0 = now;
          L.fx = P.x;
          L.fy = P.y;
          hold = false;
        }
        return;
      }
      // flying off: wings up, then up and away to the left
      const ta = now - L.t0;
      if (ta < 120) {
        drawPerched(L.fx, L.fy - 2, 2);
        return;
      }
      const u = Math.min(1, (ta - 120) / 1500);
      const e = u * u;
      L.x = bez(L.fx, L.fx - 60, L.fx - 620, e);
      L.y = bez(L.fy, L.fy - 150, L.fy - 470, e);
      drawFlight(L.x, L.y - 8, Math.floor(t * 30) % SMALL.frames);
      if (u >= 1) L.phase = "gone";
    };
    const fit = () => {
      if (!alive) return;
      const h = bc.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      const rr = robot.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      bc.width = Math.round(h.width * dpr);
      bc.height = Math.round(h.height * dpr);
      k = (s.width * dpr) / FW; // canvas px per plate px
      ox = (s.left - h.left) * dpr;
      oy = (s.top - h.top) * dpr;
      rob = { x: ((rr.left - s.left) / s.width) * FW, y: ((rr.top - s.top) / s.height) * FH, s: (rr.width / s.width) * (FW / R.w) };
      // fly level with the wordmark, so the birds cross behind its letters
      const b = brand.getBoundingClientRect();
      yBase = ((b.top + b.height * 0.38 - s.top) * dpr) / k; // through the letters, mostly clear of the link
      redraw();
    };

    /* ---------- one loop for all of it; it sleeps while the tab is hidden ---------- */
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden || !alive) return;
      const t = (now - t0) / 1000;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      drawBirds(t);
      updateLander(t, now);
      if (ready) {
        const lead = birdAt(cranes[0], t);
        const craneNear = Math.abs(lead.x - FW / 2) < 820;
        const recent = finePointer && now - lastPointer < 2600;
        if (hold) target = cur;
        else if (!recent) target = craneNear ? lookAt((lead.x - FW / 2) / 640) : R.ref; // watch the lead crane while it is close
        stepClock += dt;
        if (cur !== target && stepClock > 1 / 20) {
          stepClock = 0;
          cur += Math.sign(target - cur);
        }
        // the pupils: on the bird when it comes to visit, else on you, else on the lead crane, else just ahead
        let to: { x: number; y: number } | null = null;
        if (lander.phase === "in" || lander.phase === "perch" || (lander.phase === "out" && now - lander.t0 < 700)) to = toRobot(lander.x, lander.y - 8);
        else if (recent) {
          const b = robot.getBoundingClientRect();
          to = { x: ((pointer.x - b.left) / b.width) * R.w, y: ((pointer.y - b.top) / b.height) * R.h };
        } else if (craneNear) to = toRobot(lead.x, lead.y);
        if (to) {
          const f = faceAt(cur);
          const dx = to.x - f.x;
          const dy = to.y - f.y;
          const d = Math.hypot(dx, dy) || 1;
          const a = Math.min(1, d / 170);
          want.x = (dx / d) * a;
          want.y = (dy / d) * a;
        } else {
          want.x = 0;
          want.y = 0.15;
        }
        const ease = Math.min(1, dt * 9);
        look.x += (want.x - look.x) * ease;
        look.y += (want.y - look.y) * ease;
        mode = eyeMode(now, lander.phase === "in" || lander.phase === "perch");
        paintHead();
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
      startLink.removeEventListener("pointerenter", onEnter);
      startLink.removeEventListener("pointerleave", onLeave);
      startLink.removeEventListener("focus", onFocus);
      startLink.removeEventListener("blur", onBlur);
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
        {/* the wordmark can't be highlighted (drag, double-click or an iOS long-press); screen readers still read it */}
        <h1 ref={brandRef} className="land-brand select-none [-webkit-touch-callout:none]">
          avanti<span className="sr-only">: every shop, open to every AI</span>
        </h1>
        <Link ref={startRef} href="/start" className="land-start">
          <span>get started</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </Link>
      </header>
    </main>
  );
}
