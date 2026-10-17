import { runShopperTurn } from "@/lib/ai/shopper";
import { sanitizeTranscript } from "@/lib/ai/shopper-history";
import type { ChatEvent } from "@/lib/ai/shopper-types";
import { hasGemini, hasSupabase } from "@/lib/env";
import { badRequest, jsonError } from "@/lib/http";
import { LIMITS, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/agent/chat (CONTRACTS §10). Stateless: the client sends the whole
// transcript; we stream ChatEvents back as Server-Sent Events, one JSON object
// per `data:` line. Tools are read-only; ordering happens only through the
// shopper's own "Confirm & hold" tap (POST /api/agent/confirm).

const MAX_BODY_BYTES = 600_000;
const TURN_TIMEOUT_MS = 45_000;

export async function POST(req: Request) {
  // Per-IP limit (public demo, CONTRACTS §11). Started first, awaited after the cheap checks.
  const limit = rateLimit(req, "chat", ...LIMITS.chat);
  if (!hasGemini()) return jsonError(503, "ai_not_configured", "The shopper AI isn't connected yet.");
  if (!hasSupabase()) return jsonError(503, "db_not_configured", "The shop directory isn't connected yet.");

  const [limited, raw] = await Promise.all([limit, req.text().catch(() => "")]);
  if (limited) return limited;
  if (raw.length > MAX_BODY_BYTES) return jsonError(413, "too_large", "This conversation is too long. Start a new chat.");
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return badRequest("Expected JSON");
  }
  const parsed = sanitizeTranscript(body);
  if (!parsed.ok) return badRequest(parsed.message);

  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  // A turn that hangs ends with an honest message, well inside maxDuration.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, TURN_TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // client went away
        }
      };
      try {
        await runShopperTurn({ turns: parsed.turns, myShops: parsed.myShops, emit, signal: abort.signal });
        if (timedOut) emit({ type: "error", code: "ai_timeout", message: "The AI took too long. Try again?" });
      } catch (err) {
        if (timedOut) {
          emit({ type: "error", code: "ai_timeout", message: "The AI took too long. Try again?" });
        } else if (!abort.signal.aborted) {
          console.error("[shopper] turn failed:", err);
          emit({ type: "error", ...friendlyError(err) });
        }
      } finally {
        clearTimeout(timer);
        emit({ type: "done" });
        open = false;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // no-transform keeps proxies/compression from buffering the stream
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

function friendlyError(err: unknown): { code: string; message: string } {
  const status = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) : 0;
  if (status === 429) return { code: "ai_busy", message: "The AI is busy right now. Try again in a few seconds." };
  if (status === 400) return { code: "ai_rejected", message: "The AI couldn't read this conversation. Start a new chat?" };
  if (status >= 500) return { code: "ai_unavailable", message: "The AI didn't answer. Try again in a moment." };
  return { code: "ai_failed", message: "Something went wrong talking to the AI. Try again." };
}
