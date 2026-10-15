/**
 * Sidebar display order — one definition shared by the sidebar (rendering)
 * and the app shell (optimistic reorders), mirroring the server rule in
 * worker/chats.js (`listMemberIds`).
 *
 * A display list is one sidebar section: `pinned`, `recents`, or
 * `project:<id>`. A pinned chat lives in Pinned no matter which folder it
 * also belongs to; a chat whose folder is gone falls back to Recents.
 * A list is recency-ordered until the user drags inside it; the first drag
 * freezes that list into manual order (`manualLists`).
 */

export function displayListKey(session, projectIds) {
  if (session?.pinnedAt) return "pinned";
  if (session?.projectId && projectIds?.has(session.projectId)) {
    return `project:${session.projectId}`;
  }
  return "recents";
}

function recency(a, b) {
  return (
    (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? -1 : 1)
  );
}

export function compareSessions(a, b, listKey, manualLists) {
  const manual =
    Array.isArray(manualLists)
      ? manualLists.includes(listKey)
      : manualLists?.has?.(listKey);
  if (manual) {
    // Manual lists always carry explicit positions (assigned when the list
    // went manual and on every join since); a missing one sorts last.
    return (
      (b.sortOrder ?? Number.NEGATIVE_INFINITY) -
        (a.sortOrder ?? Number.NEGATIVE_INFINITY) || recency(a, b)
    );
  }
  if (listKey === "pinned") {
    return (b.pinnedAt || 0) - (a.pinnedAt || 0) || recency(a, b);
  }
  return recency(a, b);
}

/** Members of one display list in display order. */
export function orderedListMembers(sessions, listKey, projectIds, manualLists) {
  return sessions
    .filter((s) => displayListKey(s, projectIds) === listKey)
    .sort((a, b) => compareSessions(a, b, listKey, manualLists));
}
