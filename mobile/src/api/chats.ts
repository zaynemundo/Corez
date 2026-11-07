/**
 * Chat persistence for the native client.
 *
 * Mirrors `src/services/chatService.js`: the same `/api/chats` routes, with the
 * bearer token supplied by the API client. Chat history is the server's source
 * of truth, so switching devices and reinstalling keeps conversations.
 */
import { requestJson } from "./client";
import { readCache, removeCache, writeCache } from "@/lib/offlineCache";

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
const CHATS_CACHE_KEY = "chats";
const chatCacheKey = (chatId: string) => `chat:${chatId}`;

export interface ChatListResult extends ListedChats {
  /** True when the network failed and this is the last saved copy. */
  offline?: boolean;
  cachedAt?: number;
}

export interface ChatDetailResult extends ChatDetail {
  offline?: boolean;
  cachedAt?: number;
}

/**
 * Chat list with an offline fallback: a successful response refreshes the
 * cache, a transport failure serves the last saved list instead of an empty
 * sheet. An HTTP error (401, 5xx) is still reported as an error.
 */
export async function listChatsWithCache(): Promise<ChatListResult> {
  try {
    const live = await listChats();
    writeCache(CHATS_CACHE_KEY, live.chats);
    return live;
  } catch (error) {
    const cached = readCache<ChatSummary[]>(CHATS_CACHE_KEY);
    if (cached && Array.isArray(cached.value) && cached.value.length > 0) {
      return { chats: cached.value, offline: true, cachedAt: cached.updatedAt };
    }
    throw error;
  }
}

/** One stored conversation with the same offline fallback as the list. */
export async function getChatWithCache(
  chatId: string,
): Promise<ChatDetailResult> {
  try {
    const live = await getChat(chatId);
    writeCache(chatCacheKey(chatId), live);
    return live;
  } catch (error) {
    const cached = readCache<ChatDetail>(chatCacheKey(chatId));
    if (cached?.value && Array.isArray(cached.value.messages)) {
      return { ...cached.value, offline: true, cachedAt: cached.updatedAt };
    }
    throw error;
  }
}

export function forgetCachedChat(chatId: string): void {
  removeCache(chatCacheKey(chatId));
}

export async function listChats(): Promise<ListedChats> {
  const data = await requestJson<{ chats?: ChatSummary[] }>(BASE, {
    method: "GET",
  });
  return { chats: Array.isArray(data.chats) ? data.chats : [] };
}

export async function createChat(input: {
  title?: string;
  firstMessage?: {
    role: "user";
    content: string;
    attachments?: unknown[];
  };
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

export async function setChatPinned(
  chatId: string,
  pinned: boolean,
): Promise<void> {
  await requestJson<{ success?: boolean }>(
    `${BASE}/${encodeURIComponent(chatId)}`,
    { method: "PATCH", body: { pinned: Boolean(pinned) } },
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
