// The contract between the shopper turn (shopper.ts, provider-agnostic) and
// each provider's tool loop (shopper-gemini.ts, shopper-claude.ts).
import type { ChatEvent, ChatTurn, ToolCallRecord, ToolResultRecord } from "@/lib/ai/shopper-types";
import type { ToolContext } from "@/lib/ai/tools";

/** At most this many rounds of tools per reply; the round after that is text-only. */
export const MAX_TOOL_ROUNDS = 5;

export interface ProviderTurn {
  /**
   * The transcript to answer. When the server ran this turn's first step itself
   * (sold-out prefetch), it ends with that step as a partial model turn.
   */
  history: ChatTurn[];
  /** Step of the model's first round: 1 after a prefetched step, else 0. */
  firstStep: number;
  system: string;
  model: string;
  toolCtx: ToolContext;
  /** `text` / `call` / `tool` events, as they happen. */
  emit: (event: ChatEvent) => void;
  signal?: AbortSignal;
}

export interface ProviderResult {
  /** The model's own tool rounds (not the prefetched step). */
  calls: ToolCallRecord[];
  results: ToolResultRecord[];
  rounds: number;
  /** For the stats log line (Claude: prompt-cache hits). */
  note?: string;
}
