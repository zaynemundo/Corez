// D1TaskStore contract tests.
//
// The store's whole reason to exist is atomicity, so these tests run against
// real SQLite (node:sqlite, unflagged since Node 22.13) behind a D1-shaped
// adapter: the conditional lease upsert, the ordered event inserts and the
// task upserts are exercised as actual SQL, not as a JavaScript fake.
import { describe, it, expect, beforeEach } from 'vitest';
import { D1TaskStore } from '../packages/agent-core/persistence/D1TaskStore.js';
import { TASK_STATUSES } from '../packages/agent-core/harness/TaskState.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';

function memoryBucket() {
  const store = new Map();
  return {
    store,
    async put(key, value) {
      store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async get(key) {
      return store.has(key) ? { async text() { return store.get(key); } } : null;
    }
  };
}

function makeTask(overrides = {}) {
  return {
    taskId: 'task_store_1',
    userId: 'alice',
    sessionId: 's1',
    workspaceId: null,
    status: TASK_STATUSES.RUNNING,
    prompt: 'do the thing',
    messages: [],
    currentStep: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    terminalAt: null,
    ...overrides
  };
}

describe('D1TaskStore', () => {
  let db;
  let store;
  let bucket;

  beforeEach(() => {
    db = createSqliteD1();
    bucket = memoryBucket();
    store = new D1TaskStore({ db, bucket });
  });

  it('reports unavailability without a database and never throws', async () => {
    const empty = new D1TaskStore({});
    expect(empty.available).toBe(false);
    expect(await empty.createTask(makeTask())).toBeNull();
    expect(await empty.getTask('task_store_1')).toBeNull();
    expect(await empty.updateTask('task_store_1', { status: 'completed' })).toBeNull();
    expect(await empty.appendEvent('task_store_1', { type: 'x' })).toBeNull();
    expect(await empty.listEvents('task_store_1')).toEqual([]);
    expect(await empty.listTasks()).toEqual([]);
    const lease = await empty.acquireLease('task_store_1', 'holder');
    expect(lease.acquired).toBe(true);
  });

  it('creates, updates and reads a task document through SQL upserts', async () => {
    const task = makeTask();
    const created = await store.createTask(task);
    expect(created.taskId).toBe('task_store_1');

    const restored = await store.getTask('task_store_1');
    expect(restored.prompt).toBe('do the thing');
    expect(restored.status).toBe(TASK_STATUSES.RUNNING);

    const updated = await store.updateTask('task_store_1', {
      status: TASK_STATUSES.COMPLETED,
      result: 'done',
      terminalAt: new Date().toISOString()
    });
    expect(updated.status).toBe(TASK_STATUSES.COMPLETED);
    expect((await store.getTask('task_store_1')).result).toBe('done');

    // createTask is an upsert: re-creating the same id replaces the document.
    await store.createTask(makeTask({ status: TASK_STATUSES.PENDING, prompt: 'replaced' }));
    const replaced = await store.getTask('task_store_1');
    expect(replaced.prompt).toBe('replaced');
    expect(replaced.status).toBe(TASK_STATUSES.PENDING);

    // Missing tasks update to null instead of inventing a record.
    expect(await store.updateTask('missing', { status: 'failed' })).toBeNull();
    expect(await store.getTask('missing')).toBeNull();
  });

  it('appends ordered events and replays them with sinceId', async () => {
    await store.createTask(makeTask());
    const first = await store.appendEvent('task_store_1', { type: 'task.started' });
    const second = await store.appendEvent('task_store_1', { type: 'model.requested' });
    const third = await store.appendEvent('task_store_1', { type: 'task.completed' });

    expect(second.id).toBeGreaterThan(first.id);
    expect(third.id).toBeGreaterThan(second.id);

    const all = await store.listEvents('task_store_1');
    expect(all.map((e) => e.type)).toEqual(['task.started', 'model.requested', 'task.completed']);
    expect(all.map((e) => e.id)).toEqual([first.id, second.id, third.id]);

    const replay = await store.listEvents('task_store_1', { sinceId: first.id });
    expect(replay.map((e) => e.type)).toEqual(['model.requested', 'task.completed']);

    // Events for one task never leak into another task's stream.
    await store.createTask(makeTask({ taskId: 'task_store_2' }));
    await store.appendEvent('task_store_2', { type: 'other' });
    expect((await store.listEvents('task_store_2')).map((e) => e.type)).toEqual(['other']);
    expect((await store.listEvents('task_store_1')).length).toBe(3);
  });

  it('assigns unique ids to concurrent event appends (no lost writes)', async () => {
    await store.createTask(makeTask());
    const appended = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        store.appendEvent('task_store_1', { type: 'event', index })
      )
    );
    const ids = appended.map((event) => event.id);
    expect(new Set(ids).size).toBe(25);
    const stored = await store.listEvents('task_store_1');
    expect(stored.length).toBe(25);
    // Ordered by id and every appended event is present exactly once.
    expect(stored.map((e) => e.id)).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(stored.map((e) => e.data?.index ?? e.index)).size).toBe(25);
  });

  it('leases atomically: concurrent contenders race, one wins', async () => {
    await store.createTask(makeTask());
    const contenders = Array.from({ length: 8 }, (_, index) => `holder-${index}`);
    const results = await Promise.all(
      contenders.map((holder) => store.acquireLease('task_store_1', holder, 60_000))
    );
    const winners = results.filter((result) => result.acquired);
    expect(winners.length).toBe(1);

    const winnerIndex = results.findIndex((result) => result.acquired);
    const winner = contenders[winnerIndex];
    // The same holder may re-acquire; a foreign holder cannot renew or release.
    expect((await store.acquireLease('task_store_1', winner, 60_000)).acquired).toBe(true);
    expect(await store.renewLease('task_store_1', 'someone-else', 60_000)).toBe(false);
    expect(await store.releaseLease('task_store_1', 'someone-else')).toBe(false);
    expect(await store.renewLease('task_store_1', winner, 60_000)).toBe(true);
    expect(await store.releaseLease('task_store_1', winner)).toBe(true);
    // Released: the next contender gets it.
    expect((await store.acquireLease('task_store_1', 'next', 60_000)).acquired).toBe(true);
  });

  it('lets an expired lease be acquired by another holder', async () => {
    await store.createTask(makeTask());
    expect((await store.acquireLease('task_store_1', 'first', 50)).acquired).toBe(true);
    expect((await store.acquireLease('task_store_1', 'second', 50)).acquired).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const afterExpiry = await store.acquireLease('task_store_1', 'second', 50);
    expect(afterExpiry.acquired).toBe(true);
    // The old holder no longer owns the lease.
    expect(await store.releaseLease('task_store_1', 'first')).toBe(false);
    expect(await store.releaseLease('task_store_1', 'second')).toBe(true);
  });

  it('lists tasks by owner, session and status', async () => {
    await store.createTask(makeTask({ taskId: 'a', userId: 'alice', sessionId: 's1' }));
    await store.createTask(makeTask({ taskId: 'b', userId: 'alice', sessionId: 's2', status: TASK_STATUSES.COMPLETED }));
    await store.createTask(makeTask({ taskId: 'c', userId: 'bob', sessionId: 's1' }));

    expect((await store.listTasks({ userId: 'alice' })).map((t) => t.taskId).sort()).toEqual(['a', 'b']);
    expect((await store.listTasks({ userId: 'alice', sessionId: 's2' })).map((t) => t.taskId)).toEqual(['b']);
    expect((await store.listTasks({ status: TASK_STATUSES.COMPLETED })).map((t) => t.taskId)).toEqual(['b']);
    expect((await store.listTasks({ userId: 'nobody' }))).toEqual([]);
  });

  it('keeps large session logs in R2, not in the D1 row', async () => {
    const log = { sessionId: 's1', events: [{ type: 'turn/start' }] };
    await store.createTask(makeTask({ sessionLog: log }));

    const restored = await store.getTask('task_store_1');
    expect(restored.sessionLog).toBeUndefined();

    const row = await db.prepare('SELECT doc FROM harness_tasks WHERE task_id = ?').bind('task_store_1').first();
    expect(JSON.parse(row.doc).sessionLog).toBeUndefined();
    expect([...bucket.store.keys()]).toContain('tasks/task_store_1.session.json');

    const archived = await store.getSessionLog('task_store_1');
    expect(archived).toEqual(log);

    // Updates carrying a session log refresh the R2 artifact too.
    await store.updateTask('task_store_1', { sessionLog: { sessionId: 's1', events: [] } });
    expect(await store.getSessionLog('task_store_1')).toEqual({ sessionId: 's1', events: [] });
  });

  it('creates its schema idempotently and survives a fresh store on the same binding', async () => {
    const other = new D1TaskStore({ db, bucket });
    await store.createTask(makeTask({ taskId: 'first' }));
    await other.createTask(makeTask({ taskId: 'second' }));
    expect((await store.listTasks()).map((t) => t.taskId).sort()).toEqual(['first', 'second']);
    // Re-running the schema against the same database must not throw or wipe.
    const third = new D1TaskStore({ db, bucket });
    expect(await third.getTask('first')).not.toBeNull();
  });
});
