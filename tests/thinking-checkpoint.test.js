import { describe, it, expect, beforeEach } from 'vitest';
import {
  THINKING_CHECKPOINT_TTL_MS,
  clearThinkingCheckpoint,
  createPromptFingerprint,
  pruneThinkingCheckpoints,
  readThinkingCheckpoint,
  writeThinkingCheckpoint,
} from '../src/utils/thinkingCheckpoint.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key) {
    return this.map.get(key) ?? null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

describe('thinking checkpoints', () => {
  let storage;
  const now = 1_800_000_000_000;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('stores and reads thinking for the same prompt fingerprint', () => {
    const fingerprint = createPromptFingerprint('Build a black hole');
    expect(
      writeThinkingCheckpoint('chat-1', {
        fingerprint,
        thinking: 'First analyze the geometry.',
        now,
        storage,
      }),
    ).toBe(true);

    const value = readThinkingCheckpoint('chat-1', fingerprint, {
      now,
      storage,
    });
    expect(value?.thinking).toBe('First analyze the geometry.');
  });

  it('does not reuse a checkpoint for a different prompt', () => {
    const fingerprint = createPromptFingerprint('Build a black hole');
    writeThinkingCheckpoint('chat-1', {
      fingerprint,
      thinking: 'old reasoning',
      now,
      storage,
    });
    expect(
      readThinkingCheckpoint(
        'chat-1',
        createPromptFingerprint('Build a different scene'),
        { now, storage },
      ),
    ).toBeNull();
  });

  it('expires after twelve hours and prunes stale keys', () => {
    const fingerprint = createPromptFingerprint('Build a scene');
    writeThinkingCheckpoint('chat-1', {
      fingerprint,
      thinking: 'stale reasoning',
      now,
      storage,
    });
    expect(
      readThinkingCheckpoint('chat-1', fingerprint, {
        now: now + THINKING_CHECKPOINT_TTL_MS + 1,
        storage,
      }),
    ).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('clears on a completed answer', () => {
    const fingerprint = createPromptFingerprint('Build a scene');
    writeThinkingCheckpoint('chat-1', {
      fingerprint,
      thinking: 'reasoning',
      now,
      storage,
    });
    clearThinkingCheckpoint('chat-1', { storage });
    expect(readThinkingCheckpoint('chat-1', fingerprint, { now, storage })).toBeNull();
  });

  it('prunes only old checkpoint keys', () => {
    const old = createPromptFingerprint('old');
    const fresh = createPromptFingerprint('fresh');
    writeThinkingCheckpoint('old-chat', {
      fingerprint: old,
      thinking: 'old',
      now: now - THINKING_CHECKPOINT_TTL_MS - 1,
      storage,
    });
    writeThinkingCheckpoint('fresh-chat', {
      fingerprint: fresh,
      thinking: 'fresh',
      now,
      storage,
    });
    pruneThinkingCheckpoints({ now, storage });
    expect(storage.length).toBe(1);
  });
});
