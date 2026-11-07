/**
 * Chat persistence for the native client.
 *
 * Mirrors `src/services/chatService.js`: the same `/api/chats` routes, with the
 * bearer token supplied by the API client. Chat history is the server's source
 * of truth, so switching devices and reinstalling keeps conversations.
 */
import { requestJson } from "./client";

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  projectId?: string | null;
  pinnedAt?: number | null;
  chatMode?: "single" | "conversation";
  lastUserAt?: number | null;
  active?: boolean;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: unknown[] | null;
  createdAt?: number;
  turnId?: string | null;
}

export interface ChatDetail extends ChatSummary {
  messages: StoredMessage[];
}

export interface ListedChats {
  chats: ChatSummary[];
}

const BASE = "/api/chats";

export async function listChats(): Promise<ListedChats> {
  const data = await requestJson<{ chats?: ChatSummary[] }>(BASE, {
    method: "GET",
  });
  return { chats: Array.isArray(data.chats) ? data.chats : [] };
}

export async function createChat(input: {
  title?: string;
  firstMessage?: { role: "user"; content: string };
} = {}): Promise<ChatSummary> {
  return requestJson<ChatSummary>(BASE, { method: "POST", body: input });
}

export async function getChat(chatId: string): Promise<ChatDetail> {
  return requestJson<ChatDetail>(
    `${BASE}/${encodeURIComponent(chatId)}`,
    { method: "GET" },
  );
}

export async function appendMessage(
  chatId: string,
  message: {
    role: "user" | "assistant";
    content: string;
    attachments?: unknown[];
    turnId?: string;
  },
): Promise<void> {
  await requestJson<{ success?: boolean }>(
    `${BASE}/${encodeURIComponent(chatId)}/messages`,
    { method: "POST", body: message },
  );
}

export async function patchChatTitle(
  chatId: string,
  title: string,
): Promise<void> {
  await requestJson<{ success?: boolean }>(
    `${BASE}/${encodeURIComponent(chatId)}`,
    { method: "PATCH", body: { title } },
  );
}

export async function deleteChat(chatId: string): Promise<void> {
  await requestJson<{ success?: boolean }>(
    `${BASE}/${encodeURIComponent(chatId)}`,
    { method: "DELETE" },
  );
}

/** A short, sanitized title derived from the first user prompt. */
export function deriveChatTitle(prompt: string, maxLength = 60): string {
  const flat = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "New chat";
  const withoutCommand = flat.replace(/^@[a-z]+\s+/i, "");
  const title = (withoutCommand || flat).slice(0, maxLength).trim();
  return title || "New chat";
}
