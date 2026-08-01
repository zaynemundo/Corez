/**
 * R2-backed durable context-record endpoints.
 *
 * Routing hint (NOT wired into worker/index.js — another agent owns that
 * file). To wire these handlers, add the following to worker/index.js next to
 * the other storage routes, wrapped in runJsonSafe like the R2 handlers:
 *
 *   import { handleContextStore, handleContextGet } from './contextRecords.js';
 *
 *   if (pathname === '/api/context/records' && request.method === 'POST') {
 *     return runJsonSafe(() => handleContextStore(request, env));
 *   }
 *   if (pathname.startsWith('/api/context/records/')) {
 *     return runJsonSafe(() => handleContextGet(request, env));
 *   }
 *
 * Endpoint contract:
 *   POST /api/context/records      body { id, createdAt, messages } -> 200
 *   GET   /api/context/records/:id -> 200 record | 400 | 404
 *   DELETE /api/context/records/:id -> 200
 *
 * Records are stored under the key prefix 'context-records/<recordId>.json'.
 * The recordId must match ^ctx-[A-Za-z0-9_-]{6,64}$ (validated the same way
 * on every path: body id and URL segment). The stored shape is
 * { id, createdAt, messages } — the exact source of compacted messages,
 * retrievable verbatim.
 */

import { jsonResponse, readBoundedJson } from './utils.js';

const RECORD_ID_PATTERN = /^ctx-[A-Za-z0-9_-]{6,64}$/;
const KEY_PREFIX = 'context-records/';
const ROUTE_PREFIX = '/api/context/records/';

function isRecordId(recordId) {
  return typeof recordId === 'string' && RECORD_ID_PATTERN.test(recordId);
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export async function handleContextStore(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.put !== 'function') {
    return jsonResponse(503, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    return jsonResponse(400, { error: `Request body rejected: ${bodyErr?.message || 'Invalid JSON payload.'}` });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Invalid JSON payload.' });
  }

  const recordId = typeof body.id === 'string' ? body.id : '';
  if (!isRecordId(recordId)) {
    return jsonResponse(400, { error: 'Invalid record id: must match ^ctx-[A-Za-z0-9_-]{6,64}$.' });
  }
  if (!Array.isArray(body.messages)) {
    return jsonResponse(400, { error: 'messages must be an array.' });
  }

  const record = {
    id: recordId,
    createdAt: Number(body.createdAt) || Date.now(),
    messages: body.messages
  };
  const key = `${KEY_PREFIX}${recordId}.json`;
  await env.ASSET_BUCKET.put(key, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' }
  });

  return jsonResponse(200, { ok: true, recordId, key });
}

export async function handleContextGet(request, env) {
  if (!env?.ASSET_BUCKET || typeof env.ASSET_BUCKET.get !== 'function') {
    return jsonResponse(503, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
  }

  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(ROUTE_PREFIX)) {
    return jsonResponse(404, { error: 'Not found.' });
  }

  const recordId = decodeSegment(pathname.slice(ROUTE_PREFIX.length));
  if (!isRecordId(recordId)) {
    return jsonResponse(400, { error: 'Invalid record id: must match ^ctx-[A-Za-z0-9_-]{6,64}$.' });
  }

  const key = `${KEY_PREFIX}${recordId}.json`;

  if (request.method === 'GET') {
    const object = await env.ASSET_BUCKET.get(key);
    if (!object) {
      return jsonResponse(404, { error: 'Context record not found.' });
    }
    let record;
    try {
      record = JSON.parse(await object.text());
    } catch {
      return jsonResponse(500, { error: 'Failed to parse stored context record.' });
    }
    return jsonResponse(200, record);
  }

  if (request.method === 'DELETE') {
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { ok: true, recordId });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}
