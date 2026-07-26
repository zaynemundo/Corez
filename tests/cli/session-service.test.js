import { describe, expect, it, vi } from 'vitest';
import { SessionService } from '../../packages/agent-core/index.js';

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
