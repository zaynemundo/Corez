import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
});
