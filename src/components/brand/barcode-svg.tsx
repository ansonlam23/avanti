"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { code128Bars, toCode128B } from "./barcode";

const QUIET = 8; // modules of white either side (scanners need it)

/** A real Code 128 barcode, in ink (crisp edges, no smoothing). */
export function Barcode({
  value,
  className,
  height = 44,
  moduleWidth = 1.5,
  label,
}: {
  value: string;
  className?: string;
  height?: number;
  /** CSS px per module. */
  moduleWidth?: number;
  /** Accessible name (default: "Barcode <value>"). */
  label?: string;
}) {
  const { bars, width } = useMemo(() => code128Bars(value), [value]);
  const total = width + QUIET * 2;
  return (
    <svg
      role="img"
      aria-label={label ?? `Barcode ${toCode128B(value)}`}
      viewBox={`${-QUIET} 0 ${total} 10`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={cn("block shrink-0 text-ink", className)}
      style={{ width: total * moduleWidth, height }}
    >
      {bars.map(([x, w]) => (
        <rect key={x} x={x} y={0} width={w} height={10} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Kept for callers: the printer is gone in ink, so its mouth draws nothing. */
export function PrinterMouth({ className }: { className?: string; gone?: boolean }) {
  return <span aria-hidden className={cn("printer-mouth hidden", className)} />;
}
