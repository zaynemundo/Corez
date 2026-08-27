import { jsonResponse, readBoundedJson, safeErrorDetail } from './utils.js';
import { verifySession } from './auth.js';

// ---------------------------------------------------------------------
// Chat ID generation — short, URL-safe, unguessable
// ---------------------------------------------------------------------
const CHAT_ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
const CHAT_ID_LEN = 12;

export function generateChatId() {
  const bytes = crypto.getRandomValues(new Uint8Array(CHAT_ID_LEN));
  let id = '';
  for (let i = 0; i < CHAT_ID_LEN; i++) {
    id += CHAT_ID_CHARS[bytes[i] % CHAT_ID_CHARS.length];
  }
  return id;
}

// Valid chatId: starts alphanumeric, 8-32 chars of alnum + _ -
const VALID_CHAT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,31}$/;
const VALID_TITLE_LEN = 120;

// ---------------------------------------------------------------------
// D1 schema helpers
// ---------------------------------------------------------------------
let tablesEnsured = false;
let tablesPromise = null;
export async function ensureChatsTables(env) {
  if (!env?.DB) return;
  if (tablesEnsured) return;
  if (tablesPromise) {
    await tablesPromise;
    return;
  }
  tablesPromise = (async () => {
    try {
      // Run table creates in parallel, not 4 sequential round-trips
      await Promise.all([
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT 'New Conversation',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )`
        ).run(),
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            attachments TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
          )`
        ).run(),
      ]);
      await Promise.all([
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, updated_at DESC)`).run(),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON chat_messages(chat_id, created_at ASC)`).run(),
      ]);
      tablesEnsured = true;
    } catch (e) {
      console.warn('ensureChatsTables failed:', safeErrorDetail(e));
      // Allow retry on next request
      tablesPromise = null;
      throw e;
    }
  })();
  await tablesPromise;
}

function sanitizeTitle(title) {
  if (typeof title !== 'string') return 'New Conversation';
  const t = title.trim().slice(0, VALID_TITLE_LEN);
  return t || 'New Conversation';
}

function sanitizeContent(content) {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  return String(content);
}

// Smart compact summary builder for server-side compaction
// Mirrors src/services/contextStore.js buildContextSummary without persistence
function buildWorkerCompactSummary(messages) {
  const requirements = [];
  const negativeConstraints = [];
  const exactErrors = [];
  const decisions = [];
  const codeSignatures = [];
  const lines = [];
  for (const m of messages) {
    const text = typeof m?.content === 'string' ? m.content : '';
    lines.push(...text.split('\n'));
  }
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/(must not|do not|never|forbidden|don't|must not change|must preserve|must keep|must retain)/i.test(line)) {
      negativeConstraints.push(line.slice(0, 200));
      continue;
    }
    if (/^(requirement|must|need|require|constraint|goal|acceptance criterion)[: ]/i.test(line)) {
      requirements.push(line.slice(0, 200));
      continue;
    }
    if (/(error|exception|failed|failure|stack trace|uncaught|fatal|FAIL|syntaxerror|typeerror)/i.test(line)) {
      exactErrors.push(line.slice(0, 200));
      continue;
    }
    if (/^[-*]\s*(?:add|implement|fix|refactor|change|update|remove|migrate)\b/i.test(line)) {
      requirements.push(line.slice(0, 200));
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      const sig = lines[i + 1]?.trim().slice(0, 80);
      if (sig) codeSignatures.push(sig);
    }
  }
  const topicWords = new Map();
  const topicText = lines.join(' ').toLowerCase().slice(0, 50000);
  const words = topicText.match(/[a-z]{5,}/g) || [];
  for (const w of words) {
    if (['would','should','could','about','there','their','these','those','which','while'].includes(w)) continue;
    topicWords.set(w, (topicWords.get(w)||0)+1);
  }
  const topics = [...topicWords.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([w])=>w);
  const parts = ['[Compacted history: earlier messages summarized. Full records remain retrievable.]'];
  if (topics.length) parts.push(`Topics: ${topics.join(', ')}.`);
  if (requirements.length) parts.push(`Requirements: ${requirements.slice(0,3).join(' | ')}`);
  if (negativeConstraints.length) parts.push(`Constraints: ${negativeConstraints.slice(0,2).join(' | ')}`);
  if (exactErrors.length) parts.push(`Errors: ${exactErrors.slice(0,2).join(' | ')}`);
  if (codeSignatures.length) parts.push(`Code: ${codeSignatures.slice(0,2).join(' | ')}`);
  return { topics, parts: parts.join('\n'), requirements, negativeConstraints, exactErrors, codeSignatures };
}

function applySmartCompact(messages, url) {
  const compact = url.searchParams.get('compact') === '1' || url.searchParams.get('compact') === 'true';
  const keep = Math.min(100, Math.max(5, parseInt(url.searchParams.get('keep') || '30', 10) || 30));
  const limitParam = parseInt(url.searchParams.get('limit') || '', 10);
  const effectiveLimit = Number.isFinite(limitParam) ? Math.min(500, Math.max(1, limitParam)) : null;

  // If explicit limit without compact, just slice
  if (!compact && effectiveLimit != null && messages.length > effectiveLimit) {
    const sliced = messages.slice(-effectiveLimit);
    return { messages: sliced, meta: { limit: effectiveLimit, total: messages.length, compacted: false } };
  }
  if (!compact) return { messages, meta: null };
  // Compact: keep recent `keep`, summarize older if total > keep
  if (messages.length <= keep) return { messages, meta: null };
  const older = messages.slice(0, messages.length - keep);
  const recent = messages.slice(messages.length - keep);
  if (older.length === 0) return { messages, meta: null };
  // Only compact if older is meaningful ( >5 messages or >30KB )
  const olderBytes = JSON.stringify(older).length;
  if (older.length < 5 && olderBytes < 30_000) return { messages, meta: null };
  const summary = buildWorkerCompactSummary(older);
  const banner = {
    id: `compact-${Date.now()}`,
    role: 'system',
    content: summary.parts,
    attachments: null,
    createdAt: older[older.length-1]?.createdAt || Date.now(),
    _compactMeta: {
      isCompactSummary: true,
      compactedCount: older.length,
      topics: summary.topics,
      summaryLine: summary.topics.length ? `Topics: ${summary.topics.join(', ')}` : `${older.length} earlier messages summarized`,
      persisted: false,
    }
  };
  return {
    messages: [banner, ...recent],
    meta: { compacted: true, compactedCount: older.length, keep, total: messages.length, topics: summary.topics }
  };
}

// ---------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------
export async function handleChats(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Ensure tables
  await ensureChatsTables(env);

  if (!env?.DB) {
    return jsonResponse(500, { error: 'Chat database not configured (D1 missing).' });
  }

  // Auth required
  const session = await verifySession(request, env);
  if (!session) {
    return jsonResponse(401, { error: 'Authentication required. Please log in.' });
  }
  const userId = session.uid;

  // -------------------------------------------------------------------
  // GET /api/chats — list my chats
  // -------------------------------------------------------------------
  if (pathname === '/api/chats' && request.method === 'GET') {
    try {
      const rows = await env.DB.prepare(
        'SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100'
      ).bind(userId).all();
      const chats = (rows?.results || []).map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
      return jsonResponse(200, { chats });
    } catch (e) {
      console.error('GET /api/chats failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to list chats.' });
    }
  }

  // -------------------------------------------------------------------
  // POST /api/chats — create new chat
  // -------------------------------------------------------------------
  if (pathname === '/api/chats' && request.method === 'POST') {
    let body = {};
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }
    const title = sanitizeTitle(body?.title);
    const id = generateChatId();
    const now = Date.now();
    try {
      await env.DB.prepare('INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)')
        .bind(id, userId, title, now, now).run();

      // Optionally create first message if provided
      if (body?.firstMessage && typeof body.firstMessage === 'object') {
        const fm = body.firstMessage;
        const role = fm.role === 'assistant' ? 'assistant' : 'user';
        const content = sanitizeContent(fm.content);
        const attachments = fm.attachments ? JSON.stringify(fm.attachments) : null;
        const msgId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO chat_messages (id, chat_id, user_id, role, content, attachments, created_at) VALUES (?,?,?,?,?,?,?)')
          .bind(msgId, id, userId, role, content, attachments, now).run();
      }

      return jsonResponse(201, { id, title, createdAt: now, updatedAt: now });
    } catch (e) {
      console.error('POST /api/chats failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to create chat.' });
    }
  }

  // -------------------------------------------------------------------
  // DELETE /api/chats — delete ALL my chats (clear history)
  // -------------------------------------------------------------------
  if (pathname === '/api/chats' && request.method === 'DELETE') {
    try {
      // Delete messages first
      await env.DB.prepare('DELETE FROM chat_messages WHERE user_id = ?').bind(userId).run();
      await env.DB.prepare('DELETE FROM chats WHERE user_id = ?').bind(userId).run();

      // Also best-effort: delete R2 apps for all chats? We can't list them efficiently
      // without knowing chat ids, but after DB deletes we can try to clean via R2 listing
      // of apps/ prefix? For now frontend also calls /api/apps per session; this is enough.
      // Optionally delete R2 apps/* per user if we stored user-indexed? Skipped.

      // Bulk delete R2 apps for deleted chats: we don't know ids now, but we can
      // leave orphaned apps — they are unreachable without chat id. Optionally sweep
      // via R2? For correctness, try to delete all apps/ keys if bucket exists and user
      // had many chats — list all and check ownership via DB already deleted, so
      // can't know. Keep as is.

      return jsonResponse(200, { success: true });
    } catch (e) {
      console.error('DELETE /api/chats failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to delete chats.' });
    }
  }

  // -------------------------------------------------------------------
  // Routes with :chatId
  // -------------------------------------------------------------------
  // Match /api/chats/:chatId and /api/chats/:chatId/messages
  const chatIdMatch = pathname.match(/^\/api\/chats\/([^/]+)(\/messages)?$/);
  if (!chatIdMatch) {
    return jsonResponse(404, { error: 'Chat route not found.' });
  }
  const rawChatId = decodeURIComponent(chatIdMatch[1] || '');
  const isMessagesSubroute = Boolean(chatIdMatch[2]);

  if (!VALID_CHAT_ID.test(rawChatId)) {
    return jsonResponse(400, { error: 'Invalid chat id.' });
  }
  const chatId = rawChatId;

  // Verify ownership
  let chatRow;
  try {
    chatRow = await env.DB.prepare('SELECT id, title, user_id, created_at, updated_at FROM chats WHERE id = ?').bind(chatId).first();
  } catch (e) {
    console.error('Chat lookup failed:', safeErrorDetail(e));
    return jsonResponse(500, { error: 'Failed to lookup chat.' });
  }
  if (!chatRow) {
    return jsonResponse(404, { error: 'Chat not found.' });
  }
  if (chatRow.user_id !== userId) {
    return jsonResponse(403, { error: 'Not authorized for this chat.' });
  }

  // -------------------------------------------------------------------
  // GET /api/chats/:id — fetch single chat with messages (supports ?limit=&compact=&keep=)
  // -------------------------------------------------------------------
  if (!isMessagesSubroute && request.method === 'GET') {
    try {
      const msgRows = await env.DB.prepare('SELECT id, role, content, attachments, created_at as createdAt FROM chat_messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 500')
        .bind(chatId, userId).all();
      let messages = (msgRows?.results || []).map((r) => {
        let attachments = null;
        if (r.attachments) {
          try { attachments = JSON.parse(r.attachments); } catch { attachments = null; }
        }
        return {
          id: r.id,
          role: r.role,
          content: r.content,
          attachments,
          createdAt: r.createdAt,
        };
      });
      const compacted = applySmartCompact(messages, url);
      messages = compacted.messages;
      const headers = {};
      if (compacted.meta) headers['X-Corez-Compact'] = JSON.stringify(compacted.meta);
      return jsonResponse(200, {
        id: chatRow.id,
        title: chatRow.title,
        createdAt: chatRow.created_at,
        updatedAt: chatRow.updated_at,
        messages,
        ...(compacted.meta ? { compactMeta: compacted.meta } : {}),
      }, headers);
    } catch (e) {
      console.error('GET /api/chats/:id failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to fetch chat.' });
    }
  }

  // -------------------------------------------------------------------
  // PATCH /api/chats/:id — update title
  // DELETE /api/chats/:id — delete chat
  // PUT /api/chats/:id — bulk sync (title + messages) for migration
  // -------------------------------------------------------------------
  if (!isMessagesSubroute && request.method === 'PATCH') {
    let body = {};
    try { body = await readBoundedJson(request); } catch { return jsonResponse(400, { error: 'Invalid JSON.' }); }
    const newTitle = sanitizeTitle(body?.title);
    const now = Date.now();
    try {
      await env.DB.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(newTitle, now, chatId, userId).run();
      return jsonResponse(200, { id: chatId, title: newTitle, updatedAt: now });
    } catch (e) {
      console.error('PATCH /api/chats/:id failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to update chat.' });
    }
  }

  if (!isMessagesSubroute && request.method === 'PUT') {
    // Bulk sync: replace messages (for migration / full sync)
    let body = {};
    try { body = await readBoundedJson(request); } catch { return jsonResponse(400, { error: 'Invalid JSON.' }); }
    const newTitle = body?.title != null ? sanitizeTitle(body.title) : null;
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : null;
    const now = Date.now();
    try {
      if (newTitle != null) {
        await env.DB.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
          .bind(newTitle, now, chatId, userId).run();
      } else {
        await env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?')
          .bind(now, chatId, userId).run();
      }
      if (incomingMessages) {
        // Replace all messages
        await env.DB.prepare('DELETE FROM chat_messages WHERE chat_id = ? AND user_id = ?').bind(chatId, userId).run();
        for (let i = 0; i < incomingMessages.length; i++) {
          const m = incomingMessages[i];
          const role = m.role === 'assistant' ? 'assistant' : 'user';
          const content = sanitizeContent(m.content);
          const attachments = m.attachments ? JSON.stringify(m.attachments) : null;
          const createdAt = Number(m.createdAt) || now + i;
          const msgId = m.id && typeof m.id === 'string' ? m.id : crypto.randomUUID();
          await env.DB.prepare('INSERT INTO chat_messages (id, chat_id, user_id, role, content, attachments, created_at) VALUES (?,?,?,?,?,?,?)')
            .bind(msgId, chatId, userId, role, content, attachments, createdAt).run();
        }
      }
      return jsonResponse(200, { id: chatId, title: newTitle || chatRow.title, updatedAt: now });
    } catch (e) {
      console.error('PUT /api/chats/:id failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to sync chat.' });
    }
  }

  if (!isMessagesSubroute && request.method === 'DELETE') {
    try {
      await env.DB.prepare('DELETE FROM chat_messages WHERE chat_id = ? AND user_id = ?').bind(chatId, userId).run();
      await env.DB.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').bind(chatId, userId).run();
      // Best-effort R2 cleanup for this chat's apps
      if (env?.ASSET_BUCKET) {
        try {
          const list = await env.ASSET_BUCKET.list({ prefix: `apps/${chatId}/` });
          if (list?.objects) {
            for (const obj of list.objects) {
              await env.ASSET_BUCKET.delete(obj.key);
            }
          }
        } catch {}
      }
      return jsonResponse(200, { success: true, id: chatId });
    } catch (e) {
      console.error('DELETE /api/chats/:id failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to delete chat.' });
    }
  }

  // -------------------------------------------------------------------
  // POST /api/chats/:id/messages — append single message
  // -------------------------------------------------------------------
  if (isMessagesSubroute && request.method === 'POST') {
    let body = {};
    try { body = await readBoundedJson(request); } catch { return jsonResponse(400, { error: 'Invalid JSON.' }); }
    const role = body?.role === 'assistant' ? 'assistant' : body?.role === 'system' ? 'system' : 'user';
    const content = sanitizeContent(body?.content);
    if (!content && !body?.attachments) {
      return jsonResponse(400, { error: 'Message content or attachments required.' });
    }
    const attachments = body?.attachments ? JSON.stringify(body.attachments) : null;
    const now = Date.now();
    const msgId = crypto.randomUUID();
    try {
      await env.DB.prepare('INSERT INTO chat_messages (id, chat_id, user_id, role, content, attachments, created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(msgId, chatId, userId, role, content, attachments, now).run();
      await env.DB.prepare('UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?')
        .bind(now, chatId, userId).run();
      return jsonResponse(201, { id: msgId, chatId, role, content, attachments: body?.attachments || null, createdAt: now });
    } catch (e) {
      console.error('POST /api/chats/:id/messages failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to append message.' });
    }
  }

  // -------------------------------------------------------------------
  // GET /api/chats/:id/messages — list messages (alternative, supports ?limit=&compact=&keep=)
  // -------------------------------------------------------------------
  if (isMessagesSubroute && request.method === 'GET') {
    try {
      const msgRows = await env.DB.prepare('SELECT id, role, content, attachments, created_at as createdAt FROM chat_messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 500')
        .bind(chatId, userId).all();
      let messages = (msgRows?.results || []).map((r) => {
        let attachments = null;
        if (r.attachments) {
          try { attachments = JSON.parse(r.attachments); } catch { attachments = null; }
        }
        return {
          id: r.id,
          role: r.role,
          content: r.content,
          attachments,
          createdAt: r.createdAt,
        };
      });
      const compacted = applySmartCompact(messages, url);
      messages = compacted.messages;
      const headers = {};
      if (compacted.meta) headers['X-Corez-Compact'] = JSON.stringify(compacted.meta);
      return jsonResponse(200, { chatId, messages, ...(compacted.meta ? { compactMeta: compacted.meta } : {}) }, headers);
    } catch (e) {
      console.error('GET /api/chats/:id/messages failed:', safeErrorDetail(e));
      return jsonResponse(500, { error: 'Failed to fetch messages.' });
    }
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}
