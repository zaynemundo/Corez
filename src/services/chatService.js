/**
 * Chat persistence service — server-backed roaming chats at corez.pro/chat/:id
 * All requests use credentials:include so HttpOnly corez_session cookie is sent.
 * When server is unavailable (tests/local dev without D1), callers fallback to localStorage.
 */

const BASE = "/api/chats";

function fetchJson(url, opts = {}) {
  return fetch(url, { credentials: "include", ...opts });
}

export async function listChats() {
  const r = await fetchJson(BASE, { method: "GET" });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `listChats failed: ${r.status}`);
  }
  const d = await r.json();
  return d.chats || [];
}

export async function createChat({ title } = {}) {
  const r = await fetchJson(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `createChat failed: ${r.status}`);
  }
  return await r.json();
}

export async function getChat(chatId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.compact) params.set("compact", "1");
  if (opts.keep) params.set("keep", String(opts.keep));
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const r = await fetchJson(`${BASE}/${encodeURIComponent(chatId)}${qs}`, {
    method: "GET",
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    const err = new Error(e.error || `getChat failed: ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return await r.json();
}

export async function getChatCompact(chatId, keep = 30) {
  return getChat(chatId, { compact: true, keep });
}

export async function getChatFull(chatId) {
  return getChat(chatId, { compact: false });
}

export async function patchChatTitle(chatId, title) {
  const r = await fetchJson(`${BASE}/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `patchChatTitle failed: ${r.status}`);
  }
  return await r.json();
}

export async function putChat(chatId, { title, messages } = {}) {
  const payload = {};
  if (title != null) payload.title = title;
  if (messages != null) payload.messages = messages;
  const r = await fetchJson(`${BASE}/${encodeURIComponent(chatId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `putChat failed: ${r.status}`);
  }
  return await r.json();
}

export async function appendMessage(chatId, { role, content, attachments }) {
  const r = await fetchJson(`${BASE}/${encodeURIComponent(chatId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content, attachments }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `appendMessage failed: ${r.status}`);
  }
  return await r.json();
}

export async function deleteChat(chatId) {
  const r = await fetchJson(`${BASE}/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `deleteChat failed: ${r.status}`);
  }
  return await r.json();
}

export async function deleteAllChats() {
  const r = await fetchJson(BASE, { method: "DELETE" });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `deleteAllChats failed: ${r.status}`);
  }
  return await r.json();
}
