// Project folders over the real worker entrypoint and a real SQLite D1
// (node:sqlite through tests/helpers/sqliteD1.js).
//
// The rules pinned here are the ones the sidebar depends on:
//  - a project is private to its owner, on every route;
//  - a chat sits in at most one project and the link is visible on the chat
//    list (that is what groups the sidebar);
//  - deleting a project never deletes a chat — the chats fall back to the
//    ungrouped list;
//  - the schema bootstraps from the request path, not from an out-of-band
//    command.
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/entry.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'test-secret-projects';
const BASE = 'https://corez.test';

async function cookieFor(uid) {
  const token = await createJWT(
    { uid, email: `${uid}@test.dev`, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET,
  );
  return `${SESSION_COOKIE}=${token}`;
}

async function seedUsers(db, ids) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT,
        provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL,
        plan TEXT DEFAULT 'free', password_changed_at INTEGER DEFAULT 0
      )`,
    )
    .run();
  for (const id of ids) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?,?,?)',
      )
      .bind(id, `${id}@test.dev`, Date.now())
      .run();
  }
}

describe('project folders API', () => {
  let db;
  let env;
  let aliceCookie;
  let bobCookie;

  beforeEach(async () => {
    db = createSqliteD1();
    env = { AUTH_SECRET: SECRET, DB: db, ENVIRONMENT: 'development' };
    await seedUsers(db, ['alice', 'bob']);
    aliceCookie = await cookieFor('alice');
    bobCookie = await cookieFor('bob');
  });

  const call = (path, { method = 'GET', cookie = null, body = null } = {}) =>
    worker.fetch(
      new Request(BASE + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );

  const createProject = async (name, cookie = aliceCookie) => {
    const res = await call('/api/projects', {
      method: 'POST',
      cookie,
      body: { name },
    });
    expect(res.status).toBe(201);
    return await res.json();
  };

  const createChat = async (title, cookie = aliceCookie) => {
    const res = await call('/api/chats', {
      method: 'POST',
      cookie,
      body: { title },
    });
    expect(res.status).toBe(201);
    return await res.json();
  };

  it('requires a session', async () => {
    const res = await call('/api/projects');
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/log in/i);
  });

  it('creates, lists and renames a project for the signed-in account', async () => {
    const created = await createProject('Marketing site');
    expect(created.id).toMatch(/^[a-z0-9]{12}$/);
    expect(created.name).toBe('Marketing site');

    const list = await call('/api/projects', { cookie: aliceCookie });
    expect(list.status).toBe(200);
    expect((await list.json()).projects).toEqual([
      expect.objectContaining({ id: created.id, name: 'Marketing site' }),
    ]);

    const renamed = await call(`/api/projects/${created.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { name: '  Launch   site  ' },
    });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).name).toBe('Launch site');
  });

  it('defaults an unnamed project and rejects an empty rename', async () => {
    const created = await createProject('   ');
    expect(created.name).toBe('New Project');

    const empty = await call(`/api/projects/${created.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { name: '   ' },
    });
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toMatch(/name is required/i);
  });

  it('never exposes or mutates another account’s project', async () => {
    const created = await createProject('Alice private');

    const bobList = await call('/api/projects', { cookie: bobCookie });
    expect((await bobList.json()).projects).toEqual([]);

    const bobRename = await call(`/api/projects/${created.id}`, {
      method: 'PATCH',
      cookie: bobCookie,
      body: { name: 'Hijacked' },
    });
    expect(bobRename.status).toBe(404);

    const bobDelete = await call(`/api/projects/${created.id}`, {
      method: 'DELETE',
      cookie: bobCookie,
    });
    expect(bobDelete.status).toBe(404);

    // Alice's project is untouched.
    const aliceList = await call('/api/projects', { cookie: aliceCookie });
    expect((await aliceList.json()).projects[0].name).toBe('Alice private');
  });

  it('moves a chat into a project, reports it on the chat list, and releases it', async () => {
    const project = await createProject('Game builds');
    const chat = await createChat('Platformer');

    const moved = await call(`/api/projects/${project.id}/chats`, {
      method: 'PUT',
      cookie: aliceCookie,
      body: { chatId: chat.id },
    });
    expect(moved.status).toBe(200);

    const list = await call('/api/chats', { cookie: aliceCookie });
    const listed = (await list.json()).chats.find((c) => c.id === chat.id);
    expect(listed.projectId).toBe(project.id);

    // A single chat read carries the same grouping (used when a chat is
    // deep-linked before the list has loaded).
    const single = await call(`/api/chats/${chat.id}`, { cookie: aliceCookie });
    expect((await single.json()).projectId).toBe(project.id);

    const removed = await call(
      `/api/projects/${project.id}/chats/${chat.id}`,
      { method: 'DELETE', cookie: aliceCookie },
    );
    expect(removed.status).toBe(200);
    const after = await call('/api/chats', { cookie: aliceCookie });
    expect(
      (await after.json()).chats.find((c) => c.id === chat.id).projectId,
    ).toBe(null);
  });

  it('keeps a chat in one project: moving it into a second project relocates it', async () => {
    const first = await createProject('First');
    const second = await createProject('Second');
    const chat = await createChat('Only once');

    for (const project of [first, second]) {
      const res = await call(`/api/projects/${project.id}/chats`, {
        method: 'PUT',
        cookie: aliceCookie,
        body: { chatId: chat.id },
      });
      expect(res.status).toBe(200);
    }

    const rows = await db
      .prepare('SELECT project_id FROM chats WHERE id = ?')
      .bind(chat.id)
      .all();
    expect(rows.results).toEqual([{ project_id: second.id }]);
  });

  it('deletes a project without deleting its chats', async () => {
    const project = await createProject('Temporary');
    const chat = await createChat('Keep me');
    await call(`/api/projects/${project.id}/chats`, {
      method: 'PUT',
      cookie: aliceCookie,
      body: { chatId: chat.id },
    });

    const deleted = await call(`/api/projects/${project.id}`, {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(deleted.status).toBe(200);

    const projects = await call('/api/projects', { cookie: aliceCookie });
    expect((await projects.json()).projects).toEqual([]);

    const chats = await call('/api/chats', { cookie: aliceCookie });
    const listed = (await chats.json()).chats.find((c) => c.id === chat.id);
    expect(listed).toBeTruthy();
    expect(listed.projectId).toBe(null);
  });

  it('refuses a foreign chat, an unknown id and an unsupported method', async () => {
    const project = await createProject('Mine');
    const bobChat = await createChat('Bob chat', bobCookie);

    const foreign = await call(`/api/projects/${project.id}/chats`, {
      method: 'PUT',
      cookie: aliceCookie,
      body: { chatId: bobChat.id },
    });
    expect(foreign.status).toBe(404);

    const missing = await call('/api/projects/doesnotexist1', {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(missing.status).toBe(404);

    const malformed = await call('/api/projects/short', {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(malformed.status).toBe(400);

    const wrongMethod = await call(`/api/projects/${project.id}/chats`, {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(wrongMethod.status).toBe(405);
  });

  it('requires a session for every write, not only for reads', async () => {
    const project = await createProject('Guarded');
    const chat = await createChat('Guarded chat');

    const writes = [
      ['PATCH', '/api/projects/' + project.id, { name: 'Nope' }],
      ['DELETE', '/api/projects/' + project.id, null],
      ['PUT', `/api/projects/${project.id}/chats`, { chatId: chat.id }],
      ['DELETE', `/api/projects/${project.id}/chats/${chat.id}`, null],
    ];
    for (const [method, path, body] of writes) {
      const res = await call(path, { method, body });
      expect({ method, status: res.status }).toEqual({ method, status: 401 });
    }

    // Nothing was written.
    const list = await call('/api/projects', { cookie: aliceCookie });
    expect((await list.json()).projects[0].name).toBe('Guarded');
  });

  it('rejects a move without a usable chat id', async () => {
    const project = await createProject('Validation');

    for (const body of [undefined, {}, { chatId: 42 }, { chatId: 'x' }]) {
      const res = await call(`/api/projects/${project.id}/chats`, {
        method: 'PUT',
        cookie: aliceCookie,
        body,
      });
      expect(res.status).toBe(400);
    }
  });

  it('leaves a chat alone when a stale project tries to release it', async () => {
    const holding = await createProject('Holding');
    const stale = await createProject('Stale');
    const chat = await createChat('Filed once');
    await call(`/api/projects/${holding.id}/chats`, {
      method: 'PUT',
      cookie: aliceCookie,
      body: { chatId: chat.id },
    });

    // A second tab that still thinks the chat lives elsewhere must not pull it
    // out of the folder that actually holds it.
    const released = await call(`/api/projects/${stale.id}/chats/${chat.id}`, {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(released.status).toBe(200);

    const rows = await db
      .prepare('SELECT project_id FROM chats WHERE id = ?')
      .bind(chat.id)
      .all();
    expect(rows.results).toEqual([{ project_id: holding.id }]);
  });

  it('touches the project a chat moved into, so it sorts first', async () => {
    const older = await createProject('Older');
    await new Promise((resolve) => setTimeout(resolve, 2));
    const newer = await createProject('Newer');
    const chat = await createChat('Recency');

    await call(`/api/projects/${older.id}/chats`, {
      method: 'PUT',
      cookie: aliceCookie,
      body: { chatId: chat.id },
    });

    const list = await call('/api/projects', { cookie: aliceCookie });
    expect((await list.json()).projects.map((p) => p.id)).toEqual([
      older.id,
      newer.id,
    ]);
  });

  it('clears folders with the history they organise', async () => {
    const project = await createProject('Wiped');
    const chat = await createChat('Gone');
    await call(`/api/projects/${project.id}/chats`, {
      method: 'PUT',
      cookie: aliceCookie,
      body: { chatId: chat.id },
    });

    const cleared = await call('/api/chats', {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(cleared.status).toBe(200);

    // An empty folder list is part of "clear all history"; Bob keeps his.
    const projects = await call('/api/projects', { cookie: aliceCookie });
    expect((await projects.json()).projects).toEqual([]);
    const chats = await call('/api/chats', { cookie: aliceCookie });
    expect((await chats.json()).chats).toEqual([]);

    await createProject('Bob folder', bobCookie);
    const bob = await call('/api/projects', { cookie: bobCookie });
    expect((await bob.json()).projects).toHaveLength(1);
  });

  it('caps how many projects one account can create', async () => {
    await createProject('One');
    for (let i = 1; i < 100; i += 1) {
      await db
        .prepare(
          'INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?,?,?,?,?)',
        )
        .bind(`fill${String(i).padStart(8, '0')}`, 'alice', `Fill ${i}`, i, i)
        .run();
    }
    const res = await call('/api/projects', {
      method: 'POST',
      cookie: aliceCookie,
      body: { name: 'One too many' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/limit/i);
  });

  it('bootstraps the schema from the request path and stays idempotent', async () => {
    // No out-of-band DDL was run for projects: the first request creates it.
    const first = await call('/api/projects', { cookie: aliceCookie });
    expect(first.status).toBe(200);
    const second = await call('/api/projects', { cookie: aliceCookie });
    expect(second.status).toBe(200);

    const columns = await db.prepare('PRAGMA table_info(chats)').all();
    expect(columns.results.map((c) => c.name)).toContain('project_id');
  });
});
