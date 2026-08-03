// CoreZ remote repository runner server.
//
// A small Node HTTP service that executes repository tasks for the website
// Worker. The Worker cannot spawn processes, so it delegates repository
// tasks here over HTTP (COREZ_REMOTE_RUNNER_URL in the Worker env). Each
// request runs the evidence-backed AgentRuntime against an allowlisted
// workspace and returns the final result.
//
// Run:
//   PORT=8788 RUNNER_TOKEN=<shared secret> ALLOWED_WORKSPACES=/path/a,/path/b \
//     node packages/cli/src/remoteRunnerServer.js
//
// Endpoint:
//   POST /tasks  { prompt, model, workspaceId }  (Authorization: Bearer <token>)
//   -> { success, response, blocked, blockedReason, cancelled } | { error }

import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { AgentRuntime } from '../../agent-core/index.js';

const PORT = Number(process.env.PORT || 8788);
const TOKEN = process.env.RUNNER_TOKEN || null;
const ALLOWED_WORKSPACES = (process.env.ALLOWED_WORKSPACES || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    try {
      return fs.realpathSync(entry);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 256 * 1024) {
        reject(new Error('Request body too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    request.on('error', reject);
  });
}

function resolveWorkspace(requested) {
  if (!requested || typeof requested !== 'string') return null;
  let real;
  try {
    real = fs.realpathSync(requested);
  } catch {
    return null;
  }
  return ALLOWED_WORKSPACES.includes(real) ? real : null;
}

export function createRemoteRunnerServer(options = {}) {
  const port = options.port ?? PORT;
  const allowedWorkspaces = options.allowedWorkspaces ?? ALLOWED_WORKSPACES;
  const token = options.token ?? TOKEN;
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, workspaces: allowedWorkspaces.length }));
        return;
      }

      if (request.method !== 'POST' || request.url !== '/tasks') {
        response.writeHead(405, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      if (!token || request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Unauthorized.' }));
        return;
      }

      const body = await readBody(request);
      const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'prompt is required.' }));
        return;
      }

      const workspace = resolveWorkspace(body?.workspaceId);
      if (!workspace) {
        response.writeHead(403, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          error: 'workspaceId is not in the runner allowlist (ALLOWED_WORKSPACES).'
        }));
        return;
      }

      const runtime = new AgentRuntime({ cwd: workspace });
      const controller = new AbortController();
      request.on('close', () => controller.abort());

      let result;
      try {
        result = await runtime.runTask(prompt, {
          model: typeof body?.model === 'string' ? body.model : undefined,
          signal: controller.signal,
          autoApprove: true
        });
      } catch (error) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ cancelled: true }));
          return;
        }
        throw error;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        success: result?.success === true,
        blocked: result?.blocked === true,
        blockedReason: result?.blockedReason || null,
        response: result?.response || '',
        cancelled: false
      }));
    } catch (error) {
      const message = String(error?.message || error).slice(0, 500);
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: message }));
    }
  });
  return { server, port };
}

// Start only when run directly (node packages/cli/src/remoteRunnerServer.js),
// so the module can be imported by tests without binding a port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = createRemoteRunnerServer();
  server.listen(PORT, () => {
    console.log(`CoreZ remote runner listening on :${PORT}`);
    console.log(`Allowlisted workspaces: ${ALLOWED_WORKSPACES.length > 0 ? ALLOWED_WORKSPACES.join(', ') : '(none — repository tasks will be rejected)'}`);
    if (!TOKEN) console.log('WARNING: RUNNER_TOKEN is not set — all requests will be rejected.');
  });
}
