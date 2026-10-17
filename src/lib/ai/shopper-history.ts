// Transcript in → Gemini `contents` out. Pure (no network), unit-tested.
// The client keeps the transcript and sends it every time (the server is
// stateless), so everything here treats it as untrusted input.
import type { Content, Part } from "@google/genai";
import { z } from "zod";
import { EVENT_PREFIX } from "@/lib/ai/prompts/shopper";
import {
  isToolName,
  type ChatTurn,
  type ToolCallRecord,
  type ToolResult,
  type ToolResultRecord,
} from "@/lib/ai/shopper-types";

export const MAX_TURNS = 40; // older turns are dropped (the model only needs recent context)
export const MAX_TEXT = 2000;
export const MAX_CALLS_PER_TURN = 12;
export const MAX_RESULT_CHARS = 24_000;
export const MAX_STEPS = 8;

/**
 * Gemini 3 wants a thought signature on the first function call of each step.
 * The real ones only matter inside the current turn (which we keep in memory
 * with the real signatures); for replayed past turns Google documents this
 * placeholder for function calls it didn't just generate.
 */
export const REPLAY_THOUGHT_SIGNATURE = "context_engineering_is_the_way_to_go";

const Step = z.number().int().min(0).max(MAX_STEPS);
const Id = z.string().max(120).optional();

const SlugSchema = z.string().max(60).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const EventSchema = z.object({
  kind: z.literal("sold_out"),
  shop_slug: SlugSchema,
  item_id: z.string().max(64),
  item_name: z.string().trim().min(1).max(80),
  query: z.string().trim().max(120).nullish(),
  needed_by: z.string().trim().max(40).nullish(),
});

const TurnSchema = z.object({
  role: z.enum(["user", "model"]),
  text: z.string().max(MAX_TEXT * 4).optional(),
  hidden: z.boolean().optional(),
  // A malformed event is dropped, never fatal.
  event: EventSchema.optional().catch(undefined),
  tool_calls: z
    .array(
      z.object({
        id: Id,
        name: z.string().max(40),
        args: z.record(z.string(), z.unknown()).catch({}),
        step: Step,
      }),
    )
    .max(MAX_CALLS_PER_TURN)
    .optional(),
  tool_results: z
    .array(z.object({ id: Id, name: z.string().max(40), result: z.unknown(), step: Step }))
    .max(MAX_CALLS_PER_TURN)
    .optional(),
});

export const MAX_MY_SHOPS = 12;

export const ChatRequestSchema = z.object({
  messages: z.array(TurnSchema).min(1).max(400),
  // This browser's own private shops (CONTRACTS §11). Bad entries are dropped, not fatal.
  my_shops: z.array(z.unknown()).max(50).optional().catch(undefined),
});

export type SanitizeResult = { ok: true; turns: ChatTurn[]; myShops: string[] } | { ok: false; message: string };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Keep valid, unique shop slugs (most recent first, as getMyShops() returns them). */
export function sanitizeMyShops(list: unknown[] | undefined): string[] {
  const out: string[] = [];
  for (const v of list ?? []) {
    if (typeof v !== "string") continue;
    const slug = v.trim().toLowerCase();
    if (slug.length > 60 || !SLUG.test(slug) || out.includes(slug)) continue;
    out.push(slug);
    if (out.length >= MAX_MY_SHOPS) break;
  }
  return out;
}

function clampText(s: string | undefined): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t ? t.slice(0, MAX_TEXT) : undefined;
}

function safeResult(result: unknown): ToolResult {
  let json: string | undefined;
  try {
    json = JSON.stringify(result);
  } catch {
    json = undefined;
  }
  if (!json || json.length > MAX_RESULT_CHARS || typeof result !== "object" || result === null) {
    return { ok: false, error: "dropped", message: "This earlier tool result was too large to keep." };
  }
  return JSON.parse(json) as ToolResult;
}

/** Validate + normalize the client's transcript. The last turn must be a user message. */
export function sanitizeTranscript(body: unknown): SanitizeResult {
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, message: "Expected { messages: ChatTurn[] }" };

  const turns: ChatTurn[] = [];
  for (const t of parsed.data.messages) {
    if (t.role === "user") {
      let text = clampText(t.text);
      if (!text) continue;
      const hidden = t.hidden === true;
      if (hidden && !text.startsWith(EVENT_PREFIX)) text = `${EVENT_PREFIX} ${text}`;
      // Only the app may speak as an event.
      if (!hidden && text.startsWith(EVENT_PREFIX)) text = text.slice(EVENT_PREFIX.length).trim() || "(empty)";
      if (!hidden) {
        turns.push({ role: "user", text });
        continue;
      }
      const e = t.event;
      turns.push(
        e
          ? {
              role: "user",
              text,
              hidden,
              event: {
                kind: e.kind,
                shop_slug: e.shop_slug,
                item_id: e.item_id,
                item_name: e.item_name,
                query: e.query ?? null,
                needed_by: e.needed_by ?? null,
              },
            }
          : { role: "user", text, hidden },
      );
      continue;
    }
    const calls: ToolCallRecord[] = [];
    const results: ToolResultRecord[] = [];
    for (const c of t.tool_calls ?? []) {
      if (!isToolName(c.name)) continue;
      calls.push({ ...(c.id ? { id: c.id } : {}), name: c.name, args: c.args ?? {}, step: c.step });
    }
    for (const r of t.tool_results ?? []) {
      if (!isToolName(r.name)) continue;
      results.push({ ...(r.id ? { id: r.id } : {}), name: r.name, result: safeResult(r.result), step: r.step });
    }
    const text = clampText(t.text);
    if (!text && !calls.length) continue;
    turns.push({
      role: "model",
      ...(text ? { text } : {}),
      ...(calls.length ? { tool_calls: calls, tool_results: results } : {}),
    });
  }

  // Keep recent context only, starting at a user turn.
  let start = Math.max(0, turns.length - MAX_TURNS);
  while (start < turns.length && turns[start].role !== "user") start++;
  const recent = turns.slice(start);

  const last = recent.at(-1);
  if (!last || last.role !== "user") return { ok: false, message: "The last message must be from the user" };
  return { ok: true, turns: recent, myShops: sanitizeMyShops(parsed.data.my_shops) };
}

/**
 * A trailing sold-out event → the search the server runs (for real) before the
 * model's first round, so the model can go straight to an alternative.
 */
export function prefetchFor(turns: ChatTurn[]): { name: "search_shops"; args: { query: string; needed_by: string | null } } | null {
  const last = turns.at(-1);
  if (!last || last.role !== "user" || !last.hidden || last.event?.kind !== "sold_out") return null;
  return { name: "search_shops", args: { query: last.event.item_name, needed_by: last.event.needed_by ?? null } };
}

function pushUserParts(contents: Content[], parts: Part[], merge: boolean) {
  const prev = contents.at(-1);
  if (merge && prev?.role === "user" && prev.parts?.every((p) => typeof p.text === "string")) {
    prev.parts.push(...parts);
  } else {
    contents.push({ role: "user", parts });
  }
}

/** Rebuild the Gemini conversation: user text, then per model turn each tool round (call → response), then its text. */
export function toGeminiContents(turns: ChatTurn[]): Content[] {
  const contents: Content[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      if (turn.text) pushUserParts(contents, [{ text: turn.text }], true);
      continue;
    }
    const calls = turn.tool_calls ?? [];
    const results = turn.tool_results ?? [];
    const steps = [...new Set(calls.map((c) => c.step))].sort((a, b) => a - b);
    for (const step of steps) {
      const stepCalls = calls.filter((c) => c.step === step);
      const stepResults = results.filter((r) => r.step === step);
      contents.push({
        role: "model",
        parts: stepCalls.map((c, i) => ({
          functionCall: { ...(c.id ? { id: c.id } : {}), name: c.name, args: c.args },
          ...(i === 0 ? { thoughtSignature: REPLAY_THOUGHT_SIGNATURE } : {}),
        })),
      });
      // Every call needs a response, matched by id when there is one, else by position.
      const responses: Part[] = stepCalls.map((c, i) => {
        const match = (c.id ? stepResults.find((r) => r.id === c.id) : undefined) ?? stepResults[i];
        const output: ToolResult =
          match && match.name === c.name
            ? match.result
            : { ok: false, error: "missing", message: "No result was recorded for this call." };
        return { functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: { output } } };
      });
      pushUserParts(contents, responses, false);
    }
    if (turn.text) contents.push({ role: "model", parts: [{ text: turn.text }] });
  }
  return contents;
}
