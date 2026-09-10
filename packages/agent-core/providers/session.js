// OpenCode Go / Zen session affinity.
//
// The gateway routes each request to an upstream backend via the
// x-opencode-session header and rejects chat requests without it
// (HTTP 400 MissingSessionID). The value is an opaque id that must stay
// stable within a run so the gateway keeps one backend — and its token
// cache — for the whole turn.

export const OPENCODE_SESSION_HEADER = 'x-opencode-session';

const SESSION_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SESSION_PREFIX = 'ses_';
const MAX_SESSION_ID_LENGTH = 128;
const CALLER_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function newOpencodeSessionId() {
  const bytes = new Uint8Array(26);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let id = SESSION_PREFIX;
  for (const byte of bytes) id += SESSION_ALPHABET[byte % 62];
  return id;
}

// Opaque caller ids (e.g. a user uid) are namespaced so they can never
// collide with real opencode session ids; already-prefixed values pass
// through untouched. The final value must fit the gateway's id bound, so a
// prefixed caller id that would exceed it falls back to a fresh id.
export function resolveOpencodeSessionId(hint) {
  if (typeof hint === 'string') {
    const value = hint.trim();
    if (value.startsWith(SESSION_PREFIX)) {
      if (
        CALLER_ID_PATTERN.test(value) &&
        value.length <= MAX_SESSION_ID_LENGTH
      ) {
        return value;
      }
    } else if (
      CALLER_ID_PATTERN.test(value) &&
      value.length + SESSION_PREFIX.length <= MAX_SESSION_ID_LENGTH
    ) {
      return `${SESSION_PREFIX}${value}`;
    }
  }
  return newOpencodeSessionId();
}
