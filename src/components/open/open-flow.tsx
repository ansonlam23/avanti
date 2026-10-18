"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, BadgeCheck, Lock, Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { InkBackdrop, OpenSign, type NeonState } from "@/components/brand";
import type { OnboardDraft } from "@/lib/ai/onboard";
import type { MenuRevision } from "@/lib/ai/onboard-revise";
import type { CreateShopRequest, CreateShopResponse } from "@/lib/db/shops";
import { DUR, EASE, SPRING, motionSpeed } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CounterPhoto, photoPoint } from "./counter-photo";
import { INK_EASE, inkRise } from "./ink";
import strip1600 from "./ink-strip-1600.webp";
import strip800 from "./ink-strip-800.webp";
import { LiveCard } from "./live-card";
import { FLIGHT_S, MenuBoard, parsePriceInput, TOUCHDOWN, type MenuRow, type RowFlight } from "./menu-board";
import { blobToDataUrl, dataUrlToBlob, preparePhoto, type PreparedPhoto } from "./photo";
import { rememberMyShop } from "@/lib/my-shops";
import { applyRevision, changeSummary, DEFAULT_STOCK, menuForRevise, pruneUnclear } from "./revise";
import { loadLive, loadRun, saveLive, saveRun, type OnboardResponse } from "./run-store";
import { aiCapValid, DEFAULT_BASICS, ShopBasics, type Basics } from "./shop-basics";
import { SignSwitch } from "./sign-switch";
import { SnapStep } from "./snap-step";
import { StatusLine, StepHeading } from "./step-heading";
import { StickyNote } from "./sticky-note";
import { TellBox, type TellNote } from "./tell-box";
import { TopBar } from "./top-bar";
import { useKeyboardInset } from "./use-keyboard";
import { useStopwatch } from "./use-stopwatch";
import type { Recording } from "./use-recorder";
import { useWide } from "./use-wide";
import "./open.css";

// /open — "Open in 40 seconds". Three beats, one primary action each:
// snap (or skip) → (reading → prices land on the menu → check: change anything
// by talking or typing) → open → live.
// Phone: one column. Laptop: a two-pane stage (open.css): the step on the
// left, the result building up on the right (photo → menu slip → the sign).

type Beat = "snap" | "reading" | "tags" | "review" | "switch" | "live";
export type Shot = "tags" | "review" | "live";

const BEAT_STEP: Record<Beat, number> = { snap: 0, reading: 1, tags: 1, review: 1, switch: 2, live: 3 };

interface ReadError {
  code: string;
  message: string;
}

/** One "change anything": a voice note or typed words. */
type TellInput = { audio?: Recording; notes?: string };

/** A note about a line's price ("price for bottled water") that the line's own seal already shows. */
function repeatsASeal(note: string, rows: MenuRow[]): boolean {
  const n = note.toLowerCase();
  return n.includes("price") && rows.some((r) => r.price_cents === null && r.name.trim() && n.includes(r.name.trim().toLowerCase()));
}

/** Case-insensitive dedupe for the "I couldn't tell" notes. */
function dedupeNotes(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function audioExt(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("wav")) return "wav";
  return "audio";
}

function rowsFrom(draft: OnboardDraft): MenuRow[] {
  return draft.items.map((it, i) => ({
    key: `r${i}-${it.name}`,
    name: it.name,
    name_en: it.name_en,
    description: it.description,
    price_cents: it.price_cents,
    price_source: it.price_source,
    tags: it.tags,
    stock: it.est_quantity ?? DEFAULT_STOCK,
    box_2d: it.box_2d ?? null,
    ai_orderable: true,
  }));
}

/** Same rounding as the stopwatch chip (whole seconds, floored) so they always agree. */
function formatOpenTime(ms: number): { value: number; unit: string; rest?: string } {
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return { value: s, unit: "s" };
  return { value: Math.floor(s / 60), unit: "min", rest: `${s % 60} s` };
}

export function OpenFlow({ shot }: { shot: Shot | null }) {
  const reduce = !!useReducedMotion();
  const wide = useWide();
  const watch = useStopwatch();
  const { freeze: freezeWatch } = watch;

  const [beat, setBeat] = useState<Beat>("snap");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [tellNote, setTellNote] = useState<TellNote | null>(null);
  const [fresh, setFresh] = useState<{ keys: ReadonlySet<string>; n: number }>({ keys: new Set(), n: 0 });
  const [heard, setHeard] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [readError, setReadError] = useState<ReadError | null>(null);
  const [response, setResponse] = useState<OnboardResponse | null>(null);
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [unclear, setUnclear] = useState<string[]>([]);
  const [basics, setBasics] = useState<Basics>(DEFAULT_BASICS);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [flights, setFlights] = useState<Record<string, RowFlight>>({});
  const [litBoxes, setLitBoxes] = useState<ReadonlySet<number>>(new Set());
  const [flipped, setFlipped] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [live, setLive] = useState<{ result: CreateShopResponse; elapsedMs: number } | null>(null);
  const [sign, setSign] = useState<NeonState>("off");
  const [shotNote, setShotNote] = useState<string | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const slotEls = useRef(new Map<string, HTMLDivElement>());
  const photoEl = useRef<HTMLDivElement | null>(null);
  const tellSeq = useRef(0);
  const keyboard = useKeyboardInset();

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms / motionSpeed()));
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const slotRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) slotEls.current.set(key, el);
    else slotEls.current.delete(key);
  }, []);

  // ── The tag script ───────────────────────────────────────────────────
  const playTags = useCallback(
    (list: MenuRow[]) => {
      clearTimers();
      setEditingKey(null);
      setLitBoxes(new Set());
      setFlights(Object.fromEntries(list.map((r) => [r.key, { phase: "waiting" } as RowFlight])));
      setBeat("tags");
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });

      const settle = reduce ? 60 : 560; // let the photo + board finish their layout move
      // one tag after another; long menus tighten up so the whole script stays ≤ ~2.4 s
      const gap = reduce ? 40 : Math.min(340, 2400 / Math.max(1, list.length - 1));
      const flight = reduce ? 160 : FLIGHT_S * TOUCHDOWN * 1000; // tag in the air until touchdown
      list.forEach((row, i) => {
        const t = settle + i * gap;
        later(t, () => {
          const slot = slotEls.current.get(row.key)?.getBoundingClientRect();
          // the camera follows the tags down a long menu (everything moves together)
          if (slot && slot.bottom > window.innerHeight - 24) {
            window.scrollBy({ top: slot.bottom - window.innerHeight + 120, behavior: reduce ? "auto" : "smooth" });
          }
          const origin = photoPoint(photoEl.current, row.box_2d);
          const dx = slot && origin ? origin.x - (slot.left + slot.width / 2) : 0;
          const dy = slot && origin ? origin.y - (slot.top + slot.height / 2) : -60;
          setLitBoxes((s) => new Set(s).add(i));
          setFlights((f) => ({ ...f, [row.key]: { phase: "flying", dx, dy } }));
        });
        later(t + flight, () => {
          setFlights((f) => {
            const cur = f[row.key];
            const d = cur && cur.phase !== "waiting" ? cur : { dx: 0, dy: 0 };
            return { ...f, [row.key]: { phase: "landed", dx: d.dx, dy: d.dy } };
          });
          setLitBoxes((s) => {
            const n = new Set(s);
            n.delete(i);
            return n;
          });
        });
      });
      later(settle + Math.max(0, list.length - 1) * gap + flight + (reduce ? 250 : 1300), () => {
        setBeat("review");
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      });
    },
    [clearTimers, later, reduce],
  );

  const applyResponse = useCallback(
    (resp: OnboardResponse) => {
      const list = rowsFrom(resp.draft);
      setResponse(resp);
      setRows(list);
      setUnclear(resp.draft.unclear);
      setHeard(resp.draft.heard);
      setLanguage(resp.draft.language);
      setTellNote(null);
      setBasics((b) => ({ ...b, name: b.name || resp.draft.shop_name || "" }));
      playTags(list);
    },
    [playTags],
  );

  // ── Beat 1 → 2: read the photo (one real Gemini call) ────────────────
  const readMenu = useCallback(
    async (p: PreparedPhoto) => {
      clearTimers();
      setReadError(null);
      setResponse(null);
      setBeat("reading");
      window.scrollTo({ top: 0 });
      const started = performance.now();

      const fd = new FormData();
      fd.append("photo", p.blob, "counter.jpg");
      fd.append("language_hint", navigator.language || "en");

      let res: Response;
      let json: unknown = null;
      try {
        res = await fetch("/api/onboard", { method: "POST", body: fd });
        json = await res.json().catch(() => null);
      } catch {
        setReadError({ code: "network", message: "No connection. Check your signal and try again." });
        return;
      }
      if (!res.ok) {
        const e = (json as { error?: ReadError } | null)?.error;
        setReadError({ code: e?.code ?? `http_${res.status}`, message: e?.message ?? "I couldn't read that one." });
        return;
      }
      const resp = json as OnboardResponse;
      if (!resp?.draft?.items?.length) {
        setReadError({
          code: "empty",
          message: "I didn't spot anything to sell. Try another photo, or just tell me what you have.",
        });
        return;
      }
      // Keep the real scan on screen long enough to read on camera.
      const wait = Math.max(0, 900 - (performance.now() - started));
      later(wait, () => applyResponse(resp));

      const elapsedAtDraftMs = watch.read();
      blobToDataUrl(p.blob)
        .then((dataUrl) =>
          saveRun({
            v: 1,
            response: resp,
            photo: { dataUrl, width: p.width, height: p.height },
            elapsedAtDraftMs,
            savedAt: new Date().toISOString(),
          }),
        )
        .catch(() => {});
    },
    [clearTimers, later, applyResponse, watch],
  );

  const onFile = useCallback(
    async (file: File) => {
      setPhotoBusy(true);
      setPhotoError(null);
      try {
        const p = await preparePhoto(file);
        setPhoto((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return p;
        });
        void readMenu(p);
      } catch (err) {
        setPhotoError((err as Error).message || "I couldn't open that photo. Try another one.");
      } finally {
        setPhotoBusy(false);
      }
    },
    [readMenu],
  );

  // ── Or skip the photo: an empty menu, and the owner just tells me ────
  const skipPhoto = useCallback(() => {
    clearTimers();
    setPhoto((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    setResponse(null);
    setReadError(null);
    setRows([]);
    setUnclear([]);
    setHeard(null);
    setTellNote(null);
    setBeat("review");
    window.scrollTo({ top: 0 });
  }, [clearTimers]);

  // ── Change anything: voice or typed words → only the changes (one Gemini call) ──
  const tell = useCallback(
    async (input: TellInput) => {
      if (changing) return;
      setChanging(true);
      setTellNote(null);
      setEditingKey(null);
      const { menu, keys } = menuForRevise(rows);
      const fd = new FormData();
      fd.append("menu", JSON.stringify(menu));
      if (input.audio) fd.append("audio", input.audio.blob, `change.${audioExt(input.audio.mimeType)}`);
      if (input.notes) fd.append("notes", input.notes);
      if (basics.name.trim()) fd.append("shop_name", basics.name.trim());
      fd.append("language_hint", language || navigator.language || "en");
      try {
        let res: Response;
        let json: { revision?: MenuRevision; error?: { message?: string } } | null = null;
        try {
          res = await fetch("/api/onboard/revise", { method: "POST", body: fd });
          json = await res.json().catch(() => null);
        } catch {
          setTellNote({ text: "No connection. Check your signal and try again.", tone: "error" });
          return;
        }
        if (!res.ok || !json?.revision) {
          setTellNote({ text: json?.error?.message ?? "I didn't catch that. Try again.", tone: "error" });
          return;
        }
        const revision = json.revision;
        const n = ++tellSeq.current;
        const newKey = (i: number) => `said-${n}-${i}`;
        const applied = applyRevision(rows, revision.changes, keys, newKey);
        setRows((cur) => applyRevision(cur, revision.changes, keys, newKey).rows);
        const gone = rows.filter((r) => !applied.rows.some((x) => x.key === r.key)).map((r) => r.name);
        setUnclear((u) => dedupeNotes([...pruneUnclear(u, applied.rows, gone), ...revision.unclear]));
        setFresh({ keys: new Set(applied.touched), n });
        if (revision.heard) setHeard(revision.heard);
        if (revision.language) setLanguage(revision.language);
        const named = revision.shop_name;
        if (named) setBasics((b) => ({ ...b, name: named }));
        const changed = applied.added + applied.updated + applied.removed > 0;
        setTellNote({ text: changed || !named ? changeSummary(applied) : `Your shop is “${named}”.`, tone: "plain" });
        // bring the first changed line into view (a phone's key bar covers the bottom)
        const first = applied.touched[0];
        if (first) {
          later(120, () =>
            document
              .querySelector(`[data-row="${CSS.escape(first)}"]`)
              ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }),
          );
        }
      } finally {
        setChanging(false);
      }
    },
    [changing, rows, basics.name, language, later, reduce],
  );

  // ── Beat 4: turn on the sign (creates the real shop) ─────────────────
  const validRows = rows.filter((r) => r.name.trim());
  const flip = useCallback(async () => {
    if (creating) return;
    setFlipped(true);
    setCreating(true);
    setCreateError(null);
    const aiCap = basics.acceptAi ? parsePriceInput(basics.aiMax) : null;
    const body: CreateShopRequest = {
      name: basics.name.trim(),
      owner_language: language ?? "en",
      photo_url: response?.photo_url ?? null,
      pickup_window: { start: basics.start, end: basics.end },
      rules: {
        max_per_order: basics.maxPerOrder,
        accept_ai_orders: basics.acceptAi,
        // the owner's cap on one AI order (omitted = no cap)
        ...(typeof aiCap === "number" ? { ai_max_order_cents: aiCap } : {}),
      },
      items: validRows.map((r) => ({
        name: r.name.trim(),
        name_en: r.name_en?.trim() || null,
        description: r.description,
        price_cents: r.price_cents,
        price_source: r.price_cents === null ? "missing" : r.price_source,
        tags: r.tags,
        stock: r.stock ?? 0,
        ai_orderable: r.ai_orderable,
      })),
    };
    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | (CreateShopResponse & { error?: undefined })
        | { error: { message: string } }
        | null;
      if (!res.ok || !json || json.error) {
        throw new Error(json?.error?.message ?? "Couldn't turn on the sign. Try again.");
      }
      const result = json as CreateShopResponse;
      const elapsedMs = watch.stop();
      // this browser's "my shops" + owner token (CONTRACTS §11)
      rememberMyShop(result.shop.slug, result.owner_token);
      setLive({ result, elapsedMs });
      setSign("flickering-on");
      saveLive({ v: 1, result, elapsedMs, savedAt: new Date().toISOString() });
    } catch (err) {
      setFlipped(false);
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }, [response, creating, basics, validRows, watch, language]);

  const onLit = useCallback(() => {
    setSign("on");
    setBeat("live");
  }, []);

  // ── ?shot= replays (development only; real saved runs only) ──────────
  useEffect(() => {
    if (!shot) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (shot === "live") {
        const s = loadLive();
        if (!s) return setShotNote("No real shop opened in this tab yet. Run the flow once, then retake.");
        freezeWatch(s.elapsedMs);
        setLive({ result: s.result, elapsedMs: s.elapsedMs });
        setBasics((b) => ({ ...b, name: s.result.shop.name }));
        setFlipped(true);
        setBeat("switch");
        later(700, () => setSign("flickering-on"));
        return;
      }
      const run = loadRun();
      if (!run) return setShotNote("No real menu read in this tab yet. Run the flow once, then retake.");
      const blob = await dataUrlToBlob(run.photo.dataUrl);
      if (cancelled) return;
      setPhoto({ blob, url: URL.createObjectURL(blob), width: run.photo.width, height: run.photo.height });
      freezeWatch(run.elapsedAtDraftMs);
      if (shot === "review") {
        const list = rowsFrom(run.response.draft);
        setResponse(run.response);
        setRows(list);
        setUnclear(run.response.draft.unclear);
        setBasics((b) => ({ ...b, name: run.response.draft.shop_name ?? "" }));
        setBeat("review");
      } else {
        setBeat("reading");
        later(1400, () => applyResponse(run.response));
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // replay once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ── Render ───────────────────────────────────────────────────────────
  const step = BEAT_STEP[beat];
  const scene = beat === "snap" ? "snap" : beat === "switch" || beat === "live" ? "sign" : "menu";
  const missing = validRows.filter((r) => r.price_cents === null).length;
  const aiCapOk = !basics.acceptAi || aiCapValid(basics.aiMax);
  const canContinue = validRows.length > 0 && basics.name.trim().length > 0 && basics.start < basics.end && aiCapOk;
  const boardTitle = basics.name.trim() || response?.draft.shop_name || "Today";
  const toSign = () => {
    setEditingKey(null);
    setBeat("switch");
    window.scrollTo({ top: 0 });
  };
  const needsPrice = validRows.find((r) => r.price_cents === null);
  // "I couldn't tell" notes, minus the ones a line already says (its "Needs a price" seal)
  const notes = unclear.filter((u) => !repeatsASeal(u, validRows));
  const tellBox = (
    <TellBox
      busy={changing}
      note={tellNote}
      hint={
        validRows.length === 0
          ? "Like: “Lemon bars 4.75, brownies 3. No nuts.”"
          : needsPrice
            ? `Like: “${needsPrice.name}, four fifty.”`
            : "Like: “Add cookies, 2.50.”"
      }
      placeholder={validRows.length ? "Say or type a change" : "What do you sell?"}
      onVoice={(audio) => void tell({ audio })}
      onText={(notes) => void tell({ notes })}
    />
  );

  return (
    <div className="flex min-h-dvh touch-manipulation flex-col">
      {/* laptops: the landing's plate, faint and fixed, in the empty paper around every step (never behind content) */}
      <InkBackdrop />
      {/* the bar spans the screen (the logo sits in /start's spot); the flow is a centred column */}
      <TopBar done={step} current={step} />
      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-5 pb-10 md:max-w-[520px] lg:max-w-page lg:px-10 lg:pb-12">

      {shotNote ? <p className="paper mb-5 px-4 py-3 text-[16px] lg:max-w-[560px]">{shotNote}</p> : null}

      <LayoutGroup>
        {/* "wait": a scene leaves before the next mounts, so layout-animated
            pieces (photo, slip) never animate the old scene's height away */}
        <AnimatePresence mode="wait" initial={false}>
          {scene === "snap" ? (
            <Scene key="snap" beat={beat}>
              <SnapStep busy={photoBusy} error={photoError} onFirstTap={watch.start} onFile={onFile} onSkip={skipPhoto} />
            </Scene>
          ) : null}

          {scene === "menu" && (photo || beat === "review") ? (
            <Scene key="menu" beat={beat} error={readError !== null} className={cn("gap-6", beat === "review" && "pb-64 lg:pb-0")}>
              {beat === "review" ? (
                <StepHeading
                  step={2}
                  title="Check your menu."
                  sub={validRows.length ? "Tap a line, or just tell me what to change." : "Tell me what you sell and what it costs."}
                  className="lg:[grid-area:head]"
                >
                  {/* phone: the photo rides along as a small print; a laptop has the room for the heading instead */}
                  {wide || !photo ? null : (
                    <div className="mt-1 shrink-0">
                      <CounterPhoto
                        src={photo.url}
                        width={photo.width}
                        height={photo.height}
                        mode="thumb"
                        layoutId="counter-photo"
                      />
                    </div>
                  )}
                </StepHeading>
              ) : photo ? (
                // laptop: the narration over the photo being read, held in view (sticky) while a
                // long slip on the right scrolls under the stickers. If the read failed, the
                // photo steps right and the way forward takes the left (the step's side).
                <div
                  className={cn(
                    "flex flex-col gap-3 lg:sticky lg:top-8 lg:gap-6 lg:self-start",
                    readError ? "lg:[grid-area:board]" : "lg:[grid-area:left]",
                  )}
                >
                  <CounterPhoto
                    src={photo.url}
                    width={photo.width}
                    height={photo.height}
                    layoutId="counter-photo"
                    // the scan bar only sweeps while the AI is really reading
                    mode={beat === "reading" && !readError ? "scan" : "banner"}
                    imageRef={photoEl}
                    boxes={rows.map((r) => r.box_2d)}
                    litBoxes={litBoxes}
                    className="lg:order-last lg:ml-0"
                  />
                  {readError ? null : <ReadingStatus beat={beat} found={rows.length} ms={response?.ms ?? null} />}
                </div>
              ) : null}

              {/* laptop: "change anything" under the heading; a phone keeps it under the thumb */}
              {beat === "review" && wide ? (
                <motion.div className="lg:[grid-area:tell]" {...inkRise(0.05)}>
                  {tellBox}
                </motion.div>
              ) : null}

              {readError ? (
                <ReadErrorCard
                  error={readError}
                  onRetry={photo ? () => void readMenu(photo) : undefined}
                  onTell={skipPhoto}
                  onRetake={() => setBeat("snap")}
                  className="lg:self-start lg:[grid-area:left]"
                />
              ) : (
                <div className="flex flex-col gap-6 lg:[grid-area:board]">
                  <MenuBoard
                    title={boardTitle}
                    mode={beat === "reading" ? "scribble" : beat === "tags" ? "flight" : "review"}
                    rows={rows}
                    flights={flights}
                    slotRef={slotRef}
                    editingKey={editingKey}
                    onEdit={changing ? undefined : setEditingKey}
                    fresh={fresh.keys}
                    freshKey={fresh.n}
                    emptyHint={beat === "review" ? "Nothing here yet. Tell me what you sell." : undefined}
                    onChange={(key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))}
                    onRemove={(key) => {
                      setRows((rs) => rs.filter((r) => r.key !== key));
                      setEditingKey(null);
                    }}
                    onAdd={() => {
                      const key = `new-${Date.now()}`;
                      setRows((rs) => [
                        ...rs,
                        { key, name: "", name_en: null, description: null, price_cents: null, price_source: "owner", tags: [], stock: 1, box_2d: null, ai_orderable: true },
                      ]);
                      setEditingKey(key);
                    }}
                    footer={beat === "review" && heard ? <HeardLine text={heard} /> : null}
                    className="lg:mx-auto lg:w-full lg:max-w-[580px]"
                  />
                  {beat === "review" ? (
                    <motion.p
                      className="-mt-1 flex items-start gap-2 px-1 text-[15px] leading-snug text-ink-muted lg:mx-auto lg:w-full lg:max-w-[580px] lg:text-[16px]"
                      {...inkRise(0.15)}
                    >
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-carbon" strokeWidth={1.75} aria-hidden />
                      Prices only come from what you said or the photo.
                    </motion.p>
                  ) : null}
                  {/* "I couldn't tell" notes stay with the slip they're about */}
                  {beat === "review" && notes.length ? (
                    <div className={cn("grid gap-3 lg:mx-auto lg:w-full lg:max-w-[580px]", notes.length > 1 && "sm:grid-cols-2")}>
                      <AnimatePresence initial={false}>
                        {notes.map((u, i) => (
                          <StickyNote key={u} text={u} index={i} onDismiss={() => setUnclear((l) => l.filter((x) => x !== u))} />
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : null}
                </div>
              )}

              {beat === "review" ? (
                <motion.div className="flex flex-col gap-6 lg:[grid-area:form]" {...inkRise(0.1)}>
                  <ShopBasics value={basics} onChange={(p) => setBasics((b) => ({ ...b, ...p }))} />

                  {/* laptop: "Looks good" sits right under the basics (phones get the fixed key below) */}
                  {wide ? <ReviewCta missing={missing} canContinue={canContinue} named={basics.name.trim().length > 0} onGo={toSign} /> : null}
                </motion.div>
              ) : null}
            </Scene>
          ) : null}

          {scene === "sign" ? (
            <Scene key="sign" beat={beat} className="items-center gap-8 text-center lg:items-start lg:text-left">
              {beat === "switch" ? (
                <StepHeading
                  step={3}
                  title="Open your shop."
                  sub="You go live for people and AI shoppers."
                  className="w-full text-left lg:[grid-area:head]"
                />
              ) : null}

              <motion.div layout transition={SPRING.resize} className="relative flex w-full justify-center lg:self-center lg:[grid-area:art]">
                <OpenSign text="Open" state={sign} size="lg" spill onLit={onLit} className="max-w-full" />
              </motion.div>

              <AnimatePresence mode="wait" initial={false}>
                {beat === "switch" ? (
                  <motion.div
                    key="switch"
                    className="flex w-full flex-col items-center gap-3 lg:items-start lg:[grid-area:action]"
                    exit={{ opacity: 0, y: 16, transition: { duration: DUR.micro } }}
                  >
                    <SignSwitch on={flipped} busy={creating} onFlip={() => void flip()} />
                    <p aria-live="polite" className={cn("min-h-6 text-[16px] lg:text-[17px]", createError ? "font-semibold text-stamp-deep" : "text-ink-muted")}>
                      {createError ?? (flipped && !creating ? "Your sign is going up…" : " ")}
                    </p>
                    {!flipped && !creating ? (
                      <button type="button" onClick={() => setBeat("review")} className="btn-quiet -mt-1 text-ink-muted lg:-ml-3">
                        <ArrowLeft className="size-4" aria-hidden /> Back to the menu
                      </button>
                    ) : null}
                  </motion.div>
                ) : live ? (
                  <LiveScreen key="live" live={live} shopName={live.result.shop.name} />
                ) : null}
              </AnimatePresence>
            </Scene>
          ) : null}
        </AnimatePresence>
      </LayoutGroup>

      {/* phones: one faint strip of the landing's ink plate at the foot (the shop is open, the world beyond it);
          laptops have the fixed plate instead, so /open shows a single plate */}
      {beat === "live" ? <InkStrip /> : null}

      {/* Phone: "change anything" + "Looks good", always under the thumb (fixed, outside the
          animated scenes); it rides up with the keyboard while you type */}
      <AnimatePresence>
        {beat === "review" && editingKey === null && !wide ? (
          <motion.div
            key="review-cta"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%", transition: { duration: DUR.micro, ease: EASE.in } }}
            transition={{ duration: 0.6, ease: INK_EASE, delay: 0.25 }}
            style={{ bottom: keyboard }}
            className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[440px] flex-col gap-2 bg-counter px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 shadow-[0_-1px_0_rgb(22_58_66/0.1)] md:max-w-[520px]"
          >
            {tellBox}
            {keyboard > 0 ? null : (
              <ReviewCta missing={missing} canContinue={canContinue} named={basics.name.trim().length > 0} onGo={toSign} />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      </div>
    </div>
  );
}

function Scene({ beat, error, children, className }: { beat: Beat; error?: boolean; children: React.ReactNode; className?: string }) {
  return (
    // laptop: a two-pane grid; each beat names its cells in open.css
    <motion.main
      data-beat={beat}
      data-error={error || undefined}
      data-ink-clear
      className={cn("open-scene flex flex-col", className)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      transition={{ duration: 0.6, ease: INK_EASE }}
    >
      {children}
    </motion.main>
  );
}

/** The landing's ink plate, one faint strip along the bottom of the screen (under the content, never behind text). */
function InkStrip() {
  return (
    <div aria-hidden className="open-strip-wrap -mb-10 mt-auto pt-10 lg:hidden">
      <motion.img
        src={strip1600.src}
        srcSet={`${strip800.src} 800w, ${strip1600.src} 1600w`}
        sizes="(min-width: 768px) 100vw, 200vw"
        width={strip1600.width}
        height={strip1600.height}
        alt=""
        draggable={false}
        className="open-strip"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        transition={{ duration: 1.6, ease: "easeOut", delay: 0.5 }}
      />
    </div>
  );
}

/** "Looks good": fixed under the thumb on a phone, under the basics on a laptop. */
function ReviewCta({ missing, canContinue, named, onGo }: { missing: number; canContinue: boolean; named: boolean; onGo: () => void }) {
  return (
    <div>
      {missing > 0 ? (
        <p className="mb-3 text-center text-[15px] leading-snug lg:text-left lg:text-[16px]">
          <span className="font-semibold text-stamp-deep">{missing === 1 ? "1 needs a price" : `${missing} need a price`}</span>
          <span className="text-ink-muted"> · can&apos;t be ordered yet</span>
        </p>
      ) : null}
      <button type="button" disabled={!canContinue} onClick={onGo} className="btn-ink w-full justify-between!">
        {named ? "Looks good" : "Add your shop name"} <ArrowRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}

const READING_LINES = ["Reading your counter…", "Looking for price tags…", "Printing your menu…"];

function ReadingStatus({ beat, found, ms }: { beat: Beat; found: number; ms: number | null }) {
  const lines = READING_LINES;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (beat !== "reading") return;
    const id = setInterval(() => setI((n) => Math.min(n + 1, lines.length - 1)), 2200);
    return () => clearInterval(id);
  }, [beat, lines.length]);
  // no-break spaces keep a number with its unit when the laptop heading wraps
  const found_ = found === 1 ? "Found 1 thing" : `Found ${found} things`;
  // the AI's real time, measured on the server
  const text = beat === "reading" ? lines[i] : ms ? `${found_} in ${(ms / 1000).toFixed(1)} s.` : `${found_}.`;
  // laptop: the narration is the left pane's heading
  return <StatusLine text={text} lead className="px-1 lg:px-0" />;
}

function ReadErrorCard({
  error,
  onRetry,
  onTell,
  onRetake,
  className,
}: {
  error: ReadError;
  onRetry?: () => void;
  onTell: () => void;
  onRetake: () => void;
  className?: string;
}) {
  const photoProblem = error.code === "bad_photo" || error.code === "photo_too_large" || error.code === "empty";
  const retry = onRetry && !photoProblem;
  return (
    <motion.div role="alert" className={cn("slip-drop", className)} {...inkRise(0, 0.7)}>
      <div className="paper px-6 pb-7 pt-7 lg:px-8 lg:pb-8 lg:pt-8">
        <p className="font-display text-[28px] leading-[1.15] text-balance lg:text-[34px]">{error.message}</p>
        <div className="mt-7 flex flex-col items-center gap-2 lg:items-start">
          <button type="button" onClick={retry ? onRetry : onTell} className="btn-ink w-full justify-between!">
            {retry ? "Try again" : "Just tell me instead"} <ArrowRight className="size-5" aria-hidden />
          </button>
          {retry ? (
            <button type="button" onClick={onTell} className="link-ink text-[19px]!">
              Just tell me instead <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
            </button>
          ) : null}
          <button type="button" onClick={onRetake} className="btn-quiet text-ink-muted lg:-ml-3">
            <ArrowLeft className="size-4" aria-hidden /> Retake the photo
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function HeardLine({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="mt-4 flex w-full items-start gap-3 border-t border-ink/10 pt-5 text-left"
    >
      <Mic className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink-muted lg:text-[16px]">What I heard</span>
        <span className={cn("mt-1.5 block text-[15px] leading-relaxed lg:text-[16px]", !open && "line-clamp-2")}>“{text}”</span>
      </span>
    </button>
  );
}

/**
 * You're open. Three pieces (the time, the shop's slip, the way in) so a
 * laptop can put the slip under the sign and the words beside them; on a
 * phone they stack under the sign as one column.
 */
function LiveScreen({ live, shopName }: { live: { result: CreateShopResponse; elapsedMs: number }; shopName: string }) {
  const t = formatOpenTime(live.elapsedMs);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), 450);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="flex w-full flex-col items-center gap-7 lg:contents">
      <motion.div className="lg:self-end lg:[grid-area:title]" {...inkRise(0, 0.9)}>
        <h1 className="font-display text-[56px] leading-[1.02] text-carbon lg:text-[96px] lg:leading-[0.98]">You&apos;re open.</h1>
        <p className="mt-4 flex items-baseline justify-center gap-2 text-[17px] text-ink-muted lg:mt-6 lg:justify-start lg:text-[19px]">
          Opened in
          <span className="inline-flex items-baseline font-mono text-[22px] font-medium text-ink lg:text-[26px]">
            <NumberFlow value={shown ? t.value : 0} locales="en-US" />
            <span className="ml-1">{t.unit}</span>
            {t.rest ? <span className="ml-2">{t.rest}</span> : null}
          </span>
        </p>
      </motion.div>

      <motion.div className="w-full lg:mx-auto lg:max-w-[500px] lg:[grid-area:card]" {...inkRise(0.25)}>
        <LiveCard
          shopName={shopName}
          publicUrl={live.result.public_url}
          agentUrl={live.result.agent_url}
          privateShop={!live.result.shop.listed}
          className="w-full text-left"
        />
      </motion.div>

      <motion.div className="flex w-full flex-col items-center gap-3 lg:items-start lg:self-start lg:[grid-area:actions]" {...inkRise(0.4)}>
        <a href={live.result.owner_url} className="btn-ink w-full justify-between! lg:max-w-[400px]">
          Go behind the counter <ArrowRight className="size-5" aria-hidden />
        </a>
        <p className="flex items-start gap-2 text-left text-[15px] leading-snug text-ink-muted lg:text-[16px]">
          <Lock className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Your private owner link. Bookmark it.
        </p>
        <a href={live.result.public_url} className="link-ink mt-1 text-[19px]!">
          See your shop page <ArrowRight className="size-[18px]" strokeWidth={1.5} aria-hidden />
        </a>
      </motion.div>
    </div>
  );
}
