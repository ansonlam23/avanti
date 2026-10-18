import { AUDIO_TYPES, baseType, geminiAudioType, MAX_AUDIO_BYTES } from "@/lib/ai/audio";
import { extractMenu, OnboardAiError } from "@/lib/ai/onboard";
import { uploadShopPhoto } from "@/lib/db/shops";
import { hasGemini } from "@/lib/env";
import { LIMITS, rateLimit } from "@/lib/ratelimit";

// POST /api/onboard: counter photo + voice note (or typed notes) → menu draft.
// One Gemini call; the photo upload to Storage runs in parallel with it.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  // Public demo: protect the free AI quota (per IP, fails open). CONTRACTS §11.
  const limited = await rateLimit(req, "onboard", ...LIMITS.onboard);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "Send the photo as multipart/form-data.");
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return fail(400, "photo_required", "Add a photo of your counter first.");
  }
  const photoType = baseType(photo.type);
  if (!PHOTO_TYPES.has(photoType)) return fail(400, "bad_photo", "Use a JPEG, PNG or WebP photo.");
  if (photo.size > MAX_PHOTO_BYTES) return fail(400, "photo_too_large", "That photo is over 10 MB.");

  const audioField = form.get("audio");
  const audio = audioField instanceof File && audioField.size > 0 ? audioField : null;
  const audioType = audio ? baseType(audio.type) : null;
  if (audio && audioType && !AUDIO_TYPES.has(audioType)) {
    return fail(400, "bad_audio", "That voice note format isn't supported. Try typing instead.");
  }
  if (audio && audio.size > MAX_AUDIO_BYTES) return fail(400, "audio_too_large", "That voice note is too long.");

  const notesField = form.get("notes");
  const notes = typeof notesField === "string" ? notesField.trim().slice(0, 2000) : "";
  const hintField = form.get("language_hint");
  const languageHint = typeof hintField === "string" ? hintField.trim().slice(0, 16) : "";

  if (!hasGemini()) return fail(503, "ai_not_configured", "The menu reader isn't connected yet (no Gemini key).");

  const [photoBuf, audioBuf] = await Promise.all([
    photo.arrayBuffer().then((b) => Buffer.from(b)),
    audio ? audio.arrayBuffer().then((b) => Buffer.from(b)) : Promise.resolve(null),
  ]);

  const started = performance.now();
  let aiMs = 0;
  const [ai, upload] = await Promise.allSettled([
    extractMenu({
      image: { data: photoBuf, mimeType: photoType },
      audio: audioBuf && audioType ? { data: audioBuf, mimeType: geminiAudioType(audioType) } : undefined,
      notes: notes || undefined,
      languageHint: languageHint || undefined,
    }).finally(() => {
      aiMs = performance.now() - started;
    }),
    uploadShopPhoto(photoBuf, photoType),
  ]);

  if (ai.status === "rejected") {
    const err = ai.reason;
    console.error("[onboard] extraction failed:", err instanceof Error ? err.message : err);
    const retryable = err instanceof OnboardAiError ? err.retryable : true;
    return Response.json(
      {
        error: {
          code: "ai_failed",
          message: retryable
            ? "I couldn't read that one. Try again in a moment."
            : "I couldn't read that one. Try another photo, or type your menu instead.",
        },
      },
      { status: 502 },
    );
  }

  return Response.json({
    draft: ai.value,
    photo_url: upload.status === "fulfilled" ? upload.value : null,
    ms: Math.round(aiMs),
  });
}
