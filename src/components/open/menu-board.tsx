"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mic, Minus, PenLine, Plus, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Stamp } from "@/components/brand";
import type { Box2D } from "@/lib/ai/onboard";
import { DIET_TAGS } from "@/lib/ai/prompts/onboard";
import type { PriceSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DUR, SPRING, STAGGER, motionSpeed } from "@/lib/motion";
import { HangTagFace, TagChip } from "./hang-tag";
import { INK_EASE } from "./ink";
import { InkToggle } from "./ink-toggle";
import { flightTurn, TAG_H, TAG_ORIGIN, TAG_W } from "./tag-geometry";

// The menu slip the owner builds in /open: flat rice paper, a hairline under
// the title, one hairline between lines. Three modes:
//  scribble – faint placeholder lines while the AI reads (no fake text)
//  flight   – the fixed script: each item's price label leaves the photo with
//             a small turn, arcs over and settles square on its line; then the
//             line writes itself in and the price counts up. No price = the
//             vermilion "Needs a price" seal lands instead of a label.
//  review   – tap a line to edit name / price / quantity / tags; lines the
//             owner just changed by voice or text get a brief teal wash

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
  /** The owner's "AI can order" switch (default on); off = in person only. */
  ai_orderable: boolean;
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
  /** Lines the last "change anything" touched, and that change's number (restarts the wash). */
  fresh?: ReadonlySet<string>;
  freshKey?: number;
  /** Review with no lines yet (the photo was skipped). */
  emptyHint?: string;
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
  fresh,
  freshKey,
  emptyHint,
  footer,
  className,
}: MenuBoardProps) {
  return (
    <motion.section layout transition={SPRING.resize} aria-label="Your menu" className={cn("slip-drop relative", className)}>
      <div className="paper px-5 pb-7 pt-7 lg:px-8 lg:pb-8 lg:pt-8">
        <h2 className="truncate text-center font-display text-[30px] leading-[1.15] lg:text-[34px]">{title}</h2>
        <div aria-hidden className="print-rule mt-5" />
        {mode === "review" && rows.length > 0 ? (
          <motion.p
            className="-mb-1 mt-3 text-right text-[15px] leading-none text-ink-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: INK_EASE }}
          >
            AI can order
          </motion.p>
        ) : null}
        {mode === "scribble" ? (
          <ul aria-hidden>
            {Array.from({ length: placeholderRows }, (_, i) => (
              <ScribbleRow key={i} index={i} />
            ))}
          </ul>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {rows.map((row, i) => (
                <BoardRow
                  key={row.key}
                  row={row}
                  index={i}
                  mode={mode}
                  flight={flights?.[row.key]}
                  slotRef={slotRef}
                  editing={editingKey === row.key}
                  fresh={fresh?.has(row.key) ? freshKey : undefined}
                  onEdit={onEdit}
                  onChange={onChange}
                  onRemove={onRemove}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
        {mode === "review" && rows.length === 0 && emptyHint ? (
          <p className="py-10 text-center text-[17px] leading-snug text-ink-muted lg:text-[18px]">{emptyHint}</p>
        ) : null}
        {mode === "review" && onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-[16px] text-carbon underline decoration-transparent underline-offset-[5px] transition-[text-decoration-color] duration-300 hover:decoration-current"
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
    <li className="flex min-h-[72px] items-center gap-3 border-b border-ink/10 py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <motion.div
          className="h-3 bg-ink/[0.09]"
          style={{ width: `${w * 100}%`, transformOrigin: "left" }}
          initial={{ scaleX: reduce ? 1 : 0 }}
          animate={reduce ? { scaleX: 1 } : { scaleX: [0, 1, 1], opacity: [1, 1, 0.45] }}
          transition={{ duration: 2.6, delay: index * 0.35, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="mt-2.5 h-2 bg-ink/[0.05]" style={{ width: `${w * 55}%` }} />
      </div>
      <div className="shrink-0 border border-dashed border-ink/20" style={{ width: TAG_W, height: TAG_H }} />
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
  /** Set (to the change's number) when "change anything" just touched this line. */
  fresh?: number;
  onEdit?: (key: string | null) => void;
  onChange?: (key: string, patch: Partial<MenuRow>) => void;
  onRemove?: (key: string) => void;
}

/** Label flight length (s at speed 1); touchdown happens at TOUCHDOWN of it. */
export const FLIGHT_S = 0.78;
export const TOUCHDOWN = 0.8;

function BoardRow({ row, index, mode, flight, slotRef, editing, fresh, onEdit, onChange, onRemove }: BoardRowProps) {
  const reduce = useReducedMotion();
  const k = 1 / motionSpeed(); // ?speed=0.5 slows the whole script for retakes
  const turn = flightTurn(index);
  const phase = mode === "review" ? "landed" : (flight?.phase ?? "waiting");
  const shown = phase === "landed";
  const tagMounted = phase !== "waiting";
  const dx = flight && flight.phase !== "waiting" ? flight.dx : 0;
  const dy = flight && flight.phase !== "waiting" ? flight.dy : -24;
  const noPrice = row.price_cents === null;

  // The toss: an even glide across, a small arc up, a soft landing on the
  // line; the turn settles to square at touchdown. Memoized so the "landed"
  // re-render can't restart the keyframes.
  const tossTo = useMemo(() => ({ x: 0, y: [dy, dy - 28, 3, 0], scale: [0.72, 1, 1], rotate: 0, opacity: 1 }), [dy]);
  const D = FLIGHT_S * k;

  const content = (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1 pt-1">
        <motion.p
          className="text-[17px] leading-snug [overflow-wrap:anywhere] lg:text-[18px]"
          initial={mode === "flight" ? { clipPath: "inset(0 100% 0 0)" } : false}
          animate={{ clipPath: shown ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
          transition={{ duration: reduce ? 0.01 : 0.55 * k, ease: "linear" }}
        >
          {row.name || <span className="text-ink-muted">Untitled</span>}
        </motion.p>
        <motion.div
          initial={mode === "flight" ? { opacity: 0 } : false}
          animate={{ opacity: shown ? 1 : 0 }}
          transition={{ duration: DUR.micro * k, delay: shown && mode === "flight" ? 0.35 * k : 0 }}
        >
          {row.name_en ? <p className="text-[15px] leading-snug text-ink-muted lg:text-[16px]">{row.name_en}</p> : null}
          {row.tags.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.tags.map((t, ci) => (
                <motion.span
                  key={t}
                  initial={mode === "flight" ? { opacity: 0, y: 4 } : false}
                  animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                  transition={{
                    duration: 0.4 * k,
                    ease: INK_EASE,
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

      <div className="flex shrink-0 flex-col items-end" style={{ minWidth: TAG_W }}>
        <div ref={(el) => slotRef?.(row.key, el)} className="relative" style={{ width: TAG_W, height: TAG_H }}>
          {noPrice ? (
            // no price heard or seen: the seal lands instead of a label
            shown ? (
              <Stamp
                kind="HELD"
                text="Needs a price"
                size="sm"
                animate={mode === "flight" || fresh !== undefined}
                sound={false}
                className="absolute right-0 top-1/2 -translate-y-1/2 [&_.stamp-ink]:px-[0.5em] [&_.stamp-ink]:py-[0.4em]"
              />
            ) : null
          ) : tagMounted ? (
            <motion.div
              className="absolute inset-0 z-20"
              style={{ transformOrigin: TAG_ORIGIN }}
              initial={
                mode !== "flight"
                  ? // a price that just arrived by voice or text drops onto its line
                    fresh !== undefined && !reduce
                    ? { y: -18, rotate: turn, scale: 0.9, opacity: 0 }
                    : false
                  : reduce
                    ? { opacity: 0, rotate: 0 }
                    : { x: dx, y: dy, rotate: turn, scale: 0.72, opacity: 0 }
              }
              animate={mode === "flight" && !reduce ? tossTo : { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
              transition={
                reduce
                  ? { duration: 0.15 }
                  : mode !== "flight"
                    ? { duration: 0.55, ease: INK_EASE }
                    : {
                      x: { duration: D, ease: [0.42, 0, 0.22, 1] },
                      y: { duration: D, times: [0, 0.3, TOUCHDOWN, 1], ease: ["easeOut", [0.55, 0, 0.9, 0.55], "easeOut"] },
                      scale: { duration: D, times: [0, 0.72, 1], ease: ["easeOut", "easeInOut"] },
                      opacity: { duration: 0.1 },
                      // the turn settles to square as it lands (calm, no overshoot)
                      rotate: { duration: D * 0.7, ease: INK_EASE, delay: D * 0.45 },
                    }
              }
            >
              <HangTagFace cents={row.price_cents} counted={shown} />
            </motion.div>
          ) : null}
        </div>
        <motion.span
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-[15px] leading-none text-ink-muted tabular-nums"
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
    // review: a line said into the menu eases in, a removed one folds away, the rest close up
    <motion.li
      data-row={row.key}
      layout={review ? "position" : false}
      initial={review ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: reduce ? 0.01 : 0.45, ease: INK_EASE }}
      className="relative isolate border-b border-ink/10 py-2.5 last:border-0"
    >
      {fresh !== undefined ? <span key={fresh} aria-hidden className="open-fresh" /> : null}
      {/* the line being edited: one wash behind the whole line (name, price, switch, editor), same edges top to bottom */}
      {editing ? <span aria-hidden className="pointer-events-none absolute inset-y-0 -inset-x-3 -z-10 bg-highlight/35" /> : null}
      <div className="flex items-start gap-3">
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
        className={cn(
          "-ml-3 min-w-0 flex-1 py-2 pl-3 pr-2 transition-colors duration-300",
          review && !editing && "cursor-pointer hover:bg-highlight/35",
          editing && "cursor-pointer",
        )}
      >
        {content}
      </div>
      {/* "AI can order": outside the tap-to-edit area (a switch can't live inside a button) */}
      <div className="w-[52px] shrink-0 pt-4">
        {review ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, ease: INK_EASE }}>
            <InkToggle
              checked={row.ai_orderable}
              onCheckedChange={(ai_orderable) => onChange?.(row.key, { ai_orderable })}
              aria-label={`AI can order ${row.name || "this item"}`}
            />
          </motion.div>
        ) : null}
      </div>
      </div>
      <AnimatePresence initial={false}>
        {mode === "review" && editing ? (
          <motion.div
            key="editor"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: INK_EASE }}
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
    </motion.li>
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
      <Icon className="size-[15px]" strokeWidth={1.75} aria-hidden />
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
    <div className="space-y-5 pb-4 pt-3">
      <label className="block">
        <span className="label-print mb-2 block text-ink-muted">Name</span>
        <input value={row.name} onChange={(e) => onChange({ name: e.target.value.slice(0, 80) })} className="field-print" />
      </label>

      <div className="flex gap-4">
        <label className="block w-[44%]">
          <span className="label-print mb-2 block text-ink-muted">Price</span>
          <span
            className={cn(
              "flex h-12 items-center border bg-paper px-3 transition-colors focus-within:border-carbon focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-carbon",
              parsed === "invalid" ? "border-stamp-deep" : "border-[rgb(22_58_66/0.34)] hover:border-[rgb(22_58_66/0.55)]",
            )}
          >
            <span className="font-mono text-[17px] text-ink-muted">$</span>
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
              className="h-full w-full min-w-0 bg-transparent pl-1.5 font-mono text-[17px] outline-none placeholder:text-ink-muted"
            />
          </span>
        </label>
        <div className="flex-1">
          <span className="label-print mb-2 block text-ink-muted">How many</span>
          <Stepper value={row.stock} onChange={(stock) => onChange({ stock })} min={0} max={999} label="How many" />
        </div>
      </div>

      <div>
        <span className="label-print mb-2 block text-ink-muted">Allergens &amp; diet (only what&apos;s true)</span>
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
                  "h-11 border px-3.5 text-[15px] leading-none transition-colors duration-200 lg:text-[16px]",
                  on ? "border-carbon bg-carbon text-paper" : "border-ink/25 bg-paper text-ink hover:border-ink/55",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onRemove} className="btn-quiet -ml-3 text-ink-muted">
          <Trash2 className="size-4" aria-hidden /> Remove
        </button>
        <button type="button" onClick={onDone} className="btn-ink min-h-11! px-7! text-[18px]!">
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
  /** Kept for callers; every stepper is drawn in ink now. */
  tone?: "dusk" | "chalk";
  label?: string;
}) {
  const btn =
    "grid size-12 place-items-center border border-[rgb(22_58_66/0.34)] bg-paper text-ink transition-colors duration-200 hover:border-ink active:bg-highlight disabled:opacity-35 disabled:hover:border-[rgb(22_58_66/0.34)]";
  return (
    <div className="flex h-12 items-center gap-2" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Less"
        disabled={value === null || value <= min}
        onClick={() => onChange(value === null ? null : Math.max(min, value - 1))}
        className={btn}
      >
        <Minus className="size-5" strokeWidth={1.5} aria-hidden />
      </button>
      <span className="min-w-10 text-center font-mono text-[20px] font-medium tabular-nums">{value === null ? "—" : value}</span>
      <button
        type="button"
        aria-label="More"
        disabled={value !== null && value >= max}
        onClick={() => onChange(value === null ? Math.max(min, 1) : Math.min(max, value + 1))}
        className={btn}
      >
        <Plus className="size-5" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}
