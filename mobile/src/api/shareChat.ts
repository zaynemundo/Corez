/**
 * Public conversation snapshots.
 *
 * `POST /api/chats/:id/share` freezes the conversation into an immutable
 * snapshot and returns a `/share/chat/<token>` link; the public viewer reads
 * `GET /api/share/chat/<token>` without a session. Asset URLs inside the
 * snapshot are rewritten to token-scoped public asset routes by the Worker.
 */
import { requestJson } from "./client";

export interface SharedChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: number | string | null;
  turnId?: string | null;
  speakerName?: string | null;
  modelId?: string | null;
  attachments?: unknown[] | null;
}

export interface SharedChat {
  version: number;
  title: string;
  createdAt?: number | string | null;
  sharedAt?: number | string | null;
  messages: SharedChatMessage[];
}

export interface ChatShareState {
  shared: boolean;
  token?: string;
  url?: string;
  title?: string;
}

export async function getSharedChat(token: string): Promise<SharedChat> {
  const safe = String(token || "").trim();
  if (!safe) throw new Error("A share token is required.");
  return requestJson<SharedChat>(
    `/api/share/chat/${encodeURIComponent(safe)}`,
    { method: "GET", timeoutMs: 20_000 },
  );
}

export async function getChatShare(chatId: string): Promise<ChatShareState> {
  const safe = String(chatId || "").trim();
  if (!safe) throw new Error("A chat id is required.");
  return requestJson<ChatShareState>(
    `/api/chats/${encodeURIComponent(safe)}/share`,
    { method: "GET" },
  );
}

/** Create the share, or return the existing one (the Worker is idempotent). */
export async function createChatShare(chatId: string): Promise<ChatShareState> {
  const safe = String(chatId || "").trim();
  if (!safe) throw new Error("A chat id is required.");
  const result = await requestJson<ChatShareState>(
    `/api/chats/${encodeURIComponent(safe)}/share`,
    { method: "POST", timeoutMs: 30_000 },
  );
  if (!result?.url) throw new Error("The share request did not return a link.");
  return result;
}

export async function revokeChatShare(chatId: string): Promise<void> {
  const safe = String(chatId || "").trim();
  if (!safe) throw new Error("A chat id is required.");
  await requestJson<ChatShareState>(
    `/api/chats/${encodeURIComponent(safe)}/share`,
    { method: "DELETE" },
  );
}
