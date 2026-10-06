/**
 * Chat prefetch — start the chat requests while the session check is in flight.
 *
 * The session check (`/api/auth/me`) used to gate the chat requests twice over:
 * `AppInner` renders nothing but the spinner until it answers, and `MainApp` —
 * which owns the chat fetches — does not mount until it does. A cold load
 * therefore paid `document → bundle → /api/auth/me → /api/chats` in series.
 *
 * The client never actually needed the answer first. Every chat route
 * authorises from the `corez_session` cookie itself (`verifySession` is the
 * first thing the handler does, and a request without a session gets a 401 with
 * no database work), so the identity `/api/auth/me` returns is not an input to
 * `/api/chats`.
 *
 * So `AppInner` starts the requests here, in parallel with the check, and
 * `MainApp` consumes the in-flight promise instead of issuing a second one.
 * `take*` clears the entry, so the request is made exactly once whether or not
 * it was prefetched, and a later call re-asks rather than replaying a stale
 * answer.
 *
 * A prefetch nobody consumes is the anonymous case: a visitor on `/` or
 * `/chat/:id` who is about to be sent to `/login`. That promise is marked
 * handled below, so it is swallowed instead of surfacing as an unhandled
 * rejection, and the cost of the miss is two cheap 401s. Public routes
 * (sign-in, pricing, the policies) never prefetch at all.
 */

import * as chatService from "./chatService";

const CHAT_LIST = "list";
const chatKey = (chatId) => `chat:${chatId}`;

/** In-flight requests by key, until someone takes them. */
const pending = new Map();

function start(key, request) {
  const promise = request();
  // Nobody may ever await this (see the module comment), and an unhandled
  // rejection here would be reported as a page error. Attaching a handler marks
  // it handled while leaving the rejection intact for a real consumer.
  promise.catch(() => {});
  pending.set(key, promise);
  return promise;
}

function take(key) {
  const promise = pending.get(key);
  pending.delete(key);
  return promise;
}

/** Start the chat list request unless one is already in flight. */
export function prefetchChatList() {
  if (pending.has(CHAT_LIST)) return;
  start(CHAT_LIST, () => chatService.listChats());
}

/**
 * Start one chat's request unless one is already in flight. Mirrors the default
 * read `MainApp` makes: the compact view, most recent 30 messages.
 */
export function prefetchChat(chatId) {
  if (!chatId) return;
  const key = chatKey(chatId);
  if (pending.has(key)) return;
  start(key, () => chatService.getChat(chatId, { compact: true, keep: 30 }));
}

/** The prefetched chat list, cleared so a later call re-asks. */
export function takeChatList() {
  return take(CHAT_LIST);
}

/** The prefetched chat, cleared so a later call re-asks. */
export function takeChat(chatId) {
  if (!chatId) return undefined;
  return take(chatKey(chatId));
}

/** Whether a request for this key is already in flight (used by tests). */
export function hasPrefetched(key) {
  return pending.has(key);
}

/**
 * Drop every unconsumed prefetch.
 *
 * A prefetch is a bet that the visitor is signed in, and the session check is
 * what settles it. When the check answers that nobody is (or that it could not
 * tell), the bet is off and the entries have to go: they were 401s, and leaving
 * them behind would hand a stale rejection to `MainApp` the moment the visitor
 * signs in — the chat list would silently fall back to localStorage instead of
 * loading the account's chats, and the chat read would give up on a 401.
 */
export function dropChatPrefetches() {
  pending.clear();
}

/** Test seam: drop every in-flight entry without touching the network. */
export function __resetChatPrefetchForTests() {
  pending.clear();
}
