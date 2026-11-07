/**
 * Voice dictation transport.
 *
 * CoreZ records a short clip with expo-audio and sends it to the Worker's
 * `/api/transcribe` endpoint (Workers AI Whisper), the same endpoint the web
 * composer uses. The clip is read as base64 from the recorder's cache file and
 * never persisted by this module.
 */
import { File } from "expo-file-system";
import { requestJson } from "@/api/client";

export const MAX_DICTATION_MS = 120_000;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/** Whisper language code for the interface language. */
export function dictationLanguage(language: string): "en" | "ar" {
  return language === "ar" ? "ar" : "en";
}

export async function transcribeRecording(
  uri: string,
  language: string,
): Promise<string> {
  if (!uri) throw new Error("No recording was captured.");

  const file = new File(uri);
  const size = Number(file.size) || 0;
  if (size > MAX_AUDIO_BYTES) {
    throw new Error("That recording is too long. Try a shorter one.");
  }

  const audio = await file.base64();
  if (!audio) throw new Error("Could not read the recording.");

  const data = await requestJson<{ text?: string }>("/api/transcribe", {
    method: "POST",
    body: { audio, language: dictationLanguage(language) },
    timeoutMs: 60_000,
  });

  const text = String(data.text || "").trim();
  if (!text) throw new Error("No speech was detected. Try again.");
  return text;
}
