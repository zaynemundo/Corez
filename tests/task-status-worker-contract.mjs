// Contract test: GET /api/task/<taskId> reports when a retry-scheduled AI
// generation becomes eligible again, and honestly reports when no schedule
// is persisted. The record is mirrored by providerChain under
// task-status/<taskId> (R2 key corez-tasks/task-status_<taskId>.json).
import assert from 'node:assert/strict';
import worker from '../worker/swarm-index.js';
import { createTaskStateStore } from '../worker/utils.js';

function bucketEnv(seedRecords = {}) {
  const store = new Map();
  for (const [key, record] of Object.entries(seedRecords)) {
    store.set(key, JSON.stringify(record));
  }
  const bucket = {
    put: async (key, value) => { store.set(key, value); },
    get: async (key) => (store.has(key) ? { text: async () => store.get(key) } : null),
    delete: async (key) => { store.delete(key); },
    list: async () => ({ objects: [] })
  };
  return { env: { ASSET_BUCKET: bucket }, store };
}

function getTaskStatus(taskId, env) {
  return worker.fetch(new Request(`https://corez.test/api/task/${encodeURIComponent(taskId)}`), env);
}

const TASK_ID = 'rt-1a2b3c4d';

async function run() {
  // Invalid or empty task ids are rejected before any storage access.
  assert.equal((await getTaskStatus('', {})).status, 400);
  assert.equal((await getTaskStatus('bad/id!!', {})).status, 400);
  assert.equal((await getTaskStatus('x'.repeat(201), {})).status, 400);

  // POST is not allowed on the status endpoint.
  const methodResponse = await worker.fetch(
    new Request(`https://corez.test/api/task/${TASK_ID}`, { method: 'POST' }),
    {}
  );
  assert.equal(methodResponse.status, 405);

  // A task with no persisted schedule reports not-scheduled (200): the client
  // re-issues the original request, which is the only way to fetch a result.
  const emptyEnv = bucketEnv().env;
  const notScheduled = await getTaskStatus(TASK_ID, emptyEnv);
  assert.equal(notScheduled.status, 200);
  const notScheduledData = await notScheduled.json();
  assert.equal(notScheduledData.taskId, TASK_ID);
  assert.equal(notScheduledData.status, 'not-scheduled');

  // A retry-scheduled record with a future eligibility time reports the exact
  // wait so the client can sleep precisely instead of blind-guessing.
  const futureEligible = Date.now() + 60_000;
  const seededEnv = bucketEnv({
    'corez-tasks/task-status_rt-1a2b3c4d.json': {
      provider: 'opencode-go',
      providerLabel: 'OpenCode Go',
      taskId: TASK_ID,
      attempt: 2,
      nextEligibleAt: futureEligible,
      status: 'retry-scheduled',
      lastError: 'HTTP 429: rate limited',
      retryKey: 'retry/opencode-go/abcdef12'
    }
  }).env;
  const scheduled = await getTaskStatus(TASK_ID, seededEnv);
  assert.equal(scheduled.status, 200);
  const scheduledData = await scheduled.json();
  assert.equal(scheduledData.status, 'retry-scheduled');
  assert.equal(scheduledData.taskId, TASK_ID);
  assert.equal(scheduledData.provider, 'opencode-go');
  assert.equal(scheduledData.attempt, 2);
  assert.equal(scheduledData.nextEligibleAt, futureEligible);
  assert.equal(scheduledData.retryAfterSeconds, 60);
  assert.match(scheduledData.lastError, /429/);

  // Once the eligibility time has passed, the wait is reported as zero — the
  // client should re-issue the request immediately to resume the task.
  const pastEnv = bucketEnv({
    'corez-tasks/task-status_rt-1a2b3c4d.json': {
      provider: 'deepseek',
      providerLabel: 'DeepSeek',
      taskId: TASK_ID,
      attempt: 1,
      nextEligibleAt: Date.now() - 5_000,
      status: 'retry-scheduled',
      lastError: 'HTTP 503: gateway timeout',
      retryKey: 'retry/deepseek/abcdef12'
    }
  }).env;
  const ready = await getTaskStatus(TASK_ID, pastEnv);
  assert.equal(ready.status, 200);
  const readyData = await ready.json();
  assert.equal(readyData.status, 'retry-scheduled');
  assert.equal(readyData.retryAfterSeconds, 0);

  // A record that exists but is no longer retry-scheduled (e.g. a corrupted
  // or terminal write) is reported as not-scheduled, never as an error.
  const terminalEnv = bucketEnv({
    'corez-tasks/task-status_rt-1a2b3c4d.json': { status: 'done', taskId: TASK_ID }
  }).env;
  const terminal = await getTaskStatus(TASK_ID, terminalEnv);
  assert.equal(terminal.status, 200);
  assert.equal((await terminal.json()).status, 'not-scheduled');

  // Round-trip through the real store layer: saving through
  // createTaskStateStore and reading back through the endpoint agrees.
  const { env, store } = bucketEnv();
  const stateStore = createTaskStateStore(env);
  await stateStore.save('task-status/rt-9999aaaa', {
    provider: 'opencode-go',
    providerLabel: 'OpenCode Go',
    taskId: 'rt-9999aaaa',
    attempt: 3,
    nextEligibleAt: Date.now() + 120_000,
    status: 'retry-scheduled',
    lastError: 'network error',
    retryKey: 'retry/opencode-go/9999aaaa'
  });
  const roundTrip = await getTaskStatus('rt-9999aaaa', env);
  assert.equal(roundTrip.status, 200);
  const roundTripData = await roundTrip.json();
  assert.equal(roundTripData.status, 'retry-scheduled');
  assert.equal(roundTripData.attempt, 3);
  assert.equal(roundTripData.retryAfterSeconds, 120);
  assert.ok(store.has('corez-tasks/task-status_rt-9999aaaa.json'));
}

run()
  .then(() => {
    console.log('task-status-worker-contract.mjs: PASS');
    process.exit(0);
  })
  .catch((err) => {
    console.error('task-status-worker-contract.mjs: FAIL');
    console.error(err);
    process.exit(1);
  });
