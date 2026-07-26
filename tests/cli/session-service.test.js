import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonlSessionStore, SessionService } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => {
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function createMemoryStore() {
  const metadata = new Map();
  const events = new Map();
  let sequence = 0;
  return {
    create(input) {
      const id = `s${++sequence}`;
      const record = {
        id,
        ...input,
        createdAt: `2026-07-26T00:00:0${sequence}.000Z`,
        updatedAt: `2026-07-26T00:00:0${sequence}.000Z`,
        status: 'active'
      };
      metadata.set(id, record);
      events.set(id, []);
      return record;
    },
    list: () => [...metadata.values()],
    get: id => metadata.get(id),
    append(id, event) {
      events.get(id).push(event);
      return event;
    },
    readEvents: id => [...events.get(id)],
    update(id, patch) {
      const record = { ...metadata.get(id), ...patch };
      metadata.set(id, record);
      return record;
    },
    delete(id) {
      metadata.delete(id);
      events.delete(id);
    }
  };
}

describe('SessionService', () => {
  it('continues the newest session for the canonical project', () => {
    const store = createMemoryStore();
    const canonical = value => value === '/alias-a' ? '/a' : value;
    const service = new SessionService({ store, realpath: canonical });
    const first = service.create({
      projectPath: '/a',
      model: 'x',
      policy: 'chat',
      title: 'first'
    });
    const second = service.create({
      projectPath: '/alias-a',
      model: 'x',
      policy: 'chat',
      title: 'second'
    });
    service.create({ projectPath: '/b', model: 'x', policy: 'chat', title: 'other' });

    expect(first.projectPath).toBe('/a');
    expect(second.projectPath).toBe('/a');
    expect(service.continue('/alias-a').id).toBe(second.id);
    expect(service.list('/a').map(session => session.id)).toEqual([first.id, second.id]);
  });

  it('returns typed errors for unknown and cross-project resumes', () => {
    const store = createMemoryStore();
    const service = new SessionService({ store, realpath: value => value });
    const session = service.create({
      projectPath: '/a',
      model: 'x',
      policy: 'chat',
      title: 'first'
    });

    expect(() => service.resume('missing', '/a'))
      .toThrowError(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
    expect(() => service.resume(session.id, '/b'))
      .toThrowError(expect.objectContaining({ code: 'SESSION_PROJECT_MISMATCH' }));
    expect(() => service.continue('/b'))
      .toThrowError(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
  });

  it.each(['append', 'show', 'delete', 'list'])(
    'requires a project scope for %s',
    operation => {
      const store = createMemoryStore();
      const service = new SessionService({ store, realpath: value => value });
      const session = service.create({
        projectPath: '/a',
        model: 'x',
        policy: 'chat',
        title: 'scoped'
      });
      const event = {
        type: 'status',
        timestamp: '2026-07-26T00:00:00.000Z',
        data: {}
      };
      const invoke = {
        append: () => service.append(session.id, event),
        show: () => service.show(session.id),
        delete: () => service.delete(session.id),
        list: () => service.list()
      }[operation];

      expect(invoke).toThrow(TypeError);
      expect(store.get(session.id)).toBeDefined();
      expect(store.readEvents(session.id)).toEqual([]);
    }
  );

  it.each(['append', 'show', 'delete', 'list'])(
    'validates %s project scope before reading store state',
    operation => {
      const unscopedAccess = () => {
        throw new Error('unscoped store access');
      };
      const store = {
        get: unscopedAccess,
        list: unscopedAccess,
        append: unscopedAccess,
        readEvents: unscopedAccess,
        delete: unscopedAccess
      };
      const service = new SessionService({ store, realpath: value => value });
      const event = {
        type: 'status',
        timestamp: '2026-07-26T00:00:00.000Z',
        data: {}
      };
      const invoke = {
        append: () => service.append('missing', event),
        show: () => service.show('missing'),
        delete: () => service.delete('missing'),
        list: () => service.list()
      }[operation];

      expect(invoke).toThrow(TypeError);
    }
  );

  it('appends and shows session history without exposing another project', () => {
    const store = createMemoryStore();
    const service = new SessionService({ store, realpath: value => value });
    const session = service.create({
      projectPath: '/a',
      model: 'x',
      policy: 'chat',
      title: 'history'
    });
    const event = {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: { text: 'working' }
    };

    service.append(session.id, event, '/a');

    expect(service.show(session.id, '/a')).toEqual({
      ...session,
      events: [event]
    });
    expect(() => service.show(session.id, '/b'))
      .toThrowError(expect.objectContaining({ code: 'SESSION_PROJECT_MISMATCH' }));
  });

  it('appends a compaction summary only after asynchronous summarization succeeds', async () => {
    const store = createMemoryStore();
    const service = new SessionService({
      store,
      realpath: value => value,
      now: () => new Date('2026-07-26T00:00:10.000Z')
    });
    const session = service.create({
      projectPath: '/a',
      model: 'x',
      policy: 'chat',
      title: 'compact'
    });
    const original = {
      type: 'assistant.completed',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: { text: 'original history' }
    };
    service.append(session.id, original, '/a');
    const failure = new Error('summarizer unavailable');

    await expect(service.compact(
      session.id,
      '/a',
      vi.fn().mockRejectedValue(failure)
    )).rejects.toBe(failure);
    expect(store.readEvents(session.id)).toEqual([original]);

    const summarizer = vi.fn(async () => 'Concise summary');
    const summaryEvent = await service.compact(session.id, '/a', summarizer);

    expect(summarizer).toHaveBeenCalledWith([original], session);
    expect(summaryEvent).toEqual({
      type: 'compaction.summary',
      timestamp: '2026-07-26T00:00:10.000Z',
      data: { summary: 'Concise summary' }
    });
    expect(store.readEvents(session.id)).toEqual([original, summaryEvent]);
  });

  it('preserves prior history when compaction persistence fails after summarization', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-compact-'));
    roots.push(rootDir);
    let calls = 0;
    const store = new JsonlSessionStore({
      rootDir,
      now: () => {
        calls += 1;
        if (calls > 2) throw new Error('index timestamp failed');
        return new Date(`2026-07-26T00:00:0${calls}.000Z`);
      }
    });
    const service = new SessionService({
      store,
      realpath: value => value,
      now: () => new Date('2026-07-26T00:00:10.000Z')
    });
    const session = service.create({
      projectPath: '/a',
      model: 'x',
      policy: 'chat',
      title: 'compact rollback'
    });
    const original = {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: { text: 'original' }
    };
    service.append(session.id, original, '/a');

    await expect(service.compact(
      session.id,
      '/a',
      async () => 'summary'
    )).rejects.toThrow('index timestamp failed');
    expect(store.readEvents(session.id)).toEqual([original]);
  });

  it('deletes only a session belonging to the requested canonical project', () => {
    const store = createMemoryStore();
    const service = new SessionService({ store, realpath: value => value });
    const session = service.create({
      projectPath: '/a',
      model: 'x',
      policy: 'chat',
      title: 'delete'
    });

    expect(() => service.delete(session.id, '/b'))
      .toThrowError(expect.objectContaining({ code: 'SESSION_PROJECT_MISMATCH' }));
    expect(service.resume(session.id, '/a')).toEqual(session);

    expect(service.delete(session.id, '/a')).toEqual(session);
    expect(() => service.resume(session.id, '/a'))
      .toThrowError(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
  });
});
