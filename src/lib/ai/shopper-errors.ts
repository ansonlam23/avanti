// AI provider failures → an HTTP-like status, "busy or not", and what the
// shopper is told. Pure. Works for both SDKs: Gemini's ApiError and the
// Anthropic SDK's APIError both carry `status`; an Anthropic error that
// arrives mid-stream has no status, only an error `type`.

const STATUS_BY_TYPE = new Map<string, number>([
  ["invalid_request_error", 400],
  ["rate_limit_error", 429],
  ["api_error", 500],
  ["timeout_error", 504],
  ["overloaded_error", 529],
]);

export function errorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const { status, type } = err as { status?: unknown; type?: unknown };
  if (typeof status === "number" && Number.isFinite(status)) return status;
  return (typeof type === "string" && STATUS_BY_TYPE.get(type)) || null;
}

/** Rate limited (429) or down/overloaded (5xx, incl. Anthropic's 529): another model may answer. */
export function isBusyError(err: unknown): boolean {
  const status = errorStatus(err);
  return status === 429 || (status !== null && status >= 500);
}

export function friendlyError(err: unknown): { code: string; message: string } {
  const status = errorStatus(err);
  if (status === 429 || status === 529) {
    return { code: "ai_busy", message: "The AI is busy right now. Try again in a few seconds." };
  }
  if (status === 400) return { code: "ai_rejected", message: "The AI couldn't read this conversation. Start a new chat?" };
  if (status !== null && status >= 500) return { code: "ai_unavailable", message: "The AI didn't answer. Try again in a moment." };
  return { code: "ai_failed", message: "Something went wrong talking to the AI. Try again." };
}
