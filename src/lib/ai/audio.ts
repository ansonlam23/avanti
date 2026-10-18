// Voice-note uploads for the onboarding routes (/api/onboard, /api/onboard/revise).

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/aiff",
  "audio/x-aiff",
]);

export function baseType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

/**
 * Gemini's own names (ai.google.dev/gemini-api/docs/audio, checked 2026-10-17):
 * wav, mp3, aiff, aac, ogg, flac, mpeg, m4a, opus, webm … but not "audio/mp4",
 * which is what iPhone Safari's MediaRecorder produces (AAC in an MP4 = .m4a).
 */
export function geminiAudioType(type: string): string {
  if (type === "audio/mp4" || type === "audio/x-m4a") return "audio/m4a";
  if (type === "audio/x-wav" || type === "audio/wave") return "audio/wav";
  if (type === "audio/x-aiff") return "audio/aiff";
  return type;
}
