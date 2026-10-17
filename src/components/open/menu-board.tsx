"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mic, Minus, PenLine, Plus, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Stamp } from "@/components/brand";
import type { Box2D } from "@/lib/ai/onboard";
import { DIET_TAGS } from "@/lib/ai/prompts/onboard";
import type { PriceSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DUR, EASE, SPRING, STAGGER, motionSpeed } from "@/lib/motion";
import { HangTagFace, TagChip } from "./hang-tag";
import { restAngle, TAG_H, TAG_ORIGIN, TAG_W } from "./tag-geometry";

// The menu slip the owner builds in /open. Three modes:
//  scribble – faint placeholder lines while the AI reads (no fake text)
//  flight   – the fixed script: each item's price sticker leaves the photo at
//             ~3× its rest angle, lands on the pop curve and settles; then the
//             line prints itself and the price counts up. No price = a red
//             NEEDS A PRICE stamp lands instead of a sticker.
//  review   – tap a line to edit name / price / quantity / tags

export interface MenuRow {
  key: string;
  name: string;
  name_en: string | null;
  description: string | null;
  price_cents: number | null;
  price_source: PriceSource;
  tags: string[];
  stock: number | null;
  box_2d: Box2D | null;
}

export type RowFlight =
  | { phase: "waiting" }
  | { phase: "flying"; dx: number; dy: number }
  | { phase: "landed"; dx: number; dy: number };

const EDIT_TAGS = [
  "nut-free",
  "contains-nuts",
  "gluten-free",
  "contains-gluten",
  "dairy-free",
  "contains-dairy",
  "contains-eggs",
  "vegan",
  "vegetarian",
  "spicy",
] as const;

interface MenuBoardProps {
  title: string;
  mode: "scribble" | "flight" | "review";
  rows: MenuRow[];
  placeholderRows?: number;
  flights?: Record<string, RowFlight>;
  slotRef?: (key: string, el: HTMLDivElement | null) => void;
  editingKey?: string | null;
  onEdit?: (key: string | null) => void;
  onChange?: (key: string, patch: Partial<MenuRow>) => void;
  onRemove?: (key: string) => void;
  onAdd?: () => void;
  footer?: React.ReactNode;
  className?: string;
}

export function MenuBoard({
  title,
  mode,
  rows,
  placeholderRows = 4,
  flights,
  slotRef,
  editingKey,
  onEdit,
  onChange,
  onRemove,
  onAdd,
  footer,
  className,
}: MenuBoardProps) {
  return (
    <motion.section layout transition={SPRING.resize} aria-label="Your menu" className={cn("slip-drop relative my-1.5", className)}>
      {/* edges drawn outside the paper (no mask), so stickers can fly in from the photo */}
      <div className="paper edge-teeth px-5 pb-8 pt-8">
        <h2 className="thermal truncate text-center font-display text-[30px] font-extrabold uppercase leading-[0.95]">{title}</h2>
        <div aria-hidden className="print-rule mb-1 mt-4" />
        {mode === "scribble" ? (
          <ul aria-hidden>
            {Array.from({ length: placeholderRows }, (_, i) => (
              <ScribbleRow key={i} index={i} />
            ))}
          </ul>
        ) : (
          <ul>
            {rows.map((row, i) => (
              <BoardRow
                key={row.key}
                row={row}
                index={i}
                mode={mode}
                flight={flights?.[row.key]}
                slotRef={slotRef}
                editing={editingKey === row.key}
                onEdit={onEdit}
                onChange={onChange}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
        {mode === "review" && onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[3px] border-2 border-dashed border-ink/30 text-[15px] transition active:scale-[0.98]"
          >
            <Plus className="size-4" aria-hidden /> Add something
          </button>
        ) : null}
        {footer}
      </div>
    </motion.section>
  );
}

// ── Placeholder lines while the AI reads ───────────────────────────────

const SCRIBBLE_W = [0.62, 0.48, 0.56, 0.42, 0.52];

function ScribbleRow({ index }: { index: number }) {
  const reduce = useReducedMotion();
  const w = SCRIBBLE_W[index % SCRIBBLE_W.length];
  return (
    <li className="flex min-h-[68px] items-center gap-3 border-b border-dashed border-ink/12 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <motion.div
          className="h-3 rounded-[1px] bg-ink/10"
          style={{ width: `${w * 100}%`, transformOrigin: "left" }}
          initial={{ scaleX: reduce ? 1 : 0 }}
          animate={reduce ? { scaleX: 1 } : { scaleX: [0, 1, 1], opacity: [1, 1, 0.45] }}
          transition={{ duration: 2.4, delay: index * 0.35, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="mt-2 h-2 rounded-[1px] bg-ink/[0.06]" style={{ width: `${w * 55}%` }} />
      </div>
      <div className="shrink-0 rounded-[4px] border-2 border-dashed border-ink/15" style={{ width: TAG_W, height: TAG_H }} />
    </li>
  );
}

// ── A menu line ────────────────────────────────────────────────────────

interface BoardRowProps {
  row: MenuRow;
  index: number;
  mode: "flight" | "review";
  flight?: RowFlight;
  slotRef?: (key: string, el: HTMLDivElement | null) => void;
  editing: boolean;
  onEdit?: (key: string | null) => void;
  onChange?: (key: string, patch: Partial<MenuRow>) => void;
  onRemove?: (key: string) => void;
}

/** Sticker flight length (s at speed 1); touchdown happens at TOUCHDOWN of it. */
export const FLIGHT_S = 0.78;
export const TOUCHDOWN = 0.8;

function BoardRow({ row, index, mode, flight, slotRef, editing, onEdit, onChange, onRemove }: BoardRowProps) {
  const reduce = useReducedMotion();
  const k = 1 / motionSpeed(); // ?speed=0.5 slows the whole script for retakes
  const rest = restAngle(index);
  const phase = mode === "review" ? "landed" : (flight?.phase ?? "waiting");
  const shown = phase === "landed";
  const tagMounted = phase !== "waiting";
  const dx = flight && flight.phase !== "waiting" ? flight.dx : 0;
  const dy = flight && flight.phase !== "waiting" ? flight.dy : -24;
  const noPrice = row.price_cents === null;

  // The toss: an even glide across, a small arc up, a drop just past the slot,
  // settle (the pop), then the turn spring starts at touchdown. Memoized so
  // the "landed" re-render can't restart the keyframes.
  const tossTo = useMemo(
    () => ({ x: 0, y: [dy, dy - 34, 9, 0], scale: [0.6, 1.08, 1], rotate: rest, opacity: 1 }),
    [dy, rest],
  );
  const D = FLIGHT_S * k;

  const content = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1 pt-1.5">
        <motion.p
          className="text-[16px] uppercase leading-snug [overflow-wrap:anywhere]"
          initial={mode === "flight" ? { clipPath: "inset(0 100% 0 0)" } : false}
          animate={{ clipPath: shown ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
          transition={{ duration: reduce ? 0.01 : 0.5 * k, ease: "linear" }}
        >
          {row.name || <span className="text-ink-muted">Untitled</span>}
        </motion.p>
        <motion.div
          initial={mode === "flight" ? { opacity: 0 } : false}
          animate={{ opacity: shown ? 1 : 0 }}
          transition={{ duration: DUR.micro * k, delay: shown && mode === "flight" ? 0.35 * k : 0 }}
        >
          {row.name_en ? <p className="text-[14px] leading-snug text-ink-muted lg:text-[15px]">{row.name_en}</p> : null}
          {row.tags.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {row.tags.map((t, ci) => (
                <motion.span
                  key={t}
                  initial={mode === "flight" ? { opacity: 0, scale: 0.8 } : false}
                  animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                  transition={{
                    duration: DUR.micro * k,
                    ease: EASE.pop,
                    delay: shown && mode === "flight" ? (0.45 + ci * STAGGER.chip) * k : 0,
                  }}
                >
                  <TagChip tag={t} />
                </motion.span>
              ))}
            </div>
          ) : null}
        </motion.div>
      </div>

      <div className="flex shrink-0 flex-col items-center" style={{ width: TAG_W }}>
        <div ref={(el) => slotRef?.(row.key, el)} className="relative" style={{ width: TAG_W, height: TAG_H }}>
          {noPrice ? (
            // no price heard or seen: the stamp lands instead of a sticker
            shown ? (
              <Stamp kind="HELD" text="Needs a price" size="sm" animate={mode === "flight"} sound={false} className="absolute right-0 top-1 origin-right scale-90" />
            ) : null
          ) : tagMounted ? (
            <motion.div
              className="absolute inset-0 z-20"
              style={{ transformOrigin: TAG_ORIGIN }}
              initial={
                mode !== "flight"
                  ? false
                  : reduce
                    ? { opacity: 0, rotate: rest }
                    : { x: dx, y: dy, rotate: rest * 3, scale: 0.6, opacity: 0 }
              }
              animate={mode === "flight" && !reduce ? tossTo : { x: 0, y: 0, rotate: rest, scale: 1, opacity: 1 }}
              transition={
                reduce
                  ? { duration: 0.15 }
                  : {
                      x: { duration: D, ease: [0.42, 0, 0.22, 1] },
                      y: { duration: D, times: [0, 0.3, TOUCHDOWN, 1], ease: ["easeOut", [0.55, 0, 0.9, 0.55], "easeOut"] },
                      scale: { duration: D, times: [0, 0.72, 1], ease: ["easeOut", "easeInOut"] },
                      opacity: { duration: 0.1 },
                      // one overshooting turn as it sticks (spring re-timed with ?speed, same damping ratio)
                      rotate: {
                        type: "spring",
                        stiffness: SPRING.tag.stiffness / (k * k),
                        damping: SPRING.tag.damping / k,
                        delay: D * TOUCHDOWN,
                      },
                    }
              }
            >
              <HangTagFace cents={row.price_cents} counted={shown} />
            </motion.div>
          ) : null}
        </div>
        <motion.span
          className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] leading-none text-ink-muted tabular-nums lg:text-[15px]"
          initial={mode === "flight" ? { opacity: 0 } : false}
          animate={{ opacity: shown ? 1 : 0 }}
          transition={{ duration: DUR.micro * k, delay: shown && mode === "flight" ? 0.4 * k : 0 }}
        >
          <PriceSourceMark source={noPrice ? "missing" : row.price_source} />
          {row.stock === null ? "qty —" : `×${row.stock}`}
        </motion.span>
      </div>
    </div>
  );

  const review = mode === "review";
  const toggle = () => onEdit?.(editing ? null : row.key);
  return (
    <li className="border-b border-dashed border-ink/15 py-3 last:border-0">
      {/* same element in every mode, so nothing remounts when the slip turns editable */}
      <div
        role={review ? "button" : undefined}
        tabIndex={review ? 0 : undefined}
        aria-expanded={review ? editing : undefined}
        aria-label={review ? `Edit ${row.name || "item"}` : undefined}
        onClick={review ? toggle : undefined}
        onKeyDown={
          review
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              }
            : undefined
        }
        className={cn("-mx-2 rounded-[3px] px-2 py-1", review && "transition active:bg-ink/[0.05]")}
      >
        {content}
      </div>
      <AnimatePresence initial={false}>
        {mode === "review" && editing ? (
          <motion.div
            key="editor"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.micro, ease: EASE.out }}
            className="overflow-hidden"
          >
            <RowEditor
              row={row}
              onChange={(patch) => onChange?.(row.key, patch)}
              onRemove={() => onRemove?.(row.key)}
              onDone={() => onEdit?.(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

/** Where a price came from: heard in the voice note, read off a tag, or typed by the owner. */
function PriceSourceMark({ source }: { source: PriceSource }) {
  const mark =
    source === "spoken"
      ? { Icon: Mic, label: "price heard in your voice note" }
      : source === "tag_in_photo"
        ? { Icon: Tag, label: "price read off a tag in your photo" }
        : source === "owner"
          ? { Icon: PenLine, label: "price you typed" }
          : null;
  if (!mark) return null;
  const { Icon, label } = mark;
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex">
      <Icon className="size-[15px]" aria-hidden />
    </span>
  );
}

// ── Inline editor ──────────────────────────────────────────────────────

export function parsePriceInput(text: string): number | null | "invalid" {
  const s = text.replace(/[$\s]/g, "").replace(",", ".");
  if (s === "") return null;
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(s)) return "invalid";
  const cents = Math.round(Number(s) * 100);
  return cents > 0 && cents <= 100_000 ? cents : "invalid";
}

function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function RowEditor({
  row,
  onChange,
  onRemove,
  onDone,
}: {
  row: MenuRow;
  onChange: (patch: Partial<MenuRow>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const [priceText, setPriceText] = useState(centsToInput(row.price_cents));
  const parsed = parsePriceInput(priceText);
  const tagChoices = [...EDIT_TAGS, ...row.tags.filter((t) => !(EDIT_TAGS as readonly string[]).includes(t))];

  return (
    <div className="mt-2 space-y-4 rounded-[3px] bg-paper-shade p-4">
      <label className="block">
        <span className="label-print mb-1.5 block text-ink-muted">Name</span>
        <input value={row.name} onChange={(e) => onChange({ name: e.target.value.slice(0, 80) })} className="field-print" />
      </label>

      <div className="flex gap-3">
        <label className="block w-[44%]">
          <span className="label-print mb-1.5 block text-ink-muted">Price</span>
          <span
            className={cn(
              "flex h-12 items-center rounded-[3px] border-2 bg-white/65 px-3 text-[18px] focus-within:outline-3 focus-within:outline-offset-1 focus-within:outline-carbon",
              parsed === "invalid" ? "border-stamp-deep" : "border-ink/75",
            )}
          >
            <span className="text-ink-muted">$</span>
            <input
              inputMode="decimal"
              placeholder="—"
              value={priceText}
              aria-invalid={parsed === "invalid" || undefined}
              onChange={(e) => {
                setPriceText(e.target.value);
                const p = parsePriceInput(e.target.value);
                if (p !== "invalid") onChange({ price_cents: p, price_source: p === null ? "missing" : "owner" });
              }}
              className="h-full w-full min-w-0 bg-transparent pl-1 text-[16px] outline-none placeholder:text-ink-muted"
            />
          </span>
        </label>
        <div className="flex-1">
          <span className="label-print mb-1.5 block text-ink-muted">How many</span>
          <Stepper value={row.stock} onChange={(stock) => onChange({ stock })} min={0} max={999} label="How many" />
        </div>
      </div>

      <div>
        <span className="label-print mb-1.5 block text-ink-muted">Allergens &amp; diet (only what&apos;s true)</span>
        <div className="flex flex-wrap gap-2">
          {tagChoices.map((t) => {
            const on = row.tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    tags: on ? row.tags.filter((x) => x !== t) : DIET_TAGS.filter((x) => x === t || row.tags.includes(x)),
                  })
                }
                className={cn(
                  "h-11 rounded-[3px] border-2 px-3 text-[14px] leading-none transition",
                  on ? "border-ink bg-ink text-paper" : "border-ink/25 text-ink",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onRemove} className="btn-quiet px-1 text-ink-muted">
          <Trash2 className="size-4" aria-hidden /> Remove
        </button>
        <button type="button" onClick={onDone} className="btn-ink min-h-11! px-5! text-[18px]!">
          Done
        </button>
      </div>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  /** Kept for callers; every stepper is printed in ink now. */
  tone?: "dusk" | "chalk";
  label?: string;
}) {
  const btn = "grid size-12 place-items-center rounded-[3px] border-2 border-ink/75 bg-white/50 transition active:bg-ink/10 disabled:opacity-35";
  return (
    <div className="flex h-12 items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Less"
        disabled={value === null || value <= min}
        onClick={() => onChange(value === null ? null : Math.max(min, value - 1))}
        className={btn}
      >
        <Minus className="size-5" aria-hidden />
      </button>
      <span className="min-w-10 text-center font-display text-[24px] font-extrabold tabular-nums">{value === null ? "—" : value}</span>
      <button
        type="button"
        aria-label="More"
        disabled={value !== null && value >= max}
        onClick={() => onChange(value === null ? Math.max(min, 1) : Math.min(max, value + 1))}
        className={btn}
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}
