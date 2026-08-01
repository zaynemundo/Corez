import { describe, it, expect, beforeEach } from 'vitest';
import {
  persistAndSummarize,
  retrieveContextRecord,
  retrieveContextMessages,
  retrieveContextRecords,
  storeContextRecords
} from '../src/services/contextStore.js';
import { memoryContextStore } from '../src/services/contextStoreClient.js';

describe('context store exact retrieval', () => {
  beforeEach(() => {
    memoryContextStore.clear();
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem('corez_context_metadata');
      globalThis.localStorage.removeItem('corez_context_records');
    }
  });

  const CODE_BLOCK = '```js\nfunction keepAuth() {\n  return fetch("/api/auth", { credentials: "include" });\n}\n```';
  const REQUIREMENT = 'Requirement: keep the auth flow intact.';
  const NEGATIVE = 'Must not change the offline cache strategy.';
  const ERROR_TEXT = 'Error: fetch failed: ECONNREFUSED at https://api.internal/v1 (connect timeout)';

  function makeMessages() {
    return [
      { role: 'user', content: REQUIREMENT },
      { role: 'assistant', content: CODE_BLOCK },
      { role: 'user', content: NEGATIVE },
      { role: 'assistant', content: ERROR_TEXT }
    ];
  }

  it('returns persisted messages verbatim with exact content equality', () => {
    const messages = makeMessages();
    const { recordId, persisted, summaryMessage } = persistAndSummarize(messages);

    expect(persisted).toBe(true);
    expect(summaryMessage.content).toMatch(/\[Context compaction/);
    expect(summaryMessage.content).toContain(`Full records: retrieve by key "${recordId}"`);

    const record = retrieveContextRecord(recordId);
    expect(record).not.toBeNull();
    expect(record.id).toBe(recordId);
    expect(typeof record.createdAt).toBe('number');
    expect(record.messages).toEqual(messages);

    const exact = retrieveContextMessages(recordId);
    expect(exact).toEqual(messages);
    expect(exact).not.toBe(messages);
    expect(exact.length).toBe(4);
    expect(exact[1].content).toBe(CODE_BLOCK);
  });

  it('keeps code blocks exact, including the fence markers', () => {
    const messages = [{ role: 'assistant', content: CODE_BLOCK }];
    const { recordId } = persistAndSummarize(messages);

    const exact = retrieveContextMessages(recordId);
    expect(exact[0].content).toBe(CODE_BLOCK);
    expect(exact[0].content.startsWith('```js')).toBe(true);
    expect(exact[0].content.endsWith('```')).toBe(true);
    expect(exact[0].content).toContain('function keepAuth()');
  });

  it('keeps errors exact', () => {
    const { recordId } = persistAndSummarize([{ role: 'assistant', content: ERROR_TEXT }]);
    const exact = retrieveContextMessages(recordId);
    expect(exact[0].content).toBe(ERROR_TEXT);
  });

  it('keeps negative requirements exact', () => {
    const { recordId } = persistAndSummarize([{ role: 'user', content: NEGATIVE }]);
    const exact = retrieveContextMessages(recordId);
    expect(exact[0].content).toBe(NEGATIVE);
  });

  it('retrieves multiple records with order preserved', () => {
    const first = makeMessages();
    const second = [
      { role: 'user', content: 'Decision: use the opencode-go provider.' },
      { role: 'assistant', content: '```python\nprint("ok")\n```' }
    ];
    const { recordId: firstId } = persistAndSummarize(first);
    const { recordId: secondId } = persistAndSummarize(second);

    const lists = retrieveContextRecords([firstId, secondId]);
    expect(lists.length).toBe(2);
    expect(lists[0]).toEqual(first);
    expect(lists[1]).toEqual(second);

    const reversed = retrieveContextRecords([secondId, firstId]);
    expect(reversed[0]).toEqual(second);
    expect(reversed[1]).toEqual(first);
  });

  it('returns exact message objects, never summaries or undefined', () => {
    const messages = makeMessages();
    const { recordId, summaryMessage } = persistAndSummarize(messages);

    const exact = retrieveContextMessages(recordId);
    for (const message of exact) {
      expect(message).toHaveProperty('role');
      expect(typeof message.content).toBe('string');
    }
    // The summary text must never leak into the retrieved messages.
    expect(summaryMessage.content).toContain('Context compaction');
    expect(exact.some((m) => m.content.includes('Context compaction'))).toBe(false);
    // Retrieval returns real messages, not the summary object.
    const record = retrieveContextRecord(recordId);
    expect(record.messages).toEqual(messages);
    expect(record.messages.some((m) => typeof m === 'undefined')).toBe(false);
    expect(record.messages.length).toBe(messages.length);
  });

  it('returns null / [] for unknown records', () => {
    expect(retrieveContextRecord('ctx-unknown-0001')).toBeNull();
    expect(retrieveContextMessages('ctx-unknown-0001')).toEqual([]);
    expect(retrieveContextRecords(['ctx-unknown-0001'])).toEqual([[]]);
  });

  it('still returns a legacy .content record as-is', () => {
    storeContextRecords({
      'ctx-legacy-0001': {
        id: 'ctx-legacy-0001',
        createdAt: 1,
        content: 'legacy payload text'
      }
    });

    const record = retrieveContextRecord('ctx-legacy-0001');
    expect(record).not.toBeNull();
    expect(record.content).toBe('legacy payload text');
    expect(record.messages).toBeUndefined();
    // No .messages on a legacy record: message retrieval is honestly empty.
    expect(retrieveContextMessages('ctx-legacy-0001')).toEqual([]);
  });
});
