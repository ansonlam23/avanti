"use client";

import { useEffect, useRef } from "react";

// The landing's ink plate as a faint, fixed backdrop: bottom-anchored like the landing (the plate covers
// the screen and its drawn bottom, 93% down, sits on the bottom edge), measured against the page's content
// as it scrolls and animates, so text, inputs and buttons always sit on clean paper. Only the plate's ink
// is drawn (its paper is made clear), so the page's own paper shows through everywhere: no seams.
//
// variant "full" (laptops only): the plate's whole lower half, with a soft clearing around every child
//   of a `data-ink-clear` element, so the trees and the river fill the empty paper (/open, /privacy).
// variant "thin": trees in the side margins (laptops) and a thin river strip along the bottom of the
//   screen, with each `data-ink-block` element cleared as one block (its own box, or with
//   data-ink-block="children" the box around its children). Phones get the strip only.
//
// Never inside a frame (the /demo stage's panes), and pointer-events: none, behind everything.

const PLATE = "/landing/land.webp";
const STRENGTH = 0.4; // faint
const STEP = 8; // css px per cell of the clearing mask
const SKY_FROM = 0.4; // the plate rises in from 40% down the screen...
const SKY_FULL = 0.72; // ...and is at full strength from 72%

const TUNE = {
  full: { pad: 24, feather: 72 }, // clean paper this far around content, then the plate comes back over this distance
  thin: { pad: 16, feather: 56 },
} as const;
const BAND_FROM = 0.84; // thin: the river strip rises in from 84% down the screen...
const BAND_FULL = 0.97; // ...and is at full strength from 97%
const SIDE_SOFT = 96; // thin: how softly the side margins give way to the strip under the content

type Box = { left: number; top: number; right: number; bottom: number };

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** The plate's ink alone, in the brand's sumi teal: alpha from darkness, the paper fully clear. */
function inkOnly(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = 10;
    px[i + 1] = 46;
    px[i + 2] = 58;
    px[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (220 - l) / 180)));
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** The boxes of an element's blocks: a `display: contents` wrapper has no box of its own, so its children count. */
function boxesOf(el: Element, out: Box[]) {
  if (getComputedStyle(el).display === "contents") {
    for (const child of el.children) boxesOf(child, out);
    return;
  }
  const r = el.getBoundingClientRect();
  if (r.width >= 1 && r.height >= 1) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
}

export function InkBackdrop({ variant = "full" }: { variant?: "full" | "thin" }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    const grid = document.createElement("canvas");
    const gctx = grid.getContext("2d");
    if (!canvas || !ctx || !gctx) return;
    if (window.self !== window.top) return; // the /demo stage's small panes stay plain
    const thin = variant === "thin";
    const { pad: PAD, feather: FEATHER } = TUNE[variant];
    const wide = window.matchMedia("(min-width: 1024px)");
    let ink: HTMLCanvasElement | null = null;
    let plate: HTMLCanvasElement | null = null; // the ink, placed for this window
    let dpr = 1;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = "";

    function layout() {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      grid.width = Math.ceil(w / STEP);
      grid.height = Math.ceil(h / STEP);
      last = "";
      if (!ink) return;
      const ph = Math.max(h / 0.93, (w * 9) / 16);
      const pw = (ph * 16) / 9;
      plate = document.createElement("canvas");
      plate.width = canvas!.width;
      plate.height = canvas!.height;
      const p = plate.getContext("2d");
      if (!p) return;
      p.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.globalAlpha = STRENGTH;
      p.imageSmoothingQuality = "high";
      p.drawImage(ink, (w - pw) / 2, h - ph * 0.93, pw, ph);
    }

    function draw(boxes: Box[], spanL: number, spanR: number) {
      const gw = grid.width;
      const gh = grid.height;
      const data = gctx!.createImageData(gw, gh);
      const px = data.data;
      const reach = PAD + FEATHER;
      const sides = thin && wide.matches;
      for (let j = 0; j < gh; j++) {
        const y = (j + 0.5) * STEP;
        const sky = smooth((y / h - SKY_FROM) / (SKY_FULL - SKY_FROM));
        const band = thin ? smooth((y / h - BAND_FROM) / (BAND_FULL - BAND_FROM)) : 0;
        if (sky <= 0 && band <= 0) continue;
        for (let i = 0; i < gw; i++) {
          const x = (i + 0.5) * STEP;
          // full: the whole lower plate; thin: the side margins (outside the content's span) and the strip
          const show = thin
            ? Math.max(sides ? sky * Math.max(smooth((spanL - x) / SIDE_SOFT), smooth((x - spanR) / SIDE_SOFT)) : 0, band)
            : sky;
          if (show <= 0) continue;
          let keep = 1;
          for (const r of boxes) {
            const dx = Math.max(r.left - x, 0, x - r.right);
            const dy = Math.max(r.top - y, 0, y - r.bottom);
            if (dx > reach || dy > reach) continue;
            const k = smooth((Math.hypot(dx, dy) - PAD) / FEATHER);
            if (k < keep) keep = k;
            if (keep === 0) break;
          }
          px[(j * gw + i) * 4 + 3] = Math.round(255 * show * keep);
        }
      }
      gctx!.putImageData(data, 0, 0);
      ctx!.globalCompositeOperation = "copy";
      ctx!.drawImage(plate!, 0, 0);
      ctx!.globalCompositeOperation = "destination-in";
      ctx!.imageSmoothingEnabled = true;
      ctx!.imageSmoothingQuality = "high";
      ctx!.drawImage(grid, 0, 0, gw * STEP * dpr, gh * STEP * dpr);
      ctx!.globalCompositeOperation = "source-over";
    }

    // Every frame, measure the content; redraw only when something moved.
    function frame() {
      raf = requestAnimationFrame(frame);
      if (!plate) return;
      const boxes: Box[] = [];
      // full: every child of a data-ink-clear element is cleared on its own
      document.querySelectorAll("[data-ink-clear]").forEach((host) => {
        for (const child of host.children) boxesOf(child, boxes);
      });
      // thin: each data-ink-block element is one block
      let spanL = Infinity;
      let spanR = -Infinity;
      document.querySelectorAll("[data-ink-block]").forEach((el) => {
        const parts: Box[] = [];
        if (el.getAttribute("data-ink-block") === "children") for (const child of el.children) boxesOf(child, parts);
        else boxesOf(el, parts);
        if (!parts.length) return;
        const b = {
          left: Math.min(...parts.map((p) => p.left)),
          top: Math.min(...parts.map((p) => p.top)),
          right: Math.max(...parts.map((p) => p.right)),
          bottom: Math.max(...parts.map((p) => p.bottom)),
        };
        // inside a scrolling panel (the chat's feed), only the panel's visible part counts
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const oy = getComputedStyle(p).overflowY;
          if (oy === "auto" || oy === "scroll") {
            const c = p.getBoundingClientRect();
            b.top = Math.max(b.top, c.top);
            b.bottom = Math.min(b.bottom, c.bottom);
            break;
          }
        }
        if (b.bottom <= b.top) return;
        boxes.push(b);
        spanL = Math.min(spanL, b.left);
        spanR = Math.max(spanR, b.right);
      });
      if (spanL > spanR) {
        spanL = 0; // nothing measured yet: no side margins, only the strip
        spanR = w;
      }
      const near = boxes.filter((b) => b.bottom > -FEATHER && b.top < h + FEATHER);
      let sig = `${w}x${h}|${Math.round(spanL)},${Math.round(spanR)}`;
      for (const b of near) sig += `|${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`;
      if (sig === last) return;
      last = sig;
      draw(near, spanL, spanR);
    }

    function start() {
      if ((!thin && !wide.matches) || raf) return;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const onResize = () => {
      layout();
      if (thin || wide.matches) start();
      else stop();
    };

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      ink = inkOnly(img);
      layout();
      canvas.dataset.ready = "true";
      start();
    };
    img.src = PLATE;
    window.addEventListener("resize", onResize);
    wide.addEventListener("change", onResize);
    return () => {
      stop();
      img.onload = null;
      window.removeEventListener("resize", onResize);
      wide.removeEventListener("change", onResize);
    };
  }, [variant]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={
        "pointer-events-none fixed inset-0 -z-10 size-full opacity-0 transition-opacity duration-[1200ms] ease-out data-[ready=true]:opacity-100 motion-reduce:transition-none " +
        (variant === "thin" ? "block" : "hidden lg:block")
      }
    />
  );
}
