// Manual sidebar order over the real worker entrypoint and a real SQLite D1
// (node:sqlite through tests/helpers/sqliteD1.js).
//
// The rules pinned here are the ones the draggable sidebar depends on:
//  - a list (Recents, Pinned, one folder) is recency-ordered until the first
//    drag inside it; that reorder freezes only that list into manual order;
//  - new chats join the top of their list, manual or not;
//  - activity (messages, renames) keeps bubbling auto lists but never moves a
//    chat in a manual list;
//  - reordering never moves a chat between lists and never touches another
//    account's chats;
//  - a drop back into its own slot writes nothing and freezes nothing.
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker/entry.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';
import { createJWT, SESSION_COOKIE } from '../worker/auth.js';

const SECRET = 'test-secret-reorder';
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

/** Spin past the current millisecond so timestamp bumps order deterministically. */
async function tick() {
  const t = Date.now();
  while (Date.now() === t) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('manual chat order API', () => {
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

  const createChat = async (title, cookie = aliceCookie) => {
    await tick();
    const res = await call('/api/chats', {
      method: 'POST',
      cookie,
      body: { title },
    });
    expect(res.status).toBe(201);
    return await res.json();
  };

  const createProject = async (name, cookie = aliceCookie) => {
    const res = await call('/api/projects', {
      method: 'POST',
      cookie,
      body: { name },
    });
    expect(res.status).toBe(201);
    return await res.json();
  };

  const moveChat = async (projectId, chatId, cookie = aliceCookie) => {
    const res = await call(`/api/projects/${projectId}/chats`, {
      method: 'PUT',
      cookie,
      body: { chatId },
    });
    expect(res.status).toBe(200);
    return await res.json();
  };

  const pinChat = async (chatId, pinned, cookie = aliceCookie) => {
    await tick();
    const res = await call(`/api/chats/${chatId}`, {
      method: 'PATCH',
      cookie,
      body: { pinned },
    });
    expect(res.status).toBe(200);
    return await res.json();
  };

  const reorder = async (chatId, placement, cookie = aliceCookie) =>
    call('/api/chats/reorder', { method: 'POST', cookie, body: { chatId, ...placement } });

  const listState = async (cookie = aliceCookie) => {
    const res = await call('/api/chats', { cookie });
    expect(res.status).toBe(200);
    return await res.json();
  };

  /** Display order of one list, the way the sidebar computes it. */
  const displayOrder = (state, listKey) => {
    const manual = state.manualLists.includes(listKey);
    const members = state.chats.filter((c) => {
      if (c.pinnedAt) return listKey === 'pinned';
      if (c.projectId) return listKey === `project:${c.projectId}`;
      return listKey === 'recents';
    });
    const key = (c) =>
      manual
        ? (c.sortOrder ?? Number.NEGATIVE_INFINITY)
        : listKey === 'pinned'
          ? (c.pinnedAt ?? 0)
          : (c.updatedAt ?? 0);
    return members
      .sort((a, b) => key(b) - key(a) || (a.id < b.id ? -1 : 1))
      .map((c) => c.id);
  };

  it('reorders within Recents and freezes only that list into manual order', async () => {
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    const c = await createChat('Gamma');

    const moved = await reorder(a.id, { beforeId: c.id });
    expect(moved.status).toBe(200);
    const movedBody = await moved.json();
    expect(movedBody).toEqual(
      expect.objectContaining({ id: a.id, list: 'recents', manual: true }),
    );
    expect(typeof movedBody.sortOrder).toBe('number');

    const state = await listState();
    expect(state.manualLists).toEqual(['recents']);
    expect(displayOrder(state, 'recents')).toEqual([a.id, c.id, b.id]);
    // Every member carries an explicit position now.
    for (const id of [a.id, b.id, c.id]) {
      expect(
        state.chats.find((chat) => chat.id === id).sortOrder,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps activity bubbling auto lists but never moves manual ones', async () => {
    const x = await createChat('Xray');
    await tick();
    const y = await createChat('Yankee');

    // Control: in an auto list a new message bubbles the chat to the top.
    await tick();
    const posted = await call(`/api/chats/${x.id}/messages`, {
      method: 'POST',
      cookie: aliceCookie,
      body: { role: 'user', content: 'hello' },
    });
    expect(posted.status).toBe(201);
    expect((await listState()).chats.map((c) => c.id)).toEqual([x.id, y.id]);

    // Freeze Recents, then stir the middle chat: the order must not move.
    await reorder(x.id, { afterId: y.id });
    expect((await listState()).manualLists).toEqual(['recents']);
    await tick();
    await call(`/api/chats/${y.id}/messages`, {
      method: 'POST',
      cookie: aliceCookie,
      body: { role: 'user', content: 'bump' },
    });
    const frozen = await listState();
    expect(displayOrder(frozen, 'recents')).toEqual([y.id, x.id]);

    // Renames do not move manual lists either (they still bump updated_at,
    // which is why the auto control above works — same mechanism).
    await tick();
    await call(`/api/chats/${y.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { title: 'Yankee II' },
    });
    expect(displayOrder(await listState(), 'recents')).toEqual([y.id, x.id]);
  });

  it('lands a new chat on top of a manual list', async () => {
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    await reorder(a.id, { beforeId: b.id });

    const d = await createChat('Delta');
    const state = await listState();
    expect(displayOrder(state, 'recents')[0]).toBe(d.id);
    expect(d.sortOrder).toBeGreaterThan(0);
  });

  it('reorders within a folder and within Pinned independently', async () => {
    const p = await createProject('Workshop');
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    await moveChat(p.id, a.id);
    await moveChat(p.id, b.id);
    // Force folder recency deterministically: B was filed last but A was
    // touched last, so A leads until arranged.
    await tick();
    await call(`/api/chats/${a.id}`, {
      method: 'PATCH',
      cookie: aliceCookie,
      body: { title: 'Alpha II' },
    });

    const folderFirst = await reorder(b.id, { beforeId: a.id });
    expect((await folderFirst.json()).list).toBe(`project:${p.id}`);
    let state = await listState();
    expect(state.manualLists).toEqual([`project:${p.id}`]);
    expect(displayOrder(state, `project:${p.id}`)).toEqual([b.id, a.id]);
    // Recents is untouched and still automatic.
    expect(state.manualLists).not.toContain('recents');

    const c = await createChat('Gamma');
    const d = await createChat('Delta');
    await pinChat(d.id, true);
    // Pin C after D so C leads deterministically.
    await pinChat(c.id, true);
    const pinnedFirst = await reorder(d.id, { beforeId: c.id });
    expect((await pinnedFirst.json()).list).toBe('pinned');
    state = await listState();
    expect(state.manualLists).toEqual(
      expect.arrayContaining(['pinned', `project:${p.id}`]),
    );
    expect(displayOrder(state, 'pinned')).toEqual([d.id, c.id]);
  });

  it('files into a manual folder on top, and pins into manual Pinned on top', async () => {
    const p = await createProject('Workshop');
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    await moveChat(p.id, a.id);
    await moveChat(p.id, b.id);
    await reorder(a.id, { beforeId: b.id });

    const e = await createChat('Echo');
    await moveChat(p.id, e.id);
    let state = await listState();
    expect(displayOrder(state, `project:${p.id}`)[0]).toBe(e.id);

    const f = await createChat('Foxtrot');
    await pinChat(f.id, true);
    // Pinned is still automatic here: the pin itself took the top by time.
    state = await listState();
    expect(state.manualLists).not.toContain('pinned');

    const g = await createChat('Golf');
    await pinChat(g.id, true);
    const pinnedTop = await reorder(f.id, { beforeId: g.id });
    expect((await pinnedTop.json()).manual).toBe(true);
    const h = await createChat('Hotel');
    await pinChat(h.id, true);
    const afterPin = await listState();
    expect(displayOrder(afterPin, 'pinned')[0]).toBe(h.id);
  });

  it('returns an unpin to the top of a manual home list', async () => {
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    await reorder(a.id, { beforeId: b.id });
    await pinChat(a.id, true);

    const unpinned = await pinChat(a.id, false);
    expect(unpinned.sortOrder).toBeGreaterThan(0);
    const state = await listState();
    expect(displayOrder(state, 'recents')[0]).toBe(a.id);
  });

  it('writes nothing for a drop back into its own slot', async () => {
    const a = await createChat('Alpha');
    await tick();
    const b = await createChat('Beta');

    // B already leads; dropping B above A changes nothing.
    const noop = await reorder(b.id, { beforeId: a.id });
    expect(noop.status).toBe(200);
    expect((await noop.json()).manual).toBe(false);
    expect((await listState()).manualLists).toEqual([]);
  });

  it('rejects cross-list, unknown and foreign reorders', async () => {
    const p = await createProject('Workshop');
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    await moveChat(p.id, a.id);
    await pinChat(b.id, true);
    const foreign = await createChat('Foreign', bobCookie);

    // A Recents chat cannot reorder around a folder chat or a pinned one.
    const c = await createChat('Gamma');
    expect((await reorder(c.id, { beforeId: a.id })).status).toBe(400);
    expect((await reorder(c.id, { beforeId: b.id })).status).toBe(400);
    // ...and around nobody at all.
    expect((await reorder(c.id, {})).status).toBe(400);
    expect((await reorder(c.id, { beforeId: 'no' })).status).toBe(400);
    expect((await reorder(c.id, { beforeId: '00000000' })).status).toBe(404);
    expect((await reorder(c.id, { beforeId: c.id })).status).toBe(400);
    expect((await reorder('00000000', { beforeId: c.id })).status).toBe(404);
    expect(
      (await reorder('zzzzzzzzzzzz', { beforeId: c.id })).status,
    ).toBe(404);
    // Another account's chats are invisible, neighbours included.
    expect((await reorder(foreign.id, { beforeId: c.id })).status).toBe(404);
    expect((await reorder(c.id, { beforeId: foreign.id })).status).toBe(404);
    // Nothing above froze anything.
    expect((await listState()).manualLists).toEqual([]);
  });

  it('forgets a deleted folder’s manual flag, and clear-all forgets everything', async () => {
    const p = await createProject('Workshop');
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    await moveChat(p.id, a.id);
    await moveChat(p.id, b.id);
    await reorder(a.id, { beforeId: b.id });
    expect((await listState()).manualLists).toEqual([`project:${p.id}`]);

    const deleted = await call(`/api/projects/${p.id}`, {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(deleted.status).toBe(200);
    expect((await listState()).manualLists).toEqual([]);

    await reorder(a.id, { beforeId: b.id });
    expect((await listState()).manualLists).toEqual(['recents']);
    const wiped = await call('/api/chats', {
      method: 'DELETE',
      cookie: aliceCookie,
    });
    expect(wiped.status).toBe(200);
    expect((await listState()).manualLists).toEqual([]);
  });

  it('carries the position on the single-chat read', async () => {
    const a = await createChat('Alpha');
    const b = await createChat('Beta');
    await reorder(a.id, { beforeId: b.id });

    const single = await call(`/api/chats/${a.id}`, { cookie: aliceCookie });
    expect(single.status).toBe(200);
    expect((await single.json()).sortOrder).toBeGreaterThan(
      (
        await (
          await call(`/api/chats/${b.id}`, { cookie: aliceCookie })
        ).json()
      ).sortOrder,
    );
  });
});
