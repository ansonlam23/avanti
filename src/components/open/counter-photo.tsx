"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Box2D } from "@/lib/ai/onboard";
import { cn } from "@/lib/utils";
import { EASE, SPRING } from "@/lib/motion";

// The owner's counter photo. One element (layoutId) that moves through the
// flow: a print on a paper mat → the big photo being read (a thin scan line
// sweeps it) → a banner the prices fly out of → a small print on the review
// screen. Square and straight in every mode.

/** `print`: the big matted print on a laptop's right pane (talk step). */
export type PhotoMode = "pinned" | "scan" | "banner" | "thumb" | "print";

interface CounterPhotoProps {
  src: string;
  width: number;
  height: number;
  mode: PhotoMode;
  /** Shared-layout id: the same id in two places morphs one into the other. */
  layoutId?: string;
  /** Item boxes (banner mode): corner marks light up as each item leaves. */
  boxes?: Array<Box2D | null>;
  litBoxes?: ReadonlySet<number>;
  /** The element whose rect maps 1:1 to the image (for flight origins). */
  imageRef?: React.Ref<HTMLDivElement>;
  className?: string;
}

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
        framed ? "paper p-1.5" : "shadow-[0_0_0_1px_rgb(22_58_66/0.16)]",
        mode === "print" && "p-3 shadow-[0_18px_36px_-28px_rgb(22_58_66/0.45)]",
        className,
      )}
      style={{ ...({ "--r": String(ratio) } as React.CSSProperties), borderRadius: 0 }}
    >
      <div ref={imageRef} className="relative overflow-hidden" style={{ aspectRatio: `${width} / ${height}` }}>
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

const CORNER = [
  "left-0 top-0 border-l-2 border-t-2",
  "right-0 top-0 border-r-2 border-t-2",
  "bottom-0 left-0 border-b-2 border-l-2",
  "bottom-0 right-0 border-b-2 border-r-2",
] as const;

/** The AI reading the photo: one thin paper line sweeping, the corners marked. */
function ScanOverlay({ reduce }: { reduce: boolean }) {
  return (
    <>
      <div aria-hidden className="absolute inset-4">
        {CORNER.map((c) => (
          <span key={c} className={cn("absolute size-7 border-paper drop-shadow-[0_0_1px_rgb(22_58_66/0.7)]", c)} />
        ))}
      </div>
      {reduce ? (
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-0.5 bg-paper shadow-[0_0_0_1px_rgb(22_58_66/0.35)]" />
      ) : (
        <motion.div
          aria-hidden
          className="absolute inset-0"
          initial={{ y: "-2%" }}
          animate={{ y: ["-2%", "100%"] }}
          transition={{ duration: 2.4, ease: EASE.inOut, repeat: Infinity, repeatType: "reverse" }}
        >
          {/* a flat wash just behind the line (no gradient, no glow) */}
          <div className="absolute inset-x-0 bottom-full h-14 bg-paper/[0.14]" />
          <div className="absolute inset-x-0 top-0 h-0.5 -translate-y-1/2 bg-paper shadow-[0_0_0_1px_rgb(22_58_66/0.3)]" />
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
      animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 1.06 }}
      transition={{ duration: 0.3, ease: EASE.out }}
    >
      {CORNER.map((c) => (
        <span key={c} className={cn("absolute size-3.5 border-paper drop-shadow-[0_0_1px_rgb(22_58_66/0.8)]", c)} />
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
