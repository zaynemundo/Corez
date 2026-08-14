import { describe, it, expect, beforeEach } from 'vitest';
import { RepeatToolGuard, canonicalizeJson } from '../packages/agent-core/guards/RepeatToolGuard.js';

describe('RepeatToolGuard', () => {
  let guard;

  beforeEach(() => {
    guard = new RepeatToolGuard({
      thresholds: [3, 5, 8],
      argumentsPreviewChars: 100
    });
  });

  it('canonicalizes JSON objects regardless of key ordering', () => {
    const obj1 = { b: 2, a: 1, nested: { y: 20, x: 10 } };
    const obj2 = { a: 1, b: 2, nested: { x: 10, y: 20 } };
    expect(canonicalizeJson(obj1)).toBe(canonicalizeJson(obj2));
  });

  it('allows normal distinct tool calls', () => {
    const res1 = guard.evaluate('read_file', { filePath: 'foo.js' });
    expect(res1.status).toBe('ok');
    expect(res1.count).toBe(1);

    const res2 = guard.evaluate('read_file', { filePath: 'bar.js' });
    expect(res2.status).toBe('ok');
    expect(res2.count).toBe(1);
  });

  it('escalates to gentle warning on 3 consecutive identical calls', () => {
    guard.evaluate('grep_search', { query: 'test' });
    guard.evaluate('grep_search', { query: 'test' });
    const res = guard.evaluate('grep_search', { query: 'test' });

    expect(res.status).toBe('advisory');
    expect(res.count).toBe(3);
    expect(res.message).toMatch(/repeating the exact same/);
  });

  it('escalates to diagnostic warning on 5 consecutive identical calls', () => {
    for (let i = 0; i < 4; i++) {
      guard.evaluate('exec_command', { command: 'ls -la' });
    }
    const res = guard.evaluate('exec_command', { command: 'ls -la' });

    expect(res.status).toBe('diagnostic');
    expect(res.count).toBe(5);
    expect(res.message).toMatch(/Repeated tool call detected/);
    expect(res.message).toMatch(/consecutive_calls: 5/);
  });

  it('blocks execution with hard brake on 8 consecutive identical calls', () => {
    for (let i = 0; i < 7; i++) {
      guard.evaluate('exec_command', { command: 'ls -la' });
    }
    const res = guard.evaluate('exec_command', { command: 'ls -la' });

    expect(res.status).toBe('blocked');
    expect(res.count).toBe(8);
    expect(res.error).toMatch(/Loop guard blocked execution/);
  });

  it('resets chain when a different tool or different args are used', () => {
    guard.evaluate('read_file', { filePath: 'foo.js' });
    guard.evaluate('read_file', { filePath: 'foo.js' });
    expect(guard.evaluate('read_file', { filePath: 'foo.js' }).status).toBe('advisory');

    // Changing argument resets count
    const res = guard.evaluate('read_file', { filePath: 'foo2.js' });
    expect(res.status).toBe('ok');
    expect(res.count).toBe(1);
  });

  it('supports isolated scopes for multiple sessions', () => {
    guard.evaluate('read_file', { filePath: 'foo.js' }, 'session-1');
    guard.evaluate('read_file', { filePath: 'foo.js' }, 'session-1');
    const s1 = guard.evaluate('read_file', { filePath: 'foo.js' }, 'session-1');
    expect(s1.status).toBe('advisory');

    // Session 2 is fresh
    const s2 = guard.evaluate('read_file', { filePath: 'foo.js' }, 'session-2');
    expect(s2.status).toBe('ok');
    expect(s2.count).toBe(1);
  });
});
