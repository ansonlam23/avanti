// Transcript in → Gemini `contents` / Claude `messages` out. Pure (no network),
// unit-tested. The client keeps the transcript and sends it every time (the
// server is stateless), so everything here treats it as untrusted input.
// A transcript may mix providers (Gemini first, Claude as overflow), so either
// builder must accept turns the other model produced.
import type {
  ContentBlockParam,
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
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

const MISSING_RESULT: ToolResult = { ok: false, error: "missing", message: "No result was recorded for this call." };

/** One model turn's tool rounds, in order: each step's calls, each paired with its result. */
function stepsOf(turn: ChatTurn): Array<{ step: number; pairs: Array<{ call: ToolCallRecord; output: ToolResult }> }> {
  const calls = turn.tool_calls ?? [];
  const results = turn.tool_results ?? [];
  const steps = [...new Set(calls.map((c) => c.step))].sort((a, b) => a - b);
  return steps.map((step) => {
    const stepCalls = calls.filter((c) => c.step === step);
    const stepResults = results.filter((r) => r.step === step);
    // Every call needs a result, matched by id when there is one, else by position.
    const pairs = stepCalls.map((call, i) => {
      const match = (call.id ? stepResults.find((r) => r.id === call.id) : undefined) ?? stepResults[i];
      return { call, output: match && match.name === call.name ? match.result : MISSING_RESULT };
    });
    return { step, pairs };
  });
}

/**
 * Rebuild the Gemini conversation: user text, then per model turn each tool
 * round (call → response), then its text. Replayed calls carry no ids (they may
 * be Claude's `toolu_…`); Gemini pairs each response with its call by order.
 */
export function toGeminiContents(turns: ChatTurn[]): Content[] {
  const contents: Content[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      if (turn.text) pushUserParts(contents, [{ text: turn.text }], true);
      continue;
    }
    for (const { pairs } of stepsOf(turn)) {
      contents.push({
        role: "model",
        parts: pairs.map(({ call }, i) => ({
          functionCall: { name: call.name, args: call.args },
          ...(i === 0 ? { thoughtSignature: REPLAY_THOUGHT_SIGNATURE } : {}),
        })),
      });
      const responses: Part[] = pairs.map(({ call, output }) => ({
        functionResponse: { name: call.name, response: { output } },
      }));
      pushUserParts(contents, responses, false);
    }
    if (turn.text) contents.push({ role: "model", parts: [{ text: turn.text }] });
  }
  return contents;
}

/** Claude's rule for tool_use ids. */
export const CLAUDE_TOOL_ID = /^[a-zA-Z0-9_-]+$/;
const MAX_CLAUDE_ID = 64;

/** A tool result as Claude reads it: the same JSON the cards render; failures flagged. */
export function claudeToolResult(toolUseId: string, output: ToolResult): ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: JSON.stringify(output),
    ...(output.ok === false ? { is_error: true } : {}),
  };
}

/**
 * Rebuild the Claude conversation: user text, then per model turn each tool
 * round (assistant tool_use → user tool_result), then its text. Claude's own
 * ids are kept so replays match; a missing, malformed or repeated id (e.g. a
 * Gemini turn) gets a deterministic `call_<turn>_<step>_<i>`. Consecutive
 * same-role content is merged, so roles alternate, every tool_use is answered
 * at the start of the next user message, and it opens with the shopper.
 */
export function toClaudeMessages(turns: ChatTurn[]): MessageParam[] {
  const messages: MessageParam[] = [];
  const used = new Set<string>();

  const idFor = (raw: string | undefined, fallback: string): string => {
    let id = raw && raw.length <= MAX_CLAUDE_ID && CLAUDE_TOOL_ID.test(raw) ? raw : fallback;
    for (let n = 2; used.has(id); n++) id = `${fallback}_${n}`;
    used.add(id);
    return id;
  };
  const push = (role: "user" | "assistant", blocks: ContentBlockParam[]) => {
    if (!blocks.length) return;
    const prev = messages.at(-1);
    if (prev?.role === role && Array.isArray(prev.content)) prev.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };

  // Claude wants the shopper first (sanitizeTranscript already guarantees it).
  const first = turns.findIndex((t) => t.role === "user" && t.text?.trim());
  if (first < 0) return messages;

  turns.slice(first).forEach((turn, t) => {
    const text = turn.text?.trim();
    if (turn.role === "user") {
      if (text) push("user", [{ type: "text", text }]);
      return;
    }
    for (const { step, pairs } of stepsOf(turn)) {
      const uses: ToolUseBlockParam[] = [];
      const answers: ToolResultBlockParam[] = [];
      pairs.forEach(({ call, output }, i) => {
        if (!isToolName(call.name)) return;
        const id = idFor(call.id, `call_${t}_${step}_${i}`);
        uses.push({ type: "tool_use", id, name: call.name, input: call.args });
        answers.push(claudeToolResult(id, output));
      });
      push("assistant", uses);
      push("user", answers); // right after its tool_use, before any shopper text that follows
    }
    if (text) push("assistant", [{ type: "text", text }]);
  });
  return messages;
}
