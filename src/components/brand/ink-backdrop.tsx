"use client";

import { useEffect, useRef } from "react";

// The landing's ink plate as a faint, fixed backdrop on laptops (≥ 1024px): bottom-anchored like the
// landing (the plate covers the screen and its drawn bottom, 93% down, sits on the bottom edge), the
// sky kept clear, and a soft clearing around every child of a `data-ink-clear` element, measured as the
// page scrolls and animates. So the trees and the river fill only the empty paper, and text, inputs and
// buttons always sit on clean paper. Only the plate's ink is drawn (its paper is made clear), so the
// page's own paper shows through everywhere: no painted wash, no seams. Phones get nothing.

const PLATE = "/landing/land.webp";
const STRENGTH = 0.4; // faint
const STEP = 8; // css px per cell of the clearing mask
const PAD = 24; // clean paper this far around content...
const FEATHER = 72; // ...then the plate comes back over this distance
const SKY_FROM = 0.4; // the plate rises in from 40% down the screen...
const SKY_FULL = 0.72; // ...and is at full strength from 72%

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

export function InkBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    const grid = document.createElement("canvas");
    const gctx = grid.getContext("2d");
    if (!canvas || !ctx || !gctx) return;
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

    function draw(rects: DOMRect[]) {
      const gw = grid.width;
      const gh = grid.height;
      const data = gctx!.createImageData(gw, gh);
      const px = data.data;
      const reach = PAD + FEATHER;
      for (let j = 0; j < gh; j++) {
        const y = (j + 0.5) * STEP;
        const sky = smooth((y / h - SKY_FROM) / (SKY_FULL - SKY_FROM));
        if (sky <= 0) continue;
        for (let i = 0; i < gw; i++) {
          const x = (i + 0.5) * STEP;
          let keep = 1;
          for (const r of rects) {
            const dx = Math.max(r.left - x, 0, x - r.right);
            const dy = Math.max(r.top - y, 0, y - r.bottom);
            if (dx > reach || dy > reach) continue;
            const k = smooth((Math.hypot(dx, dy) - PAD) / FEATHER);
            if (k < keep) keep = k;
            if (keep === 0) break;
          }
          px[(j * gw + i) * 4 + 3] = Math.round(255 * sky * keep);
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
      const rects: DOMRect[] = [];
      let sig = `${w}x${h}`;
      const measure = (el: Element) => {
        // a `display: contents` wrapper has no box of its own: its children are the blocks
        if (getComputedStyle(el).display === "contents") {
          for (const child of el.children) measure(child);
          return;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < -FEATHER || r.top > h + FEATHER) return;
        rects.push(r);
        sig += `|${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`;
      };
      document.querySelectorAll("[data-ink-clear]").forEach((host) => {
        for (const child of host.children) measure(child);
      });
      if (sig === last) return;
      last = sig;
      draw(rects);
    }

    function start() {
      if (!wide.matches || raf) return;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const onResize = () => {
      layout();
      if (wide.matches) start();
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
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 hidden size-full opacity-0 transition-opacity duration-[1200ms] ease-out data-[ready=true]:opacity-100 motion-reduce:transition-none lg:block"
    />
  );
}
