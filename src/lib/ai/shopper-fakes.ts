// Scripted stand-ins for the Gemini and Claude SDK clients (imported only by
// *.test.ts). They test the tool LOOPS, not the models: each model call takes
// the next scripted reply, and every request is recorded as it was sent.
import { APIUserAbortError } from "@anthropic-ai/sdk";
import type { ContentBlock, Message, MessageCreateParamsBase, StopReason } from "@anthropic-ai/sdk/resources/messages";
import type { ClaudeClient, ClaudeStream } from "./shopper-claude";

/** An SDK-style error with an HTTP status (both SDKs expose `status`). */
export function httpError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

// ── Gemini ────────────────────────────────────────────────────────────────

type Part = Record<string, unknown>;
/** Chunks of parts; or a failure, optionally after some chunks were streamed. */
export type GeminiReply = Part[][] | { error: unknown; after?: Part[][] };
export interface GeminiRequest {
  model: string;
  contents: Array<{ role: string; parts: Part[] }>;
  config: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function fakeGemini() {
  const script: GeminiReply[] = [];
  const requests: GeminiRequest[] = [];
  const client = {
    models: {
      generateContentStream: async (req: GeminiRequest) => {
        // abortSignal can't be cloned; keep everything else as it was sent.
        const { abortSignal, ...config } = req.config ?? {};
        void abortSignal;
        requests.push(structuredClone({ ...req, config }));
        const reply = script.shift() ?? [];
        if (!Array.isArray(reply) && !reply.after) throw reply.error;
        const chunks = Array.isArray(reply) ? reply : (reply.after ?? []);
        return (async function* () {
          for (const parts of chunks) yield { candidates: [{ content: { role: "model", parts } }] };
          if (!Array.isArray(reply)) throw reply.error;
        })();
      },
    },
  };
  return { client, script, requests };
}

// ── Claude ────────────────────────────────────────────────────────────────

/** One scripted Claude reply: text (streamed in these pieces), then tool calls. */
export interface ClaudeReply {
  text?: string[];
  tools?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  /** Default: "tool_use" when there are tools, else "end_turn". */
  stop_reason?: StopReason;
  /** finalMessage() rejects with this after streaming the rest. */
  error?: unknown;
  usage?: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

export function fakeClaude() {
  const script: ClaudeReply[] = [];
  const requests: MessageCreateParamsBase[] = [];
  const client: ClaudeClient = {
    messages: {
      stream(params, options) {
        requests.push(structuredClone(params));
        const reply = script.shift() ?? {};
        const onText: Array<(delta: string) => void> = [];
        const onBlock: Array<(block: ContentBlock) => void> = [];
        const stream: ClaudeStream = {
          on(event: "text" | "contentBlock", listener: (arg: never) => void) {
            (event === "text" ? onText : onBlock).push(listener as never);
            return stream;
          },
          async finalMessage() {
            await Promise.resolve(); // like the SDK: events arrive after the call returns
            if (options?.signal?.aborted) throw new APIUserAbortError();
            const content: ContentBlock[] = [];
            const finish = (block: ContentBlock) => {
              content.push(block);
              for (const l of onBlock) l(block);
            };
            if (reply.text?.length) {
              for (const delta of reply.text) for (const l of onText) l(delta);
              finish({ type: "text", text: reply.text.join(""), citations: null });
            }
            for (const t of reply.tools ?? []) {
              finish({ type: "tool_use", id: t.id, name: t.name, input: t.input, caller: { type: "direct" } });
            }
            if (reply.error) throw reply.error;
            return {
              id: `msg_${requests.length}`,
              type: "message",
              role: "assistant",
              model: params.model,
              content,
              stop_reason: reply.stop_reason ?? (reply.tools?.length ? "tool_use" : "end_turn"),
              stop_sequence: null,
              usage: { input_tokens: 10, output_tokens: 5, ...reply.usage },
            } as unknown as Message;
          },
        };
        return stream;
      },
    },
  };
  return { client, script, requests };
}
