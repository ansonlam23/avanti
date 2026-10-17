"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Box2D } from "@/lib/ai/onboard";
import { cn } from "@/lib/utils";
import { EASE, SPRING } from "@/lib/motion";

// The owner's counter photo. One element (layoutId) that moves through the
// flow: a print on the counter → the big photo being read (a scan bar sweeps
// it) → a banner the items print out of → a small print on the review screen.

/** `print`: the big framed print on a laptop's right pane (talk step). */
export type PhotoMode = "pinned" | "scan" | "banner" | "thumb" | "print";

interface CounterPhotoProps {
  src: string;
  width: number;
  height: number;
  mode: PhotoMode;
  /** Shared-layout id: the same id in two places morphs one into the other. */
  layoutId?: string;
  /** Item boxes (banner mode): crop marks light up as each item leaves. */
  boxes?: Array<Box2D | null>;
  litBoxes?: ReadonlySet<number>;
  /** The element whose rect maps 1:1 to the image (for flight origins). */
  imageRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

const ROTATE: Record<PhotoMode, number> = { pinned: -2.5, thumb: 3, print: -1.6, scan: 0, banner: 0 };

export function CounterPhoto({ src, width, height, mode, layoutId, boxes, litBoxes, imageRef, className }: CounterPhotoProps) {
  const reduce = useReducedMotion();
  const ratio = width / height;
  const framed = mode === "pinned" || mode === "thumb" || mode === "print";

  return (
    // width per mode (and per breakpoint) lives in open.css (.open-photo)
    <motion.div
      layoutId={layoutId}
      layout
      transition={SPRING.resize}
      data-mode={mode}
      className={cn(
        "open-photo relative mx-auto",
        framed ? "bg-paper p-1.5 pb-4 shadow-slip" : "shadow-slip",
        mode === "print" && "p-2.5 pb-8 shadow-[var(--shadow-lift)]",
        className,
      )}
      style={{
        ...({ "--r": String(ratio) } as React.CSSProperties),
        rotate: ROTATE[mode],
        borderRadius: framed ? 2 : 3,
      }}
    >
      <div ref={imageRef} className="relative overflow-hidden rounded-[2px]" style={{ aspectRatio: `${width} / ${height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob/data URL */}
        <img src={src} alt="Your counter" draggable={false} className="absolute inset-0 size-full object-cover" />

        {mode === "scan" ? <ScanOverlay reduce={!!reduce} /> : null}

        {mode === "banner" && boxes
          ? boxes.map((b, i) => (b ? <BoxMarks key={i} box={b} lit={litBoxes?.has(i) ?? false} /> : null))
          : null}
      </div>
    </motion.div>
  );
}

/** The AI reading the photo: a dark scan bar sweeping, crop marks at the corners. */
function ScanOverlay({ reduce }: { reduce: boolean }) {
  return (
    <>
      {(["left-3 top-3 border-l-[3px] border-t-[3px]", "right-3 top-3 border-r-[3px] border-t-[3px]", "left-3 bottom-3 border-b-[3px] border-l-[3px]", "right-3 bottom-3 border-b-[3px] border-r-[3px]"] as const).map((c) => (
        <span key={c} aria-hidden className={cn("absolute size-6 border-paper drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]", c)} />
      ))}
      {reduce ? (
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-1 bg-paper shadow-[0_0_0_1px_rgb(22_22_22/0.6)]" />
      ) : (
        <motion.div
          aria-hidden
          className="absolute inset-0"
          initial={{ y: "-2%" }}
          animate={{ y: ["-2%", "100%"] }}
          transition={{ duration: 1.9, ease: EASE.inOut, repeat: Infinity, repeatType: "reverse" }}
        >
          <div className="absolute inset-x-0 bottom-full h-16 bg-gradient-to-b from-transparent to-paper/25" />
          <div className="absolute inset-x-0 top-0 h-1 -translate-y-1/2 bg-paper shadow-[0_0_0_1px_rgb(22_22_22/0.55),0_2px_10px_rgb(0_0_0/0.45)]" />
        </motion.div>
      )}
    </>
  );
}

function BoxMarks({ box, lit }: { box: Box2D; lit: boolean }) {
  const [ymin, xmin, ymax, xmax] = box;
  return (
    <motion.div
      aria-hidden
      className="absolute"
      style={{
        top: `${ymin / 10}%`,
        left: `${xmin / 10}%`,
        height: `${(ymax - ymin) / 10}%`,
        width: `${(xmax - xmin) / 10}%`,
      }}
      initial={false}
      animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 1.08 }}
      transition={{ duration: 0.24, ease: EASE.out }}
    >
      {(["left-0 top-0 border-l-[3px] border-t-[3px]", "right-0 top-0 border-r-[3px] border-t-[3px]", "bottom-0 left-0 border-b-[3px] border-l-[3px]", "bottom-0 right-0 border-b-[3px] border-r-[3px]"] as const).map((c) => (
        <span key={c} className={cn("absolute size-3.5 border-paper drop-shadow-[0_1px_1px_rgb(0_0_0/0.7)]", c)} />
      ))}
      <span className="absolute inset-0 bg-paper/15" />
    </motion.div>
  );
}

/** Center of an item's box (or of the photo) in viewport coordinates. */
export function photoPoint(el: HTMLElement | null, box: Box2D | null): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!box) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const [ymin, xmin, ymax, xmax] = box;
  return { x: r.left + (r.width * (xmin + xmax)) / 2000, y: r.top + (r.height * (ymin + ymax)) / 2000 };
}
