import "server-only";
import type {
  ContentBlock,
  Message,
  MessageCreateParamsBase,
  TextBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { getClaude, thinkingOff } from "@/lib/ai/claude";
import { claudeToolResult, toClaudeMessages } from "@/lib/ai/shopper-history";
import { MAX_TOOL_ROUNDS, type ProviderResult, type ProviderTurn } from "@/lib/ai/shopper-loop";
import { isToolName, type ToolCallRecord, type ToolResultRecord } from "@/lib/ai/shopper-types";
import { runTool } from "@/lib/ai/tools";
import { CLAUDE_TOOLS } from "@/lib/ai/tools/declarations";

// The shopper's tool loop on Claude (the paid overflow, CONTRACTS §12). Same
// contract as the Gemini loop: stream text as it arrives, `call` once a
// tool_use block is complete, run the read-only tools, `tool` per result,
// repeat; the last round is text-only. No extended thinking.

/** Plenty for 1–3 sentences plus a few tool calls. */
export const MAX_OUTPUT_TOKENS = 4096;

/** What the loop uses from the SDK client (`getClaude()`, or a test fake). */
export interface ClaudeStream {
  on(event: "text", listener: (delta: string) => void): unknown;
  on(event: "contentBlock", listener: (block: ContentBlock) => void): unknown;
  finalMessage(): Promise<Message>;
}
export interface ClaudeClient {
  messages: { stream(params: MessageCreateParamsBase, options?: { signal?: AbortSignal }): ClaudeStream };
}

export async function runClaudeTurn(t: ProviderTurn, client: ClaudeClient = getClaude()): Promise<ProviderResult> {
  const { emit, signal } = t;
  // A prefetched step replays like any past call: a synthetic tool_use + tool_result with a deterministic id.
  const messages = toClaudeMessages(t.history);
  // Prompt cache: tools (breakpoint on the last one) → system (breakpoint here) → messages.
  const system: TextBlockParam[] = [{ type: "text", text: t.system, cache_control: { type: "ephemeral" } }];
  const calls: ToolCallRecord[] = [];
  const results: ToolResultRecord[] = [];
  let rounds = 0;
  let cacheRead = 0;
  let cacheWrite = 0;

  for (let step = t.firstStep; step <= MAX_TOOL_ROUNDS && !signal?.aborted; step++) {
    const textOnly = step === MAX_TOOL_ROUNDS;
    const stream = client.messages.stream(
      {
        model: t.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        // Still declared on the text-only round: the history holds tool_use blocks, and the cached prefix stays put.
        tools: CLAUDE_TOOLS,
        tool_choice: textOnly ? { type: "none" } : { type: "auto" },
        messages,
        ...thinkingOff(t.model),
      },
      { signal },
    );
    stream.on("text", (delta) => {
      if (delta) emit({ type: "text", delta });
    });
    stream.on("contentBlock", (block) => {
      // The block is complete here, so its input is the real args.
      if (block.type === "tool_use" && isToolName(block.name)) emit({ type: "call", name: block.name, args: inputOf(block) });
    });
    const message = await stream.finalMessage();
    cacheRead += message.usage?.cache_read_input_tokens ?? 0;
    cacheWrite += message.usage?.cache_creation_input_tokens ?? 0;

    const uses = message.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    // Only a finished tool round runs tools: max_tokens or a refusal can cut a call off mid-input.
    if (!uses.length || message.stop_reason !== "tool_use") break;

    rounds++;
    // The model's content exactly as sent (any thinking blocks included) for the next round.
    messages.push({ role: "assistant", content: message.content });
    const outputs = await Promise.all(uses.map((u) => runTool(u.name, u.input, t.toolCtx)));
    messages.push({ role: "user", content: uses.map((u, i) => claudeToolResult(u.id, outputs[i])) });
    uses.forEach((u, i) => {
      if (!isToolName(u.name)) return;
      const args = inputOf(u);
      calls.push({ id: u.id, name: u.name, args, step });
      results.push({ id: u.id, name: u.name, result: outputs[i], step });
      emit({ type: "tool", name: u.name, args, result: outputs[i] });
    });
  }
  return { calls, results, rounds, note: `cache_read=${cacheRead} cache_write=${cacheWrite}` };
}

function inputOf(block: { input: unknown }): Record<string, unknown> {
  const input = block.input;
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}
