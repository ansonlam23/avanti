import "server-only";
import { claudeModel } from "@/lib/ai/claude";
import { geminiModel } from "@/lib/ai/gemini";
import { shopperSystemPrompt } from "@/lib/ai/prompts/shopper";
import { runClaudeTurn } from "@/lib/ai/shopper-claude";
import { errorStatus, isBusyError } from "@/lib/ai/shopper-errors";
import { runGeminiTurn } from "@/lib/ai/shopper-gemini";
import { prefetchFor } from "@/lib/ai/shopper-history";
import type { ProviderResult, ProviderTurn } from "@/lib/ai/shopper-loop";
import type { ChatEvent, ChatTurn, ToolCallRecord, ToolResultRecord } from "@/lib/ai/shopper-types";
import { runTool } from "@/lib/ai/tools";
import { env, hasClaude, hasGemini, shopperAiMode } from "@/lib/env";

// One shopper turn (CONTRACTS §10, §12), provider-agnostic: run the sold-out
// prefetch once, then hand the turn to a model's tool loop. Free Gemini goes
// first, then any GEMINI_FALLBACK_MODELS, then Claude (paid) as overflow. A
// Gemini 429/5xx moves on to the next option only while that attempt has
// emitted nothing, so the shopper never sees a duplicate event.

export { MAX_TOOL_ROUNDS } from "@/lib/ai/shopper-loop";

export interface TurnStats {
  rounds: number;
  first_text_ms: number | null;
  total_ms: number;
}

export type ShopperProvider = "gemini" | "claude";

export interface ShopperOption {
  provider: ShopperProvider;
  model: string;
}

const LOOPS: Record<ShopperProvider, (turn: ProviderTurn) => Promise<ProviderResult>> = {
  gemini: (turn) => runGeminiTurn(turn),
  claude: (turn) => runClaudeTurn(turn),
};

/** After a Gemini 429, this server instance skips that model for a minute (each model has its own free quota). */
export const COOLDOWN_MS = 60_000;
const coolingUntil = new Map<string, number>();

const label = (o: ShopperOption) => `${o.provider}/${o.model}`;

function isCooling(o: ShopperOption, nowMs: number): boolean {
  const until = coolingUntil.get(label(o));
  if (until === undefined) return false;
  if (until > nowMs) return true;
  coolingUntil.delete(label(o));
  return false;
}

/** Tests only: forget every cooldown. */
export function resetCooldowns(): void {
  coolingUntil.clear();
}

/** The models to try for a turn, in order, for this server's config (SHOPPER_AI). */
export function shopperOptions(nowMs = Date.now()): ShopperOption[] {
  const mode = shopperAiMode();
  const gemini: ShopperOption[] =
    mode !== "claude" && hasGemini()
      ? [...new Set([geminiModel(), ...env.geminiFallbackModels()])].map((model) => ({ provider: "gemini", model }))
      : [];
  const claude: ShopperOption[] = mode !== "gemini" && hasClaude() ? [{ provider: "claude", model: claudeModel() }] : [];
  const all = [...gemini, ...claude];
  // Skip a model that just ran out of free quota, as long as something else can answer.
  const ready = all.filter((o) => !isCooling(o, nowMs));
  if (ready.length < all.length) {
    const skipped = all.filter((o) => !ready.includes(o)).map(label);
    console.info(`[shopper] cooling down after a 429: ${skipped.join(", ")}${ready.length ? "" : " (trying anyway)"}`);
  }
  return ready.length ? ready : all;
}

export async function runShopperTurn(opts: {
  turns: ChatTurn[];
  /** This browser's own private shops (search shows them alongside listed demo shops). */
  myShops?: string[];
  emit: (event: ChatEvent) => void;
  signal?: AbortSignal;
  now?: Date;
}): Promise<TurnStats> {
  const { signal } = opts;
  const now = opts.now ?? new Date();
  const toolCtx = { now, myShops: opts.myShops ?? [] };
  const started = Date.now();
  const options = shopperOptions(started);
  if (!options.length) throw new Error("No shopper AI is configured (GEMINI_API_KEY / ANTHROPIC_API_KEY, SHOPPER_AI)");

  // The turn's text is what was streamed; text that resumes after tool work (a
  // later round, a new bubble in the UI) is joined with a space, not glued on.
  const segments: string[] = [];
  let afterTools = true;
  let firstTextMs: number | null = null;
  const emit = (event: ChatEvent) => {
    if (event.type === "text") {
      if (firstTextMs === null) firstTextMs = Date.now() - started;
      if (afterTools) segments.push("");
      segments[segments.length - 1] += event.delta;
      afterTools = false;
    } else if (event.type === "call" || event.type === "tool") {
      afterTools = true;
    }
    opts.emit(event);
  };

  // Sold out → run the obvious search ourselves (real tool, live data) and hand it
  // to the model as its first step, so the "Heads up" needs one model round less.
  // It runs once, whichever model ends up answering.
  const calls: ToolCallRecord[] = [];
  const results: ToolResultRecord[] = [];
  let history = opts.turns;
  const pre = prefetchFor(opts.turns);
  if (pre) {
    emit({ type: "call", name: pre.name, args: pre.args });
    const output = await runTool(pre.name, pre.args, toolCtx);
    calls.push({ name: pre.name, args: pre.args, step: 0 });
    results.push({ name: pre.name, result: output, step: 0 });
    emit({ type: "tool", name: pre.name, args: pre.args, result: output });
    history = [...opts.turns, { role: "model", tool_calls: [...calls], tool_results: [...results] }];
  }

  const system = shopperSystemPrompt(now);
  let used = options[0];
  let result: ProviderResult = { calls: [], results: [], rounds: 0 };
  for (const [i, option] of options.entries()) {
    used = option;
    let spoke = false;
    const attemptEmit = (event: ChatEvent) => {
      if (event.type === "text" || event.type === "call" || event.type === "tool") spoke = true;
      emit(event);
    };
    try {
      result = await LOOPS[option.provider]({
        history,
        firstStep: pre ? 1 : 0,
        system,
        model: option.model,
        toolCtx,
        emit: attemptEmit,
        signal,
      });
      break;
    } catch (err) {
      const status = errorStatus(err);
      if (option.provider === "gemini" && status === 429) coolingUntil.set(label(option), Date.now() + COOLDOWN_MS);
      const next = options[i + 1];
      // Overflow only on "busy", before this attempt showed anything, and never after an abort.
      if (!next || option.provider !== "gemini" || spoke || signal?.aborted || !isBusyError(err)) throw err;
      console.warn(`[shopper] ${label(option)} answered ${status} → trying ${label(next)}`);
    }
  }

  calls.push(...result.calls);
  results.push(...result.results);
  const text = segments
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const turn: ChatTurn = {
    role: "model",
    ...(text ? { text } : {}),
    ...(calls.length ? { tool_calls: calls, tool_results: results } : {}),
  };
  if (!turn.text && !calls.length && !signal?.aborted) {
    emit({ type: "error", code: "no_reply", message: "The AI didn't answer that one. Try asking another way?" });
  }
  emit({ type: "turn", turn });

  const stats = { rounds: result.rounds, first_text_ms: firstTextMs, total_ms: Date.now() - started };
  console.info(
    `[shopper] rounds=${stats.rounds} first_text=${stats.first_text_ms ?? "-"}ms total=${stats.total_ms}ms provider=${label(used)}${result.note ? ` ${result.note}` : ""}`,
  );
  return stats;
}
