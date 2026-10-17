"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Keyboard, Lock, Mic, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OpenSign, type NeonState } from "@/components/brand";
import type { OnboardDraft } from "@/lib/ai/onboard";
import type { CreateShopRequest, CreateShopResponse } from "@/lib/db/shops";
import { DUR, EASE, SPRING, motionSpeed } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { CounterPhoto, photoPoint } from "./counter-photo";
import { LiveCard } from "./live-card";
import { FLIGHT_S, MenuBoard, TOUCHDOWN, type MenuRow, type RowFlight } from "./menu-board";
import { blobToDataUrl, dataUrlToBlob, preparePhoto, type PreparedPhoto } from "./photo";
import { rememberMyShop } from "@/lib/my-shops";
import { loadLive, loadRun, saveLive, saveRun, type OnboardResponse } from "./run-store";
import { DEFAULT_BASICS, ShopBasics, type Basics } from "./shop-basics";
import { SignSwitch } from "./sign-switch";
import { SnapStep } from "./snap-step";
import { StatusLine, StepHeading } from "./step-heading";
import { StickyNote } from "./sticky-note";
import { TalkStep } from "./talk-step";
import { TopBar } from "./top-bar";
import { useStopwatch } from "./use-stopwatch";
import type { Recording } from "./use-recorder";
import { useWide } from "./use-wide";
import "./open.css";

// /open — "Open in 40 seconds". Four beats, one primary action each:
// snap → talk → (reading → prices print onto the menu → check) → print your sign → live.
// Phone: one column. Laptop: a two-pane stage (open.css): the step on the
// left, the result building up on the right (photo → menu slip → OPEN sign).

type Beat = "snap" | "talk" | "reading" | "tags" | "review" | "switch" | "live";
export type Shot = "tags" | "review" | "live";

const BEAT_STEP: Record<Beat, number> = { snap: 0, talk: 1, reading: 2, tags: 2, review: 2, switch: 3, live: 4 };

interface ReadError {
  code: string;
  message: string;
}

type ReadInput = { audio?: Recording; notes?: string };

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
    stock: it.est_quantity,
    box_2d: it.box_2d ?? null,
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
  const [lastInput, setLastInput] = useState<ReadInput | null>(null);
  const [typeFirst, setTypeFirst] = useState(false);
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
      setBasics((b) => ({ ...b, name: b.name || resp.draft.shop_name || "" }));
      playTags(list);
    },
    [playTags],
  );

  // ── Beat 1 → 2: photo ────────────────────────────────────────────────
  const onFile = useCallback(async (file: File) => {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const p = await preparePhoto(file);
      setPhoto((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return p;
      });
      setBeat("talk");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setPhotoError((err as Error).message || "I couldn't open that photo. Try another one.");
    } finally {
      setPhotoBusy(false);
    }
  }, []);

  // ── Beat 2 → 3: read the menu (one real Gemini call) ─────────────────
  const readMenu = useCallback(
    async (input: ReadInput) => {
      if (!photo) return;
      clearTimers();
      setLastInput(input);
      setReadError(null);
      setResponse(null);
      setBeat("reading");
      window.scrollTo({ top: 0 });
      const started = performance.now();

      const fd = new FormData();
      fd.append("photo", photo.blob, "counter.jpg");
      if (input.audio) fd.append("audio", input.audio.blob, `voice-note.${audioExt(input.audio.mimeType)}`);
      if (input.notes) fd.append("notes", input.notes);
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
          message: "I didn't spot anything to sell. Try another photo, or tell me what you have.",
        });
        return;
      }
      // Keep the real scan on screen long enough to read on camera.
      const wait = Math.max(0, 900 - (performance.now() - started));
      later(wait, () => applyResponse(resp));

      const elapsedAtDraftMs = watch.read();
      blobToDataUrl(photo.blob)
        .then((dataUrl) =>
          saveRun({
            v: 1,
            response: resp,
            photo: { dataUrl, width: photo.width, height: photo.height },
            elapsedAtDraftMs,
            savedAt: new Date().toISOString(),
          }),
        )
        .catch(() => {});
    },
    [photo, clearTimers, later, applyResponse, watch],
  );

  // ── Beat 4: turn on the sign (creates the real shop) ─────────────────
  const validRows = rows.filter((r) => r.name.trim());
  const flip = useCallback(async () => {
    if (!response || creating) return;
    setFlipped(true);
    setCreating(true);
    setCreateError(null);
    const body: CreateShopRequest = {
      name: basics.name.trim(),
      owner_language: response.draft.language,
      photo_url: response.photo_url,
      pickup_window: { start: basics.start, end: basics.end },
      rules: { max_per_order: basics.maxPerOrder, accept_ai_orders: basics.acceptAi },
      items: validRows.map((r) => ({
        name: r.name.trim(),
        name_en: r.name_en?.trim() || null,
        description: r.description,
        price_cents: r.price_cents,
        price_source: r.price_cents === null ? "missing" : r.price_source,
        tags: r.tags,
        stock: r.stock ?? 0,
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
  }, [response, creating, basics, validRows, watch]);

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
  const scene = beat === "snap" ? "snap" : beat === "talk" ? "talk" : beat === "switch" || beat === "live" ? "sign" : "menu";
  const missing = validRows.filter((r) => r.price_cents === null).length;
  const canContinue = validRows.length > 0 && basics.name.trim().length > 0 && basics.start < basics.end;
  const boardTitle = basics.name.trim() || response?.draft.shop_name || "Today";
  const toSign = () => {
    setEditingKey(null);
    setBeat("switch");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[440px] touch-manipulation flex-col px-5 pb-10 md:max-w-[520px] lg:max-w-page lg:px-10 lg:pb-12">
      <TopBar done={step} current={step} ms={watch.elapsedMs} running={watch.running} started={watch.started} />

      {shotNote ? (
        <p className="paper mb-5 rounded-[2px] px-4 py-3 text-[15px] shadow-slip lg:max-w-[560px]">{shotNote}</p>
      ) : null}

      <LayoutGroup>
        {/* "wait": a scene leaves before the next mounts, so layout-animated
            pieces (photo, slip) never animate the old scene's height away */}
        <AnimatePresence mode="wait" initial={false}>
          {scene === "snap" ? (
            <Scene key="snap" beat={beat}>
              <SnapStep busy={photoBusy} error={photoError} onFirstTap={watch.start} onFile={onFile} />
            </Scene>
          ) : null}

          {scene === "talk" && photo ? (
            <Scene key="talk" beat={beat}>
              <TalkStep
                photo={photo}
                startTyping={typeFirst}
                onVoice={(audio) => void readMenu({ audio })}
                onNotes={(notes) => void readMenu(notes ? { notes } : {})}
                onRetake={() => setBeat("snap")}
              />
            </Scene>
          ) : null}

          {scene === "menu" && photo ? (
            <Scene key="menu" beat={beat} error={readError !== null} className={cn("gap-6", beat === "review" && "pb-40 lg:pb-0")}>
              {beat === "review" ? (
                <StepHeading step={3} title="Check your menu." sub="Tap a line to fix it." className="lg:[grid-area:head]">
                  <div className="mt-1 shrink-0">
                    <CounterPhoto
                      src={photo.url}
                      width={photo.width}
                      height={photo.height}
                      mode="thumb"
                      layoutId="counter-photo"
                    />
                  </div>
                </StepHeading>
              ) : (
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
                  {readError ? null : (
                    <ReadingStatus
                      beat={beat}
                      found={rows.length}
                      kind={lastInput?.audio ? "voice" : lastInput?.notes ? "notes" : "photo"}
                      ms={response?.ms ?? null}
                    />
                  )}
                  {beat === "reading" && !readError ? <InputChips input={lastInput} /> : null}
                  {beat === "tags" && wide && response?.draft.heard ? <HeardQuote text={response.draft.heard} /> : null}
                </div>
              )}

              {readError ? (
                <ReadErrorCard
                  error={readError}
                  onRetry={lastInput ? () => void readMenu(lastInput) : undefined}
                  onType={() => {
                    setTypeFirst(true);
                    setBeat("talk");
                  }}
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
                    onEdit={setEditingKey}
                    onChange={(key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))}
                    onRemove={(key) => {
                      setRows((rs) => rs.filter((r) => r.key !== key));
                      setEditingKey(null);
                    }}
                    onAdd={() => {
                      const key = `new-${Date.now()}`;
                      setRows((rs) => [
                        ...rs,
                        { key, name: "", name_en: null, description: null, price_cents: null, price_source: "owner", tags: [], stock: 1, box_2d: null },
                      ]);
                      setEditingKey(key);
                    }}
                    footer={beat === "review" && response?.draft.heard ? <HeardLine text={response.draft.heard} /> : null}
                    className="lg:mx-auto lg:w-full lg:max-w-[580px]"
                  />
                  {beat === "review" ? (
                    <motion.p
                      className="-mt-1 flex items-start gap-2 px-1 text-[15px] leading-snug text-ink-muted lg:mx-auto lg:w-full lg:max-w-[580px] lg:text-[16px]"
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: DUR.element, ease: EASE.out, delay: 0.1 }}
                    >
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
                      Prices only come from what you said or the photo.
                    </motion.p>
                  ) : null}
                  {/* "I couldn't tell" notes stay with the slip they're about */}
                  {beat === "review" && unclear.length ? (
                    <div className={cn("grid gap-3 lg:mx-auto lg:w-full lg:max-w-[580px]", unclear.length > 1 && "grid-cols-2")}>
                      <AnimatePresence initial={false}>
                        {unclear.map((u, i) => (
                          <StickyNote key={u} text={u} index={i} onDismiss={() => setUnclear((l) => l.filter((x) => x !== u))} />
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : null}
                </div>
              )}

              {beat === "review" ? (
                <motion.div
                  className="flex flex-col gap-6 lg:[grid-area:form]"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.element, ease: EASE.out, delay: 0.1 }}
                >
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
                  step={4}
                  title="Print your sign."
                  sub="You go live for people and AI shoppers."
                  className="w-full text-left lg:[grid-area:head]"
                />
              ) : null}

              <motion.div layout transition={SPRING.resize} className="relative flex w-full justify-center lg:self-center lg:[grid-area:art]">
                {/* laptop: before PRINT, the printer shows where the sign will come out */}
                <AnimatePresence>{wide && sign === "off" ? <SignSlot key="slot" /> : null}</AnimatePresence>
                <OpenSign text="OPEN" state={sign} size="xl" spill onLit={onLit} className="max-w-full" />
              </motion.div>

              <AnimatePresence mode="wait" initial={false}>
                {beat === "switch" ? (
                  <motion.div
                    key="switch"
                    className="flex flex-col items-center gap-4 lg:items-start lg:[grid-area:action]"
                    exit={{ opacity: 0, y: 16, transition: { duration: DUR.micro } }}
                  >
                    <SignSwitch on={flipped} busy={creating} onFlip={() => void flip()} />
                    <p aria-live="polite" className={cn("min-h-6 text-[16px] lg:text-[17px]", createError ? "font-bold text-stamp-deep" : "text-ink-muted")}>
                      {createError ?? (creating ? "Opening your shop…" : flipped ? "Printing…" : "Press print.")}
                    </p>
                    {!flipped && !creating ? (
                      <button type="button" onClick={() => setBeat("review")} className="btn-quiet -mt-2 lg:px-0">
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

      {/* Phone review CTA: always under the thumb (fixed, outside the animated scenes) */}
      <AnimatePresence>
        {beat === "review" && editingKey === null && !wide ? (
          <motion.div
            key="review-cta"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%", transition: { duration: DUR.micro, ease: EASE.in } }}
            transition={{ duration: DUR.element, ease: EASE.out, delay: 0.25 }}
            className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[440px] bg-[linear-gradient(180deg,transparent,var(--color-counter)_22%)] px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-6 md:max-w-[520px]"
          >
            <ReviewCta missing={missing} canContinue={canContinue} named={basics.name.trim().length > 0} onGo={toSign} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Scene({ beat, error, children, className }: { beat: Beat; error?: boolean; children: React.ReactNode; className?: string }) {
  return (
    // laptop: a two-pane grid; each beat names its cells in open.css
    <motion.main
      data-beat={beat}
      data-error={error || undefined}
      className={cn("open-scene flex flex-col", className)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
      transition={{ duration: DUR.micro + 0.08, ease: EASE.out }}
    >
      {children}
    </motion.main>
  );
}

/** The empty slot under the printer before the sign prints (sized in the sign's own em). */
function SignSlot() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[clamp(96px,min(33vw,30svh),176px)] leading-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: DUR.element, ease: EASE.out, delay: 0.2 }}
    >
      <div className="mt-[0.36em] grid h-[1.06em] w-[2.3em] place-items-center rounded-[2px] border-2 border-dashed border-ink/20">
        <span className="font-sans text-[16px] text-ink-muted">Your sign prints here.</span>
      </div>
    </motion.div>
  );
}

/** "Looks good": fixed under the thumb on a phone, under the basics on a laptop. */
function ReviewCta({ missing, canContinue, named, onGo }: { missing: number; canContinue: boolean; named: boolean; onGo: () => void }) {
  return (
    <div>
      {missing > 0 ? (
        <p className="mb-2.5 text-center text-[15px] leading-snug lg:text-left">
          <span className="font-bold text-stamp-deep">{missing === 1 ? "1 needs a price" : `${missing} need a price`}</span>
          <span className="text-ink-muted"> · can&apos;t be ordered yet</span>
        </p>
      ) : null}
      <button type="button" disabled={!canContinue} onClick={onGo} className="btn-ink w-full justify-between!">
        {named ? "Looks good" : "Add your shop name"} <ArrowRight className="size-6" aria-hidden />
      </button>
    </div>
  );
}

function ReadingStatus({
  beat,
  found,
  kind,
  ms,
}: {
  beat: Beat;
  found: number;
  kind: "voice" | "notes" | "photo";
  ms: number | null;
}) {
  const lines = [
    "Reading your counter…",
    kind === "voice" ? "Listening for prices…" : kind === "notes" ? "Reading your notes…" : "Looking for price tags…",
    "Printing your menu…",
  ];
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

/** What the AI is reading right now: the photo plus the voice note or typed notes. */
function InputChips({ input }: { input: ReadInput | null }) {
  const secs = input?.audio ? Math.max(1, Math.round(input.audio.durationMs / 1000)) : 0;
  return (
    <motion.p
      className="-mt-1 flex flex-wrap items-center gap-x-2 px-1 text-[15px] text-ink-muted lg:-mt-2 lg:px-0 lg:text-[17px]"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.micro, ease: EASE.out, delay: 0.15 }}
    >
      <Camera className="size-4" aria-hidden /> photo
      {input?.audio ? (
        <>
          <span aria-hidden>+</span>
          <Mic className="size-4" aria-hidden />
          <span className="tabular-nums">0:{String(secs).padStart(2, "0")}</span> voice note
        </>
      ) : input?.notes ? (
        <>
          <span aria-hidden>+</span>
          <Keyboard className="size-4" aria-hidden /> your notes
        </>
      ) : null}
    </motion.p>
  );
}

/** Laptop, while the prices land: what the owner said, so every sticker has its source in view. */
function HeardQuote({ text }: { text: string }) {
  return (
    <motion.figure
      className="lg:-mt-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.element, ease: EASE.out, delay: 0.2 }}
    >
      <figcaption className="label-print flex items-center gap-2 text-ink-muted">
        <Mic className="size-4" aria-hidden /> What I heard
      </figcaption>
      <blockquote className="mt-2 text-[17px] leading-relaxed">“{text}”</blockquote>
    </motion.figure>
  );
}

function ReadErrorCard({
  error,
  onRetry,
  onType,
  onRetake,
  className,
}: {
  error: ReadError;
  onRetry?: () => void;
  onType: () => void;
  onRetake: () => void;
  className?: string;
}) {
  const photoProblem = error.code === "bad_photo" || error.code === "photo_too_large" || error.code === "empty";
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 12, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: -0.6 }}
      transition={{ duration: 0.45, ease: EASE.pop }}
      className={cn("slip-drop", className)}
    >
      <div className="paper edge-torn-y px-6 pb-8 pt-8">
        <p className="font-display text-[28px] font-extrabold uppercase leading-[0.98] lg:text-[32px]">{error.message}</p>
        <div className="mt-6 flex flex-col gap-2.5">
          {onRetry && !photoProblem ? (
            <button type="button" onClick={onRetry} className="btn-ink w-full">
              <RotateCcw className="size-5" aria-hidden /> Try again
            </button>
          ) : null}
          <button type="button" onClick={onType} className={cn(onRetry && !photoProblem ? "btn-line" : "btn-ink", "w-full")}>
            <Keyboard className="size-5" aria-hidden /> Type it instead
          </button>
          <button type="button" onClick={onRetake} className="btn-quiet">
            <Camera className="size-4" aria-hidden /> Retake the photo
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
      className="mt-5 flex w-full items-start gap-2.5 border-t-[1.5px] border-dashed border-ink/25 pt-4 text-left"
    >
      <Mic className="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden />
      <span className="min-w-0">
        <span className="label-print block text-ink-muted">What I heard</span>
        <span className={cn("mt-1 block text-[15px] leading-snug lg:text-[16px]", !open && "line-clamp-2")}>“{text}”</span>
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
    const id = setTimeout(() => setShown(true), 350);
    return () => clearTimeout(id);
  }, []);
  const enter = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.element, ease: EASE.out, delay },
  });
  return (
    <motion.div
      className="flex w-full flex-col items-center gap-6 lg:contents"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.element, ease: EASE.out }}
    >
      <motion.div className="lg:self-center lg:[grid-area:title]" {...enter(0)}>
        <h1 className="thermal font-display text-[52px] font-black uppercase leading-none lg:text-[88px] lg:leading-[0.9]">You&apos;re open.</h1>
        <p className="mt-3 flex items-baseline justify-center gap-3 lg:mt-6 lg:justify-start">
          <span className="label-print text-ink-muted">Open in</span>
          <span className="dot inline-flex items-baseline text-[40px] lg:text-[56px]">
            <NumberFlow value={shown ? t.value : 0} locales="en-US" />
            <span className="ml-1.5 font-sans text-[18px] font-bold tracking-normal">{t.unit}</span>
            {t.rest ? <span className="ml-2 font-sans text-[18px] font-bold tracking-normal">{t.rest}</span> : null}
          </span>
        </p>
      </motion.div>

      <motion.div className="w-full lg:mx-auto lg:max-w-[520px] lg:[grid-area:card]" {...enter(0.12)}>
        <LiveCard
          shopName={shopName}
          publicUrl={live.result.public_url}
          agentUrl={live.result.agent_url}
          privateShop={!live.result.shop.listed}
          className="w-full rotate-[-1deg] text-left"
        />
      </motion.div>

      <motion.div className="flex w-full flex-col items-center gap-6 lg:items-start lg:[grid-area:actions]" {...enter(0.24)}>
        <a href={live.result.owner_url} className="btn-ink w-full justify-between!">
          Go behind the counter <ArrowRight className="size-6" aria-hidden />
        </a>
        <p className="-mt-2 flex items-start gap-2 text-left text-[14px] leading-snug text-ink-muted lg:text-[15px]">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Your private owner link. Bookmark it.
        </p>
        <a href={live.result.public_url} className="btn-quiet -mt-2 lg:px-0">
          See your shop page
        </a>
      </motion.div>
    </motion.div>
  );
}
