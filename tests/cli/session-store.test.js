import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonlSessionStore } from '../../packages/agent-core/index.js';

const roots = [];

afterEach(() => {
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

function createRoot() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-sessions-'));
  roots.push(rootDir);
  return rootDir;
}

function eventLogPath(rootDir, id) {
  return path.join(rootDir, `${id}.jsonl`);
}

function runNode(script, args) {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '--eval', script, ...args],
      { stdio: 'ignore' }
    );
    child.once('error', error => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

function failDirectorySyncOnce(targetCall, message) {
  const original = fs.fsyncSync.bind(fs);
  let directoryCalls = 0;
  return vi.spyOn(fs, 'fsyncSync').mockImplementation(descriptor => {
    if (fs.fstatSync(descriptor).isDirectory()) {
      directoryCalls += 1;
      if (directoryCalls === targetCall) throw new Error(message);
    }
    return original(descriptor);
  });
}

describe('JsonlSessionStore', () => {
  it('atomically indexes opaque IDs and appends one JSONL record per event', () => {
    const rootDir = createRoot();
    const timestamps = [
      '2026-07-26T00:00:00.000Z',
      '2026-07-26T00:00:01.000Z',
      '2026-07-26T00:00:02.000Z'
    ];
    const store = new JsonlSessionStore({
      rootDir,
      now: () => new Date(timestamps.shift())
    });
    const meta = store.create({
      projectPath: '/project',
      model: 'deepseek-v4-pro',
      policy: 'chat',
      title: 'Test'
    });
    const events = [
      { type: 'status', timestamp: '2026-07-26T00:00:00.000Z', data: { text: 'ok' } },
      { type: 'assistant.completed', timestamp: '2026-07-26T00:00:01.000Z', data: {} }
    ];

    events.forEach(event => store.append(meta.id, event));

    expect(meta.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(store.list()).toHaveLength(1);
    expect(store.readEvents(meta.id)).toEqual(events);
    expect(fs.readFileSync(path.join(rootDir, `${meta.id}.jsonl`), 'utf8'))
      .toBe(`${events.map(event => JSON.stringify(event)).join('\n')}\n`);
    expect(fs.existsSync(path.join(rootDir, 'index.json.tmp'))).toBe(false);
    expect(store.get(meta.id)).toMatchObject({
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:02.000Z'
    });
  });

  it('persists only session metadata and preserves immutable creation fields on update', () => {
    const rootDir = createRoot();
    const timestamps = [
      '2026-07-26T00:00:00.000Z',
      '2026-07-26T00:00:01.000Z'
    ];
    const store = new JsonlSessionStore({
      rootDir,
      now: () => new Date(timestamps.shift())
    });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Safe',
      apiKey: 'create-secret',
      credentials: { token: 'credential-secret' },
      env: { OPENROUTER_API_KEY: 'environment-secret' }
    });

    const updated = store.update(meta.id, {
      title: 'Renamed',
      model: 'y',
      createdAt: '1999-01-01T00:00:00.000Z',
      id: 'attacker-controlled',
      apiKey: 'update-secret',
      env: process.env
    });
    const indexContents = fs.readFileSync(path.join(rootDir, 'index.json'), 'utf8');

    expect(updated).toMatchObject({
      id: meta.id,
      projectPath: '/project',
      model: 'y',
      policy: 'chat',
      title: 'Renamed',
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:01.000Z'
    });
    expect(Object.keys(updated).sort()).toEqual([
      'createdAt', 'id', 'model', 'policy', 'projectPath', 'status', 'title', 'updatedAt'
    ]);
    expect(indexContents).not.toContain('create-secret');
    expect(indexContents).not.toContain('credential-secret');
    expect(indexContents).not.toContain('environment-secret');
    expect(indexContents).not.toContain('update-secret');
  });

  it('normalizes scalar metadata and rejects nested metadata values', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });

    const meta = store.create({
      projectPath: '/project/../project',
      model: ' x ',
      policy: ' chat ',
      title: ' Safe '
    });

    expect(meta).toMatchObject({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Safe'
    });
    expect(() => store.create({
      projectPath: '/project',
      model: { id: 'x', apiKey: 'secret' },
      policy: 'chat',
      title: 'Unsafe'
    })).toThrow(TypeError);
    expect(() => store.update(meta.id, {
      title: { text: 'Unsafe', env: process.env }
    })).toThrow(TypeError);
    expect(store.get(meta.id).title).toBe('Safe');
    expect(store.list()).toHaveLength(1);
  });

  it.each([
    ['unsafe ID', records => { records[0].id = '../../outside'; }],
    ['noncanonical project', records => { records[0].projectPath = '../project'; }],
    ['nested metadata', records => { records[0].model = { token: 'secret' }; }],
    ['unknown status', records => { records[0].status = 'unknown'; }],
    ['invalid timestamp', records => { records[0].updatedAt = 'yesterday'; }],
    ['unexpected credential field', records => { records[0].credentials = { token: 'secret' }; }],
    ['duplicate ID', records => { records.push({ ...records[0] }); }]
  ])('rejects a semantically corrupt index containing %s', (_name, mutate) => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Safe'
    });
    const indexPath = path.join(rootDir, 'index.json');
    const records = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    mutate(records);
    fs.writeFileSync(indexPath, JSON.stringify(records));

    expect(() => store.list())
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
  });

  it('isolates a corrupt JSONL record without hiding healthy sessions', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    const broken = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Broken'
    });
    const healthy = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Healthy'
    });
    const healthyEvent = {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: { text: 'ok' }
    };
    store.append(healthy.id, healthyEvent);
    fs.appendFileSync(path.join(rootDir, `${broken.id}.jsonl`), '{bad json}\n');

    expect(() => store.readEvents(broken.id))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
    expect(store.readEvents(healthy.id)).toEqual([healthyEvent]);
    expect(store.list()).toHaveLength(2);
  });

  it('rejects structurally invalid CoreZ events on append and read', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Events'
    });
    const invalidEvent = {
      type: 'not-a-corez-event',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: {}
    };

    expect(() => store.append(meta.id, invalidEvent)).toThrow(TypeError);
    expect(store.readEvents(meta.id)).toEqual([]);

    fs.appendFileSync(eventLogPath(rootDir, meta.id), `${JSON.stringify(invalidEvent)}\n`);
    expect(() => store.readEvents(meta.id))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
  });

  it('does not recreate a missing event log during append', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Missing'
    });
    fs.unlinkSync(eventLogPath(rootDir, meta.id));
    const event = {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: {}
    };

    expect(() => store.readEvents(meta.id))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
    expect(() => store.append(meta.id, event))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
    expect(fs.existsSync(eventLogPath(rootDir, meta.id))).toBe(false);
    expect(store.get(meta.id)).toBeDefined();
  });

  it('rolls back an appended event when metadata timestamping fails', () => {
    const rootDir = createRoot();
    let calls = 0;
    const store = new JsonlSessionStore({
      rootDir,
      now: () => {
        calls += 1;
        if (calls > 1) throw new Error('clock unavailable');
        return new Date('2026-07-26T00:00:00.000Z');
      }
    });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Rollback'
    });
    const event = {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: {}
    };

    expect(() => store.append(meta.id, event)).toThrow('clock unavailable');
    expect(store.readEvents(meta.id)).toEqual([]);
    expect(store.get(meta.id).updatedAt).toBe('2026-07-26T00:00:00.000Z');
  });

  it('removes an orphan event log when create durability fails', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    const fsync = failDirectorySyncOnce(2, 'event directory sync failed');

    try {
      expect(() => store.create({
        projectPath: '/project',
        model: 'x',
        policy: 'chat',
        title: 'Rollback'
      })).toThrow('event directory sync failed');
    } finally {
      fsync.mockRestore();
    }

    expect(store.list()).toEqual([]);
    expect(fs.readdirSync(rootDir).some(name => name.endsWith('.jsonl'))).toBe(false);
  });

  it('rolls back an append when index directory sync fails after rename', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({
      rootDir,
      now: () => new Date('2026-07-26T00:00:00.000Z')
    });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Append rollback'
    });
    const event = {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: {}
    };
    const fsync = failDirectorySyncOnce(2, 'index directory sync failed');

    try {
      expect(() => store.append(meta.id, event)).toThrow('index directory sync failed');
    } finally {
      fsync.mockRestore();
    }
    expect(store.readEvents(meta.id)).toEqual([]);
    expect(store.get(meta.id)).toEqual(meta);
  });

  it('keeps a session indexed and retriable when its log cannot be unlinked', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Retriable'
    });
    const logPath = eventLogPath(rootDir, meta.id);
    fs.unlinkSync(logPath);
    fs.mkdirSync(logPath);

    expect(() => store.delete(meta.id)).toThrow();
    expect(store.get(meta.id)).toEqual(meta);
    expect(fs.statSync(logPath).isDirectory()).toBe(true);
  });

  it('restores the index and log when delete index durability fails after rename', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Delete rollback'
    });
    const fsync = failDirectorySyncOnce(3, 'delete index sync failed');

    try {
      expect(() => store.delete(meta.id)).toThrow('delete index sync failed');
    } finally {
      fsync.mockRestore();
    }
    expect(store.get(meta.id)).toEqual(meta);
    expect(fs.statSync(eventLogPath(rootDir, meta.id)).isFile()).toBe(true);
  });

  it('deletes both the session index entry and append-only event log', () => {
    const rootDir = createRoot();
    const store = new JsonlSessionStore({ rootDir });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Disposable'
    });
    store.append(meta.id, {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: {}
    });

    store.delete(meta.id);

    expect(store.get(meta.id)).toBeUndefined();
    expect(store.list()).toEqual([]);
    expect(fs.existsSync(path.join(rootDir, `${meta.id}.jsonl`))).toBe(false);
  });

  it('serializes parallel process creates without losing index entries', async () => {
    const rootDir = createRoot();
    const startPath = path.join(rootDir, 'start');
    const moduleUrl = new URL('../../packages/agent-core/index.js', import.meta.url).href;
    const script = `
      import fs from 'node:fs';
      import { JsonlSessionStore } from ${JSON.stringify(moduleUrl)};
      const [rootDir, startPath, title] = process.argv.slice(1);
      const wait = new Int32Array(new SharedArrayBuffer(4));
      while (!fs.existsSync(startPath)) Atomics.wait(wait, 0, 0, 5);
      new JsonlSessionStore({ rootDir }).create({
        projectPath: '/project',
        model: 'x',
        policy: 'chat',
        title
      });
    `;
    const children = Array.from({ length: 8 }, (_, index) => (
      runNode(script, [rootDir, startPath, `session-${index}`])
    ));
    fs.writeFileSync(startPath, 'go');
    const results = await Promise.all(children);

    expect(results).toEqual(Array.from({ length: 8 }, () => ({ code: 0, signal: null })));
    const sessions = new JsonlSessionStore({ rootDir }).list();
    expect(sessions).toHaveLength(8);
    expect(new Set(sessions.map(session => session.id))).toHaveProperty('size', 8);
    expect(sessions.every(session => fs.existsSync(eventLogPath(rootDir, session.id)))).toBe(true);
    expect(fs.readdirSync(rootDir).some(name => (
      name.includes('.tmp.') || name === 'index.lock'
    ))).toBe(false);
  });

  it('removes its lock file when lock acquisition fails', () => {
    const rootDir = createRoot();
    const lockPath = path.join(rootDir, 'index.lock');
    const store = new JsonlSessionStore({
      rootDir,
      lockTimeoutMs: 20
    });
    const original = fs.fsyncSync.bind(fs);
    const fsync = vi.spyOn(fs, 'fsyncSync')
      .mockImplementationOnce(() => {
        throw new Error('lock sync failed');
      })
      .mockImplementation(descriptor => original(descriptor));

    try {
      expect(() => store.create({
        projectPath: '/project',
        model: 'x',
        policy: 'chat',
        title: 'Failed lock'
      })).toThrow('lock sync failed');
    } finally {
      fsync.mockRestore();
    }

    expect(fs.existsSync(lockPath)).toBe(false);
    expect(store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Retry'
    })).toBeDefined();
  });

  it('recovers an abandoned stale writer lock', () => {
    const rootDir = createRoot();
    const lockPath = path.join(rootDir, 'index.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ token: 'abandoned', pid: 999999 }));
    const stale = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, stale, stale);
    const store = new JsonlSessionStore({
      rootDir,
      lockTimeoutMs: 100,
      staleLockMs: 10
    });

    expect(store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Recovered'
    })).toBeDefined();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('does not steal a stale-looking lock from a live writer', () => {
    const rootDir = createRoot();
    const lockPath = path.join(rootDir, 'index.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ token: 'active', pid: process.pid }));
    const stale = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, stale, stale);
    const store = new JsonlSessionStore({
      rootDir,
      lockTimeoutMs: 20,
      staleLockMs: 10
    });

    expect(() => store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Blocked'
    })).toThrow('Timed out acquiring the session store lock.');
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8'))).toMatchObject({
      token: 'active',
      pid: process.pid
    });
  });

  it('rejects a symlinked event log without touching its target', () => {
    const rootDir = createRoot();
    const outsideDir = createRoot();
    const outsidePath = path.join(outsideDir, 'outside.txt');
    fs.writeFileSync(outsidePath, 'protected');
    const store = new JsonlSessionStore({ rootDir });
    const meta = store.create({
      projectPath: '/project',
      model: 'x',
      policy: 'chat',
      title: 'Symlink'
    });
    const logPath = eventLogPath(rootDir, meta.id);
    fs.unlinkSync(logPath);
    fs.symlinkSync(outsidePath, logPath);
    const event = {
      type: 'status',
      timestamp: '2026-07-26T00:00:00.000Z',
      data: {}
    };

    expect(() => store.readEvents(meta.id))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
    expect(() => store.append(meta.id, event))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
    expect(() => store.delete(meta.id))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
    expect(fs.readFileSync(outsidePath, 'utf8')).toBe('protected');
    expect(fs.lstatSync(logPath).isSymbolicLink()).toBe(true);
  });
});
