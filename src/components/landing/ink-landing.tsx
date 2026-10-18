"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// The landing: one ink plate, edge to edge. The drawn lake fills the screen,
// the CRT-headed AI shopper stands at the water, two cranes and three small
// birds cross the sky behind the wordmark. Only "avanti" and one quiet link
// sit on top. Styles: `land-*` in src/styles/landing.css. Media: /public/landing.
//
// The robot is alive in small ways, all in the plate's ink: its screen always
// smiles (^ ^) and blinks now and then; its head follows you (or the lead crane);
// a few seconds after the page opens (and on later passes) one of the small birds
// lands on its monitor and rides along for a while. A plum blossom sits in its lapel.

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
// The same screens with the eyes painted out (a 6 × 3 sheet of 251 × 144 cells), so the smile can be drawn on:
// per head frame, the region [x, y, w, h] it covers in the robot canvas.
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
// Where a bird stands, per head frame: the monitor's top edge above the screen's centre, measured from the head
// patches' alpha as [x, y, slope] in the robot canvas (the edge tilts as the head turns). The bird rides on it.
const PERCH: readonly (readonly [number, number, number])[] = [
  [326.5, 20.9, -0.043], [331.1, 19.0, -0.037], [343.4, 16.6, -0.0219], [354.6, 15.3, -0.0241], [365.9, 13.6, -0.0226],
  [382.6, 11.6, 0], [391.6, 10.8, 0], [405.2, 9.1, 0.024], [417.6, 8.7, 0.0235], [432.1, 8.4, 0.0156],
  [450.4, 7.7, 0.0338], [460.2, 8.7, 0.0388], [472.3, 10.1, 0.0403], [480.3, 10.4, 0.0502], [488.1, 10.8, 0.0622],
  [498.3, 11.8, 0.0725], [503.7, 12.7, 0.0753], [510.1, 13.8, 0.0842],
];
const FEET_DOWN = 2; // the feet sit this far into the monitor's outline (robot px)
// A plum blossom with a pine tuft in the lapel, in the robot's ink. It is baked into robot-body.webp too; the canvas
// redraws it only where the head patch covers the body.
const CLOTHES = [{ src: `${MEDIA}/robot-blossom.webp`, x: 500, y: 548 }];
// A small bird perched: sitting, head cocked, wings raised (landing / taking off). Cells at 3× plate scale, feet at
// (fx, fy); drawn a touch larger than the flock (`size`) so it reads on the monitor.
const PERCHED = { src: `${MEDIA}/bird-perch.webp`, cw: 102, ch: 87, fx: 48, fy: 78, scale: 3, size: 1.25 };

// The smile's look, the screen's own glow: pale paper with a soft halo on the dark screen.
const EYE_PAPER = "#ede7e0";
const EYE_GLOW = "rgba(242, 237, 229, 0.95)";
type EyeMode = "happy" | "closed"; // ^ ^, or the blink's quick squeeze to a soft line

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
    let cur = R.ref;
    let target = R.ref;
    let stepClock = 0;
    let lastPointer = -1e9;
    let hovered = false; // "get started" under the mouse
    let focused = false; // "get started" focused
    let glow = 0; // the smile glows a touch brighter while "get started" is hovered or focused (eased 0–1)
    let mode: EyeMode = "happy";
    let painted = ""; // what the head canvas shows now, so identical frames aren't repainted

    const drawEye = ([cx, cy, w, h]: Eye, m: EyeMode) => {
      // happy: an upturned arc (^); closed: the blink's soft line with a little smile in it
      const happy = m === "happy";
      const y = cy + h * (happy ? 0.16 : 0.08);
      rx.save();
      rx.shadowColor = EYE_GLOW;
      rx.shadowBlur = 16 + 8 * glow;
      rx.strokeStyle = EYE_PAPER;
      rx.lineCap = "round";
      rx.lineWidth = w * (happy ? 0.19 : 0.13);
      rx.beginPath();
      rx.moveTo(cx - w * 0.44, y);
      rx.quadraticCurveTo(cx, happy ? cy - h * 0.42 : y + h * 0.14, cx + w * 0.44, y);
      rx.stroke();
      rx.stroke();
      rx.restore();
    };
    const paintHead = () => {
      if (!ready) return;
      const k = cur;
      const sig = `${k}|${mode}|${Math.round(glow * 12)}`;
      if (sig === painted) return;
      painted = sig;
      const [px, py, pw, ph] = R.patch;
      const c = k % R.cols;
      const r = Math.floor(k / R.cols);
      rx.clearRect(0, 0, R.w, R.h);
      rx.drawImage(body, 0, 0);
      rx.clearRect(px, py, pw, ph);
      rx.drawImage(heads, c * pw, r * ph, pw, ph, px, py, pw, ph);
      // the screen without its old oval eyes, then the smile on it
      const [ex, ey, ew, eh] = EYELESS.rects[k];
      rx.drawImage(eyeless, c * EYELESS.cw, r * EYELESS.ch, ew, eh, ex, ey, ew, eh);
      for (const e of EYES[k]) drawEye(e, mode);
      // the blossom over the head patch (the body image already has it below)
      rx.save();
      rx.beginPath();
      rx.rect(px, py, pw, ph);
      rx.clip();
      for (const cl of clothes) rx.drawImage(cl.im, cl.x, cl.y);
      rx.restore();
    };
    // the canvas takes over from the still (which already smiles) once everything it draws is ready
    Promise.all([body.decode(), heads.decode(), eyeless.decode(), ...clothes.map((c) => c.im.decode())])
      .then(() => {
        if (!alive) return;
        ready = true;
        painted = "";
        paintHead();
        robot.dataset.live = "true";
      })
      .catch(() => {});
    const lookAt = (t: number) => {
      // t in [-1, 1]: the viewer's left … right
      t = Math.max(-1, Math.min(1, t));
      return Math.round(t < 0 ? R.ref * (1 + t) : R.ref + t * (R.frames - 1 - R.ref));
    };

    /* ---------- the eyes: always ^ ^, with a blink every 3–6 s (sometimes two): a quick squeeze, ~110 ms ---------- */
    let nextBlink = performance.now() + 2500 + Math.random() * 2500;
    let blinkAt = -1e9;
    let twice = false;
    const squeezed = (t: number) => t >= 0 && t < 110;
    const eyeMode = (now: number): EyeMode => {
      if (now >= nextBlink) {
        blinkAt = now;
        twice = Math.random() < 0.25;
        nextBlink = now + 3000 + Math.random() * 3000;
      }
      const tb = now - blinkAt;
      return squeezed(tb) || (twice && squeezed(tb - 300)) ? "closed" : "happy";
    };

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      lastPointer = performance.now();
      const b = robot.getBoundingClientRect();
      target = lookAt((e.clientX - (b.left + b.width / 2)) / Math.max(260, innerWidth * 0.42));
    };
    if (finePointer && !reduce) addEventListener("pointermove", onPointer, { passive: true });
    const onEnter = () => (hovered = true);
    const onLeave = () => (hovered = false);
    const onFocus = () => (focused = true);
    const onBlur = () => (focused = false);
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
    // the lander's state: in the flock, flying in, perched, flying off, or gone until the flock's next pass.
    // While perched it rides the head: `k` is the head frame it last stood on, `wob`/`wv` a small balancing tilt
    // (a damped spring nudged when the head steps).
    const lander = {
      phase: "flock" as "flock" | "in" | "perch" | "out" | "gone",
      t0: 0, x: 0, y: 0, fx: 0, fy: 0, act: 1, actAt: 0, landed: -1e9, stay: 7000,
      k: R.ref, wob: 0, wv: 0,
    };
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
    const drawPerched = (x: number, y: number, f: number, ang = 0) => {
      // feet at (x, y), tilted about the feet by `ang`
      if (!loaded(perchImg)) return;
      const s = PERCHED.size / PERCHED.scale;
      bx.save();
      bx.translate(ox + x * k, oy + y * k);
      if (ang) bx.rotate(ang);
      bx.drawImage(perchImg, f * PERCHED.cw, 0, PERCHED.cw, PERCHED.ch, -PERCHED.fx * s * k, -PERCHED.fy * s * k, PERCHED.cw * s * k, PERCHED.ch * s * k);
      bx.restore();
    };
    // the perch on head frame `kk`, in plate px
    const perchAt = (kk: number) => ({ x: rob.x + PERCH[kk][0] * rob.s, y: rob.y + (PERCH[kk][1] + FEET_DOWN) * rob.s });
    const updateLander = (t: number, now: number, dt: number) => {
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
        }
        return;
      }
      if (L.phase === "gone") {
        // back in the flock once it re-enters from the right on its next pass
        if (birdAt(landerFlyer, t).x > FW + 60) L.phase = "flock";
        return;
      }
      const P = perchAt(cur); // the head keeps turning: the perch is wherever the monitor's top edge is now
      if (L.phase === "in") {
        const u = Math.min(1, (now - L.t0) / 1800);
        const e = 1 - Math.pow(1 - u, 3);
        L.x = bez(L.fx, P.x + (L.fx >= P.x ? 260 : -260), P.x, e); // it comes in from its own side
        L.y = bez(L.fy, P.y - 170, P.y, e);
        if (u < 0.86) drawFlight(L.x, L.y - 8, Math.floor(t * 24 * (1 - 0.45 * u)) % SMALL.frames);
        else drawPerched(L.x, L.y, 2, Math.atan(PERCH[cur][2]) * e);
        if (u >= 1) {
          L.phase = "perch";
          L.t0 = now;
          L.landed = now;
          L.stay = 6500 + Math.random() * 1500;
          L.act = Math.random() < 0.6 ? 1 : 2;
          L.actAt = now + 1200 + Math.random() * 800;
          L.k = cur;
          L.wob = 0;
          L.wv = 0;
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
        // it rides the head: its feet stay on the top edge of whichever frame shows, it leans with the edge, and
        // a step of the head nudges a small balancing wobble (a damped spring, clamped to ±6°)
        if (cur !== L.k) {
          L.wv -= (PERCH[cur][0] - PERCH[L.k][0]) * 0.15;
          L.k = cur;
        }
        const W0 = 22;
        const ZETA = 0.4;
        const n = Math.max(1, Math.ceil(dt / 0.008));
        for (let i = 0; i < n; i++) {
          const h = dt / n;
          L.wv += (-W0 * W0 * L.wob - 2 * ZETA * W0 * L.wv) * h;
          L.wob = Math.max(-0.105, Math.min(0.105, L.wob + L.wv * h));
        }
        L.x = P.x;
        L.y = P.y;
        drawPerched(P.x, P.y + dy, f, Math.atan(PERCH[cur][2]) + L.wob);
        // it stays a while (6.5–8 s), then flies off on its own; the mouse doesn't scare it
        if (now - L.t0 > L.stay) {
          L.phase = "out";
          L.t0 = now;
          L.fx = P.x;
          L.fy = P.y;
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
      if (ready) {
        // the head first (a bird on it or not), so a perched bird is drawn on this frame's monitor
        const lead = birdAt(cranes[0], t);
        const recent = finePointer && now - lastPointer < 2600;
        if (!recent) target = Math.abs(lead.x - FW / 2) < 820 ? lookAt((lead.x - FW / 2) / 640) : R.ref; // watch the lead crane while it is close
        stepClock += dt;
        if (cur !== target && stepClock > 1 / 20) {
          stepClock = 0;
          cur += Math.sign(target - cur);
        }
      }
      updateLander(t, now, dt);
      if (ready) {
        glow += ((hovered || focused ? 1 : 0) - glow) * Math.min(1, dt * 8);
        mode = eyeMode(now);
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
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed still under the head canvas (it smiles too) */}
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
