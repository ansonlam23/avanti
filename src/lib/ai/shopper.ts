import "server-only";
import { FunctionCallingConfigMode, ThinkingLevel, type Content, type FunctionCall, type Part } from "@google/genai";
import { geminiModel, getGemini } from "@/lib/ai/gemini";
import { shopperSystemPrompt } from "@/lib/ai/prompts/shopper";
import { prefetchFor, REPLAY_THOUGHT_SIGNATURE, toGeminiContents } from "@/lib/ai/shopper-history";
import {
  isToolName,
  type ChatEvent,
  type ChatTurn,
  type ToolCallRecord,
  type ToolResultRecord,
} from "@/lib/ai/shopper-types";
import { runTool, TOOL_DECLARATIONS } from "@/lib/ai/tools";

// The shopper agent's tool loop (CONTRACTS §10): model → function calls → run
// the (read-only) tools here on the server → feed the results back → repeat
// until the model answers in text. At most MAX_TOOL_ROUNDS rounds of tools;
// the round after that is text-only.

export const MAX_TOOL_ROUNDS = 5;

export interface TurnStats {
  rounds: number;
  first_text_ms: number | null;
  total_ms: number;
}

export async function runShopperTurn(opts: {
  turns: ChatTurn[];
  /** This browser's own private shops (search shows them alongside listed demo shops). */
  myShops?: string[];
  emit: (event: ChatEvent) => void;
  signal?: AbortSignal;
  now?: Date;
}): Promise<TurnStats> {
  const { emit, signal } = opts;
  const now = opts.now ?? new Date();
  const toolCtx = { now, myShops: opts.myShops ?? [] };
  const started = Date.now();
  const ai = getGemini();
  const contents: Content[] = toGeminiContents(opts.turns);
  const systemInstruction = shopperSystemPrompt(now);

  const calls: ToolCallRecord[] = [];
  const results: ToolResultRecord[] = [];
  let text = "";
  let firstTextMs: number | null = null;
  let rounds = 0;
  let malformedRetries = 0;
  let step = 0;

  // Sold out → run the obvious search ourselves (real tool, live data) and hand it
  // to the model as its first step, so the "Heads up" needs one model round less.
  // Gemini documents a placeholder thought signature for function calls it didn't generate.
  const pre = prefetchFor(opts.turns);
  if (pre) {
    emit({ type: "call", name: pre.name, args: pre.args });
    const output = await runTool(pre.name, pre.args, toolCtx);
    contents.push({
      role: "model",
      parts: [{ functionCall: { name: pre.name, args: pre.args }, thoughtSignature: REPLAY_THOUGHT_SIGNATURE }],
    });
    contents.push({ role: "user", parts: [{ functionResponse: { name: pre.name, response: { output } } }] });
    calls.push({ name: pre.name, args: pre.args, step });
    results.push({ name: pre.name, result: output, step });
    emit({ type: "tool", name: pre.name, args: pre.args, result: output });
    step++;
  }

  while (step <= MAX_TOOL_ROUNDS && !signal?.aborted) {
    const textOnly = step === MAX_TOOL_ROUNDS;
    const stream = await ai.models.generateContentStream({
      model: geminiModel(),
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: {
          functionCallingConfig: { mode: textOnly ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO },
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: signal,
      },
    });

    const parts: Part[] = [];
    let finishReason: string | undefined;
    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      for (const part of candidate?.content?.parts ?? []) {
        parts.push(part);
        if (typeof part.text === "string" && part.text && !part.thought) {
          if (firstTextMs === null) firstTextMs = Date.now() - started;
          text += part.text;
          emit({ type: "text", delta: part.text });
        }
        if (part.functionCall?.name && isToolName(part.functionCall.name)) {
          emit({ type: "call", name: part.functionCall.name, args: argsOf(part.functionCall) });
        }
      }
    }

    const fnCalls = parts.map((p) => p.functionCall).filter((fc): fc is FunctionCall => Boolean(fc?.name));
    if (!parts.length && finishReason === "MALFORMED_FUNCTION_CALL" && malformedRetries < 1) {
      malformedRetries++; // one quiet retry of the same round
      continue;
    }
    // Keep the model's parts exactly as sent (thought signatures included) for the next round.
    if (parts.length) contents.push({ role: "model", parts });
    if (!fnCalls.length) break;

    rounds++;
    const outputs = await Promise.all(fnCalls.map((fc) => runTool(fc.name ?? "", fc.args ?? {}, toolCtx)));
    const responses: Part[] = [];
    fnCalls.forEach((fc, i) => {
      const name = fc.name ?? "";
      const output = outputs[i];
      responses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name, response: { output } } });
      if (!isToolName(name)) return;
      const args = argsOf(fc);
      calls.push({ ...(fc.id ? { id: fc.id } : {}), name, args, step });
      results.push({ ...(fc.id ? { id: fc.id } : {}), name, result: output, step });
      emit({ type: "tool", name, args, result: output });
    });
    contents.push({ role: "user", parts: responses });
    step++;
  }

  const turn: ChatTurn = {
    role: "model",
    ...(text.trim() ? { text: text.trim() } : {}),
    ...(calls.length ? { tool_calls: calls, tool_results: results } : {}),
  };
  if (!turn.text && !calls.length && !signal?.aborted) {
    emit({ type: "error", code: "no_reply", message: "The AI didn't answer that one. Try asking another way?" });
  }
  emit({ type: "turn", turn });

  const stats = { rounds, first_text_ms: firstTextMs, total_ms: Date.now() - started };
  console.info(`[shopper] rounds=${stats.rounds} first_text=${stats.first_text_ms ?? "-"}ms total=${stats.total_ms}ms`);
  return stats;
}

function argsOf(fc: FunctionCall): Record<string, unknown> {
  return fc.args && typeof fc.args === "object" ? (fc.args as Record<string, unknown>) : {};
}
