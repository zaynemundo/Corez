// Public Worker entrypoint. Every /api/ai request runs INLINE through the
// direct/harness path (baseWorker); multi-agent swarm routing has been
// removed. Swarmed responses were plain JSON, which a streamed client
// parsed as SSE with zero `data:` lines and reported as 'Hosted AI returned
// no streamed content.' — an honest-looking failure from a healthy service.
// Inline generation always answers with SSE (or an honest error event), so
// the client never misreads a valid response.

import baseWorker from './index.js';
import { readBoundedJson, createTaskStateStore, createRateLimiter } from './utils.js';
import { TASK_STATUS_STORE_PREFIX } from './providerChain.js';
import { handleTaskApi } from './taskApi.js';
export { GameRoom } from './gameRoom.js';

// Per-client AI request rate bound: paid provider tokens are spent on every
// /api/ai POST, so a single client must not be able to run up the bill.
const aiRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 20 });
const DIRECT_AI_ORIGINS = new Set([
  'https://corez.pro',
  'https://chat.corez.pro',
  'https://web.corez.pro'
]);

export function isApprovedDirectAiOrigin(origin) {
  if (!origin) return false;
  if (DIRECT_AI_ORIGINS.has(origin)) return true;
  // Localhost development origins (any port)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  // Cloudflare Pages deployments (*.pages.dev)
  if (/^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin)) return true;
  // GitHub Codespaces (*.app.github.dev)
  if (/^https:\/\/[a-z0-9-]+\.app\.github\.dev$/i.test(origin)) return true;
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Production http->https upgrade, gated on the client Host header:
    // wrangler dev rewrites request.url to the first route host (corez.pro)
    // even when the browser connected to localhost:8787, so gating on
    // url.hostname alone would loop every dev request through a self 301.
    const clientHost = String(request.headers.get('Host') || '').toLowerCase();
    const isLocalClient = clientHost.includes('localhost') || clientHost.includes('127.0.0.1') || clientHost.includes('::1');
    const normalizedClientHost = clientHost.replace(/:\d+$/, '');
    const isDirectAiHost = normalizedClientHost === 'chat.zayne-mayo.workers.dev'
      || url.hostname === 'chat.zayne-mayo.workers.dev';
    const requestOrigin = request.headers.get('Origin') || '';
    if (isDirectAiHost && url.pathname !== '/api/ai') {
      return new Response(JSON.stringify({ error: 'Route not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }
      });
    }
    const directAiOrigin = isDirectAiHost && url.pathname === '/api/ai'
      ? (isApprovedDirectAiOrigin(requestOrigin) ? requestOrigin : null)
      : null;
    if (isDirectAiHost && url.pathname === '/api/ai' && !directAiOrigin) {
      return new Response(JSON.stringify({ error: 'Direct AI access requires an approved CoreZ origin.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }
      });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': directAiOrigin || '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    const withDirectAiCors = (response) => {
      if (!directAiOrigin) return response;
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', directAiOrigin);
      headers.set('Vary', 'Origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    };
    if (url.protocol === 'http:' && !isLocalClient) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    const store = createTaskStateStore(env);
    const jsonHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': directAiOrigin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    };

    // Every /api/ai call spends paid provider tokens: bound the per-client
    // rate (20/min per IP) so one client cannot burn the deployment budget.
    if (url.pathname === '/api/ai' && request.method === 'POST') {
      const retryAfter = aiRateLimiter(request);
      if (retryAfter !== null) {
        return new Response(JSON.stringify({ error: 'Too many AI requests. Try again shortly.' }), {
          status: 429,
          headers: { ...jsonHeaders, 'Retry-After': String(retryAfter) }
        });
      }
    }

    // Unified harness task API (task lifecycle + SSE events) and context
    // records through the real entrypoint — same harness layer as the CLI.
    if (url.pathname.startsWith('/api/tasks') || url.pathname.startsWith('/api/context/records')) {
      const taskResponse = await handleTaskApi(request, env);
      if (taskResponse) return taskResponse;
    }

    // Retry-schedule status: GET /api/task/<taskId> tells a client when a
    // retry-scheduled AI generation becomes eligible again, so it can wait
    // precisely (instead of blind fixed sleeps) and never treats the deferred
    // 200 as a failure. The record is mirrored from providerChain under
    // task-status/<taskId> when the schedule is persisted and removed when the
    // task completes or fails permanently — a missing record means the task is
    // no longer deferred (resend to fetch the result, or it never existed).
    if (url.pathname.startsWith('/api/task/')) {
      if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: jsonHeaders });
      }
      let taskId;
      try {
        taskId = decodeURIComponent(url.pathname.slice('/api/task/'.length));
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid task id.' }), { status: 400, headers: jsonHeaders });
      }
      if (!taskId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(taskId)) {
        return new Response(JSON.stringify({ error: 'Invalid task id.' }), { status: 400, headers: jsonHeaders });
      }
      const record = await store.load(`${TASK_STATUS_STORE_PREFIX}${taskId}`);
      if (!record || record.status !== 'retry-scheduled') {
        return new Response(JSON.stringify({ taskId, status: 'not-scheduled' }), { status: 200, headers: jsonHeaders });
      }
      const retryAfterSeconds = Math.max(0, Math.ceil((Number(record.nextEligibleAt) - Date.now()) / 1000));
      return new Response(JSON.stringify({
        taskId,
        status: 'retry-scheduled',
        provider: record.provider || null,
        providerLabel: record.providerLabel || null,
        attempt: Number(record.attempt) || 0,
        nextEligibleAt: Number(record.nextEligibleAt) || 0,
        retryAfterSeconds,
        lastError: record.lastError || null
      }), { status: 200, headers: jsonHeaders });
    }

    // The /api/ai handler serves the direct route (baseWorker); the provider
    // fallback chain decides which configured provider actually answers.
    // Without ANY provider key it fails honestly. Every request runs inline:
    // creation requests take the harness, everything else the direct path.
    if (url.pathname === '/api/ai' && request.method === 'POST') {
      const baseRequest = request.clone();
      let body;
      try {
        body = await readBoundedJson(request);
      } catch {
        return withDirectAiCors(await baseWorker.fetch(baseRequest, env, ctx));
      }

      // Creation harness requests take the direct route: the harness runs
      // its own multi-phase loop.
      if (body?.harness === true) {
        return withDirectAiCors(await baseWorker.fetch(baseRequest, env, ctx));
      }

      return withDirectAiCors(await baseWorker.fetch(baseRequest, env, ctx));
    }

    return withDirectAiCors(await baseWorker.fetch(request, env, ctx));
  }
};
