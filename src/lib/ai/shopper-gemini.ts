import "server-only";
import {
  FunctionCallingConfigMode,
  ThinkingLevel,
  type Content,
  type FunctionCall,
  type GoogleGenAI,
  type Part,
} from "@google/genai";
import { getGemini } from "@/lib/ai/gemini";
import { toGeminiContents } from "@/lib/ai/shopper-history";
import { MAX_TOOL_ROUNDS, type ProviderResult, type ProviderTurn } from "@/lib/ai/shopper-loop";
import { isToolName, type ToolCallRecord, type ToolResultRecord } from "@/lib/ai/shopper-types";
import { runTool } from "@/lib/ai/tools";
import { TOOL_DECLARATIONS } from "@/lib/ai/tools/declarations";

// The shopper's tool loop on Gemini (the free first choice, CONTRACTS §12):
// model → function calls → run the read-only tools here → feed the results
// back → repeat until the model answers in text. The last round is text-only.

export async function runGeminiTurn(t: ProviderTurn, ai: GoogleGenAI = getGemini()): Promise<ProviderResult> {
  const { emit, signal } = t;
  // A prefetched step replays like any past function call (with Gemini's
  // documented placeholder thought signature for calls it didn't generate).
  const contents: Content[] = toGeminiContents(t.history);
  const calls: ToolCallRecord[] = [];
  const results: ToolResultRecord[] = [];
  let rounds = 0;
  let malformedRetries = 0;
  let step = t.firstStep;

  while (step <= MAX_TOOL_ROUNDS && !signal?.aborted) {
    const textOnly = step === MAX_TOOL_ROUNDS;
    const stream = await ai.models.generateContentStream({
      model: t.model,
      contents,
      config: {
        systemInstruction: t.system,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: {
          functionCallingConfig: { mode: textOnly ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO },
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: signal,
        // No SDK retries: a 429 must reach the overflow logic at once, not after ~15 s of backoff.
        httpOptions: { retryOptions: { attempts: 1 } },
      },
    });

    const parts: Part[] = [];
    let finishReason: string | undefined;
    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      for (const part of candidate?.content?.parts ?? []) {
        parts.push(part);
        if (typeof part.text === "string" && part.text && !part.thought) emit({ type: "text", delta: part.text });
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
    const outputs = await Promise.all(fnCalls.map((fc) => runTool(fc.name ?? "", fc.args ?? {}, t.toolCtx)));
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
  return { calls, results, rounds };
}

function argsOf(fc: FunctionCall): Record<string, unknown> {
  return fc.args && typeof fc.args === "object" ? (fc.args as Record<string, unknown>) : {};
}
