import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

// One shared Gemini client (server only; the key never reaches the browser).
// Model name comes from GEMINI_MODEL (default "gemini-3.8-flash", checked
// against ai.google.dev/gemini-api/docs/models on 2026-10-17).

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (client) return client;
  const apiKey = env.geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export function geminiModel(): string {
  return env.geminiModel();
}
