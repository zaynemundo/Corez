/**
 * Turn persistence helpers.
 *
 * Chat messages are written through `/api/chats/:id/messages`. That write costs
 * a full round trip (~290ms measured from the Gulf to the WEUR D1 primary), and
 * awaiting it before the model request only delayed the answer: the user's
 * bubble is already on screen and the pending-request snapshot covers a reload.
 *
 * Ordering is still a requirement — a stored conversation must never show the
 * assistant turn before the user turn — so the assistant write is chained on the
 * user write rather than racing it. Neither helper rejects: a persistence
 * problem is reported to the caller and never interrupts the conversation.
 */

/** Start the user-turn write without blocking the caller. */
export function persistUserTurn(persist, onError) {
  return Promise.resolve()
    .then(persist)
    .catch((error) => {
      onError?.(error);
    });
}

/** Write the assistant turn once the user turn has settled. */
export function persistAssistantTurnAfter(userTurn, persist) {
  return Promise.resolve(userTurn)
    .then(persist)
    .catch(() => {});
}
