"use client";

import type { MotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BAR = 3; // px
const GAP = 3; // px
const EVERY_MS = 55; // a new bar ~18 times a second

/**
 * The voice note's live waveform: thin square ink bars scroll in from the
 * right while the owner talks (heights from the real mic level), over a
 * hairline that stays when nothing is recording. Canvas, so it costs no
 * React renders. Colour = the element's text colour.
 */
export function Waveform({ level, live, className }: { level: MotionValue<number>; live: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const ink = getComputedStyle(canvas).color;
    const bars: number[] = [];
    let raf = 0;
    let last = -Infinity;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < EVERY_MS) return;
      last = t;
      const room = Math.max(1, Math.floor(w / (BAR + GAP)));
      if (live) bars.push(level.get());
      while (bars.length > room) bars.shift();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = ink;
      const mid = Math.round(h / 2);
      ctx.globalAlpha = 0.28;
      ctx.fillRect(0, mid - 0.5, w, 1); // the hairline at rest
      ctx.globalAlpha = 1;
      const x0 = w - bars.length * (BAR + GAP);
      for (let i = 0; i < bars.length; i++) {
        const bh = Math.max(2, Math.min(h, (0.06 + bars[i] * 1.05) * h));
        ctx.fillRect(Math.round(x0 + i * (BAR + GAP)), Math.round(mid - bh / 2), BAR, Math.round(bh));
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [level, live]);

  return <canvas ref={ref} aria-hidden className={cn("block h-10 w-full text-carbon", className)} />;
}
