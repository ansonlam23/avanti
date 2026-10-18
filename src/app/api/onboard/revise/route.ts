import { z } from "zod";
import { AUDIO_TYPES, baseType, geminiAudioType, MAX_AUDIO_BYTES } from "@/lib/ai/audio";
import { MAX_ITEMS, MAX_PRICE_CENTS, OnboardAiError } from "@/lib/ai/onboard";
import { reviseMenu } from "@/lib/ai/onboard-revise";
import { hasGemini } from "@/lib/env";
import { LIMITS, rateLimit } from "@/lib/ratelimit";

// POST /api/onboard/revise: "change anything" in /open. The menu so far + the
// owner's voice note or typed words → only the changes they asked for
// (CONTRACTS §5). One Gemini call; nothing is saved until the shop opens.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

const menuSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      name: z.string().trim().min(1).max(200),
      name_en: z.string().max(200).nullable(),
      price_cents: z.number().int().min(1).max(MAX_PRICE_CENTS).nullable(),
      price_source: z.enum(["spoken", "tag_in_photo", "owner", "missing"]),
      description: z.string().max(400).nullable(),
      tags: z.array(z.string().max(40)).max(20),
      est_quantity: z.number().int().min(0).max(999).nullable(),
    }),
  )
  .max(MAX_ITEMS);

export async function POST(req: Request) {
  // Public demo: protect the free AI quota (per IP, fails open). CONTRACTS §11.
  const limited = await rateLimit(req, "onboard-revise", ...LIMITS.onboardRevise);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "Send the change as multipart/form-data.");
  }

  let menu: z.infer<typeof menuSchema>;
  try {
    const parsed = menuSchema.safeParse(JSON.parse(String(form.get("menu") ?? "[]")));
    if (!parsed.success) return fail(400, "bad_menu", "That menu didn't come through. Try again.");
    menu = parsed.data;
  } catch {
    return fail(400, "bad_menu", "That menu didn't come through. Try again.");
  }

  const audioField = form.get("audio");
  const audio = audioField instanceof File && audioField.size > 0 ? audioField : null;
  const audioType = audio ? baseType(audio.type) : null;
  if (audio && audioType && !AUDIO_TYPES.has(audioType)) {
    return fail(400, "bad_audio", "That voice note format isn't supported. Try typing instead.");
  }
  if (audio && audio.size > MAX_AUDIO_BYTES) return fail(400, "audio_too_large", "That voice note is too long.");

  const notesField = form.get("notes");
  const notes = typeof notesField === "string" ? notesField.trim().slice(0, 2000) : "";
  if (!audio && !notes) return fail(400, "nothing_said", "Say or type what to change.");
  const nameField = form.get("shop_name");
  const shopName = typeof nameField === "string" ? nameField.trim().slice(0, 80) : "";
  const hintField = form.get("language_hint");
  const languageHint = typeof hintField === "string" ? hintField.trim().slice(0, 16) : "";

  if (!hasGemini()) return fail(503, "ai_not_configured", "The menu reader isn't connected yet (no Gemini key).");

  const started = performance.now();
  try {
    const revision = await reviseMenu({
      menu,
      shopName: shopName || null,
      audio: audio && audioType
        ? { data: Buffer.from(await audio.arrayBuffer()), mimeType: geminiAudioType(audioType) }
        : undefined,
      notes: notes || undefined,
      languageHint: languageHint || undefined,
    });
    return Response.json({ revision, ms: Math.round(performance.now() - started) });
  } catch (err) {
    console.error("[onboard/revise] failed:", err instanceof Error ? err.message : err);
    const retryable = err instanceof OnboardAiError ? err.retryable : true;
    return fail(
      502,
      "ai_failed",
      retryable ? "I didn't catch that. Try again in a moment." : "I didn't catch that. Try saying it another way.",
    );
  }
}
