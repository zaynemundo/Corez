# CoreZ Reliable Agent CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CoreZ CLI's simulated success paths with a real, streaming, sandboxed coding-agent runtime supporting explicit approvals and resumable sessions.

**Architecture:** Preserve the existing CLI command surface while routing all agent commands through a terminal-independent event-driven runtime. Provider, tool, approval, sandbox, session, and rendering responsibilities live behind explicit interfaces so each can be tested and replaced independently.

**Tech Stack:** Node.js 22 ESM, built-in `fetch`, Web Streams, `node:readline/promises`, `node:child_process`, JSONL session storage, Vitest 3.

## Global Constraints

- Live execution supports OpenCode Go and OpenRouter only.
- Missing credentials or provider failures must fail clearly; deterministic simulation is available only through `--mock`.
- Interactive approvals offer Allow once, Allow for session, and Deny.
- `--auto` may approve ordinary workspace-contained operations but never hard-blocked actions or workspace escapes.
- Sessions are stored under `~/.corez/sessions` and indexed by canonical project path.
- Three consecutive identical tool calls without meaningful state change terminate with `DUPLICATE_TOOL_LOOP`.
- The default overall step limit is 25.
- Human output streams plain text; `--json` emits newline-delimited structured events without ANSI or banner contamination.
- Existing commands remain recognized.
- No full-screen TUI, MCP, plugin system, additional live provider, OAuth flow, daemon, or headless server is added in this milestone.
- Every implementation task follows test-driven development and ends with its focused tests passing.
- Final completion requires `npm run test:cli`, `npm test`, `npm run lint`, and `npm run build` to exit `0`.
- The repository has no typecheck script; report that absence explicitly during final verification.

---

## File Structure

### Shared contracts and configuration

- Create `packages/agent-core/contracts/errors.js`: stable error codes, `CorezError`, and exit-code mapping.
- Create `packages/agent-core/contracts/events.js`: event constructors and event-shape validation.
- Create `packages/agent-core/policies/index.js`: immutable command policies for chat, run, plan, build, fix, and review.
- Modify `packages/agent-core/config/index.js`: user/project/env/CLI precedence and legacy permission normalization.
- Modify `packages/agent-core/index.js`: export all new public contracts.
- Modify `packages/cli/src/cli.js`: strict argument parsing and resolved run options.

### Providers

- Replace `packages/agent-core/providers/index.js`: provider catalog and provider selection only.
- Create `packages/agent-core/providers/sse.js`: provider-independent SSE decoder.
- Create `packages/agent-core/providers/openai-compatible.js`: shared streaming request and tool-call assembly.
- Create `packages/agent-core/providers/opencode-go.js`: OpenCode Go credential, endpoint, and model mapping.
- Create `packages/agent-core/providers/openrouter.js`: OpenRouter credential, endpoint, and model mapping.
- Create `packages/agent-core/providers/mock.js`: explicit deterministic scripted provider.

### Workspace tools and approvals

- Create `packages/agent-core/sandbox/index.js`: canonical workspace containment.
- Create `packages/agent-core/process/index.js`: cancellable bounded child-process execution.
- Create `packages/agent-core/tools/core-tools.js`: file, search, Git, and verification tool definitions.
- Replace `packages/agent-core/tools/index.js`: schema-valid registry and execution coordinator.
- Replace `packages/agent-core/permissions/index.js`: allow/ask/deny/blocked policy resolver.
- Create `packages/agent-core/permissions/approval-controller.js`: once/session interactive approval decisions.

### Runtime and sessions

- Replace `packages/agent-core/runtime/index.js`: event-driven state machine.
- Create `packages/agent-core/runtime/tool-loop.js`: normalized tool-call parsing and duplicate detection.
- Create `packages/agent-core/sessions/index.js`: session service public API.
- Create `packages/agent-core/sessions/jsonl-store.js`: atomic index and append-only event storage.

### CLI presentation and command migration

- Replace `packages/cli/src/ui/terminal.js`: human event renderer.
- Create `packages/cli/src/ui/json.js`: NDJSON event renderer.
- Replace `packages/cli/src/commands/chat.js`: line-oriented session shell and slash commands.
- Create `packages/cli/src/commands/session.js`: real list/show/delete behavior.
- Create `packages/cli/src/run-agent-command.js`: shared command-policy runtime entrypoint.
- Modify `packages/cli/src/commands/plan.js`, `build.js`, `fix.js`, and `review.js`: thin policy adapters.
- Modify `packages/cli/bin/corez.mjs`: turn-scoped cancellation and exit-code handling.
- Modify `packages/cli/README.md`: truthful command, safety, provider, session, JSON, and mock documentation.

---

### Task 1: Stable contracts, command policies, and configuration precedence

**Files:**

- Create: `packages/agent-core/contracts/errors.js`
- Create: `packages/agent-core/contracts/events.js`
- Create: `packages/agent-core/policies/index.js`
- Modify: `packages/agent-core/config/index.js`
- Modify: `packages/agent-core/index.js`
- Modify: `packages/cli/src/cli.js`
- Test: `tests/cli/contracts.test.js`
- Test: `tests/cli/config-precedence.test.js`
- Modify: `tests/cli/cli-args.test.js`

**Interfaces:**

- Produces: `CorezError`, `ERROR_CODES`, `exitCodeForError(error)`.
- Produces: `createEvent(type, data)`, `isCorezEvent(value)`.
- Produces: `getCommandPolicy(name)` returning a frozen `{ name, tools, requireVerification, readOnly }`.
- Produces: `loadCorezConfig(cwd, { env, cli, userConfigPath })`.
- Produces: `parseCliArgs(argv)` returning `{ flags, positional, errors }`.

- [ ] **Step 1: Write failing contract and policy tests**

```js
// tests/cli/contracts.test.js
import { describe, expect, it } from 'vitest';
import {
  CorezError,
  ERROR_CODES,
  createEvent,
  exitCodeForError,
  getCommandPolicy
} from '../../packages/agent-core/index.js';

describe('CoreZ runtime contracts', () => {
  it('maps stable failures to nonzero process codes', () => {
    const error = new CorezError(ERROR_CODES.AUTH_MISSING, 'missing key');
    expect(error.code).toBe('AUTH_MISSING');
    expect(exitCodeForError(error)).toBe(10);
  });

  it('creates timestamped structured events', () => {
    const event = createEvent('assistant.delta', { text: 'hello' });
    expect(event).toMatchObject({ type: 'assistant.delta', data: { text: 'hello' } });
    expect(new Date(event.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('makes plan and review read-only while build requires verification', () => {
    expect(getCommandPolicy('plan')).toMatchObject({ readOnly: true, requireVerification: false });
    expect(getCommandPolicy('review')).toMatchObject({ readOnly: true });
    expect(getCommandPolicy('build')).toMatchObject({ readOnly: false, requireVerification: true });
    expect(() => getCommandPolicy('missing')).toThrow('Unknown command policy');
  });
});
```

- [ ] **Step 2: Write failing configuration and CLI parsing tests**

```js
// tests/cli/config-precedence.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCorezConfig } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('CoreZ configuration precedence', () => {
  it('resolves CLI over env over project over user over defaults', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-config-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, '.corez'));
    fs.writeFileSync(path.join(root, '.corez/config.json'), JSON.stringify({ model: 'project-model' }));
    const userPath = path.join(root, 'user.json');
    fs.writeFileSync(userPath, JSON.stringify({ model: 'user-model', permissions: { shell: true } }));

    const config = loadCorezConfig(root, {
      userConfigPath: userPath,
      env: { COREZ_MODEL: 'env-model' },
      cli: { model: 'cli-model' }
    });

    expect(config.model).toBe('cli-model');
    expect(config.permissions.shell).toBe('allow');
    expect(Object.isFrozen(config)).toBe(true);
  });
});
```

```js
// append to tests/cli/cli-args.test.js
it('rejects unknown flags and missing values', () => {
  expect(parseCliArgs(['--wat']).errors[0]).toContain('Unknown option');
  expect(parseCliArgs(['--model']).errors[0]).toContain('requires a value');
});

it('parses reliability flags', () => {
  const result = parseCliArgs([
    '--model', 'openrouter/deepseek-v4-flash',
    '--auto', '--mock', '--continue', '--json', '--yes'
  ]);
  expect(result.errors).toEqual([]);
  expect(result.flags).toMatchObject({
    model: 'openrouter/deepseek-v4-flash',
    autoApprove: true,
    mock: true,
    continue: true,
    json: true,
    yes: true
  });
});

it('rejects --continue together with --session', () => {
  expect(parseCliArgs(['--continue', '--session', 'abc']).errors[0])
    .toContain('cannot be used together');
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
npx vitest run tests/cli/contracts.test.js tests/cli/config-precedence.test.js tests/cli/cli-args.test.js
```

Expected: FAIL because the contracts, policies, strict errors, and new flags do not exist.

- [ ] **Step 4: Implement the stable error and event contracts**

```js
// packages/agent-core/contracts/errors.js
export const ERROR_CODES = Object.freeze({
  USAGE_ERROR: 'USAGE_ERROR',
  AUTH_MISSING: 'AUTH_MISSING',
  MODEL_UNSUPPORTED: 'MODEL_UNSUPPORTED',
  PROVIDER_HTTP_ERROR: 'PROVIDER_HTTP_ERROR',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_RESPONSE_INVALID: 'PROVIDER_RESPONSE_INVALID',
  TOOL_ARGUMENT_INVALID: 'TOOL_ARGUMENT_INVALID',
  TOOL_APPROVAL_REQUIRED: 'TOOL_APPROVAL_REQUIRED',
  TOOL_DENIED: 'TOOL_DENIED',
  PATH_OUTSIDE_WORKSPACE: 'PATH_OUTSIDE_WORKSPACE',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',
  COMMAND_CANCELLED: 'COMMAND_CANCELLED',
  DUPLICATE_TOOL_LOOP: 'DUPLICATE_TOOL_LOOP',
  STEP_LIMIT: 'STEP_LIMIT',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_PROJECT_MISMATCH: 'SESSION_PROJECT_MISMATCH',
  SESSION_CORRUPT: 'SESSION_CORRUPT',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED'
});

const EXIT_CODES = Object.freeze({
  USAGE_ERROR: 2,
  AUTH_MISSING: 10,
  MODEL_UNSUPPORTED: 11,
  PROVIDER_HTTP_ERROR: 12,
  PROVIDER_TIMEOUT: 13,
  PROVIDER_RESPONSE_INVALID: 14,
  TOOL_ARGUMENT_INVALID: 20,
  TOOL_APPROVAL_REQUIRED: 21,
  TOOL_DENIED: 22,
  PATH_OUTSIDE_WORKSPACE: 23,
  COMMAND_TIMEOUT: 24,
  COMMAND_CANCELLED: 130,
  DUPLICATE_TOOL_LOOP: 30,
  STEP_LIMIT: 31,
  SESSION_NOT_FOUND: 40,
  SESSION_PROJECT_MISMATCH: 41,
  SESSION_CORRUPT: 42,
  VERIFICATION_FAILED: 50
});

export class CorezError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options);
    this.name = 'CorezError';
    this.code = code;
    this.details = details;
  }
}

export function exitCodeForError(error) {
  return EXIT_CODES[error?.code] || 1;
}
```

```js
// packages/agent-core/contracts/events.js
const EVENT_TYPES = new Set([
  'run.started', 'status', 'assistant.delta', 'assistant.completed',
  'tool.requested', 'approval.requested', 'approval.resolved',
  'tool.completed', 'error', 'verification.completed', 'run.completed',
  'session.list', 'session.show', 'session.deleted', 'compaction.summary'
]);

export function createEvent(type, data = {}, now = () => new Date()) {
  if (!EVENT_TYPES.has(type)) throw new TypeError(`Unknown CoreZ event type: ${type}`);
  return Object.freeze({ type, timestamp: now().toISOString(), data });
}

export function isCorezEvent(value) {
  return Boolean(value && EVENT_TYPES.has(value.type) && typeof value.timestamp === 'string');
}
```

- [ ] **Step 5: Implement policies, precedence, legacy normalization, and strict parsing**

Use these exact permission conversions in `packages/agent-core/config/index.js`:

```js
function normalizePermission(value, fallback) {
  if (value === true) return 'allow';
  if (value === false) return 'deny';
  if (['allow', 'ask', 'deny'].includes(value)) return value;
  return fallback;
}
```

Freeze the resolved top-level object and nested `permissions` object. Read user configuration from the injected `userConfigPath` or `path.join(os.homedir(), '.corez', 'config.json')`. Never mutate `process.env` in tests.

Define policies in `packages/agent-core/policies/index.js` with exact tool sets:

```js
const POLICIES = {
  chat: { tools: ['*'], readOnly: false, requireVerification: false },
  run: { tools: ['*'], readOnly: false, requireVerification: false },
  plan: {
    tools: ['read_file', 'list_directory', 'search_files', 'search_text', 'git_status', 'git_diff', 'git_log'],
    readOnly: true,
    requireVerification: false
  },
  review: {
    tools: ['read_file', 'list_directory', 'search_files', 'search_text', 'git_status', 'git_diff', 'git_log'],
    readOnly: true,
    requireVerification: false
  },
  build: { tools: ['*'], readOnly: false, requireVerification: true },
  fix: { tools: ['*'], readOnly: false, requireVerification: true }
};
```

Update `parseCliArgs` to return parsing errors rather than silently ignoring flags. Do not print inside the parser.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run tests/cli/contracts.test.js tests/cli/config-precedence.test.js tests/cli/cli-args.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add packages/agent-core/contracts packages/agent-core/policies packages/agent-core/config/index.js packages/agent-core/index.js packages/cli/src/cli.js tests/cli/contracts.test.js tests/cli/config-precedence.test.js tests/cli/cli-args.test.js
git commit -m "feat(cli): add stable runtime contracts and policies"
```

---

### Task 2: Streaming provider adapters and explicit mock mode

**Files:**

- Create: `packages/agent-core/providers/sse.js`
- Create: `packages/agent-core/providers/openai-compatible.js`
- Create: `packages/agent-core/providers/opencode-go.js`
- Create: `packages/agent-core/providers/openrouter.js`
- Create: `packages/agent-core/providers/mock.js`
- Replace: `packages/agent-core/providers/index.js`
- Modify: `packages/agent-core/index.js`
- Replace: `tests/cli/provider-router.test.js`
- Create: `tests/cli/provider-streaming.test.js`

**Interfaces:**

- Consumes: `CorezError`, `ERROR_CODES`, `createEvent`.
- Produces: `decodeSse(responseBody)`.
- Produces: `OpenAICompatibleProvider.stream(request)`.
- Produces: `MockProvider.stream(request)`.
- Produces: `ModelProviderRouter.createProvider({ model, mock })`.
- Emits: `assistant.delta`, `tool.requested`, and `assistant.completed`.

- [ ] **Step 1: Write failing provider-selection tests**

```js
// tests/cli/provider-router.test.js
import { describe, expect, it } from 'vitest';
import {
  CorezError,
  MockProvider,
  ModelProviderRouter,
  OpenCodeGoProvider,
  OpenRouterProvider
} from '../../packages/agent-core/index.js';

describe('ModelProviderRouter', () => {
  it('fails closed when a live provider credential is missing', () => {
    const router = new ModelProviderRouter({ env: {} });
    expect(() => router.createProvider({ model: 'deepseek-v4-pro' }))
      .toThrowError(expect.objectContaining({ code: 'AUTH_MISSING' }));
  });

  it('selects adapters by catalog provider', () => {
    expect(new ModelProviderRouter({ env: { OPENCODE_GO_API_KEY: 'x' } })
      .createProvider({ model: 'deepseek-v4-pro' })).toBeInstanceOf(OpenCodeGoProvider);
    expect(new ModelProviderRouter({ env: { OPENROUTER_API_KEY: 'x' } })
      .createProvider({ model: 'deepseek-v4-flash' })).toBeInstanceOf(OpenRouterProvider);
  });

  it('constructs simulation only when mock is explicit', () => {
    const router = new ModelProviderRouter({ env: {} });
    expect(router.createProvider({ model: 'deepseek-v4-pro', mock: true }))
      .toBeInstanceOf(MockProvider);
  });
});
```

- [ ] **Step 2: Write failing streaming and fragmented tool-call tests**

```js
// tests/cli/provider-streaming.test.js
import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../../packages/agent-core/index.js';

function sseResponse(lines, status = 200) {
  return new Response(lines.join('\n'), {
    status,
    headers: { 'content-type': 'text/event-stream' }
  });
}

describe('OpenAI-compatible streaming', () => {
  it('assembles text and fragmented tool arguments', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"content":"Hi "}}]}', '',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_file","arguments":"{\\"file"}}]}}]}', '',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Path\\":\\"README.md\\"}"}}]},"finish_reason":"tool_calls"}]}', '',
      'data: [DONE]', ''
    ]));
    const provider = new OpenAICompatibleProvider({
      apiKey: 'key',
      endpoint: 'https://provider.invalid/v1/chat/completions',
      fetchImpl
    });

    const events = [];
    for await (const event of provider.stream({
      model: 'provider/model',
      messages: [{ role: 'user', content: 'inspect' }],
      tools: [{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } } }]
    })) events.push(event);

    expect(events).toContainEqual(expect.objectContaining({
      type: 'assistant.delta',
      data: { text: 'Hi ' }
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'tool.requested',
      data: { id: 'c1', name: 'read_file', arguments: { filePath: 'README.md' } }
    }));
  });

  it('normalizes HTTP failures', async () => {
    const provider = new OpenAICompatibleProvider({
      apiKey: 'key',
      endpoint: 'https://provider.invalid',
      fetchImpl: async () => new Response('rate limited', { status: 429 })
    });
    await expect(async () => {
      for await (const _event of provider.stream({ model: 'x', messages: [], tools: [] })) {}
    }).rejects.toMatchObject({ code: 'PROVIDER_HTTP_ERROR', details: { status: 429 } });
  });
});
```

- [ ] **Step 3: Run provider tests and verify failure**

Run:

```bash
npx vitest run tests/cli/provider-router.test.js tests/cli/provider-streaming.test.js
```

Expected: FAIL because live adapters and the async streaming interface do not exist.

- [ ] **Step 4: Implement SSE decoding and OpenAI-compatible assembly**

`decodeSse` must:

- Accept a web `ReadableStream`.
- Decode UTF-8 across chunk boundaries with `TextDecoder`.
- Split events on blank lines.
- Join multiple `data:` lines with newline.
- Ignore comments and unknown fields.
- Stop at `[DONE]`.

`OpenAICompatibleProvider.stream` must POST this body:

```js
{
  model,
  messages,
  tools: tools.length ? tools : undefined,
  stream: true,
  temperature: 0.2
}
```

Wrap timeout cancellation in a child `AbortController` linked to the caller's signal. Assemble tool calls by `index`, concatenate argument fragments, parse JSON only when a tool call finishes, and throw `PROVIDER_RESPONSE_INVALID` when final arguments are invalid.

- [ ] **Step 5: Implement concrete providers and explicit mock provider**

Use:

```js
// packages/agent-core/providers/opencode-go.js
export class OpenCodeGoProvider extends OpenAICompatibleProvider {
  constructor({ apiKey, fetchImpl, timeoutMs }) {
    super({
      apiKey,
      fetchImpl,
      timeoutMs,
      endpoint: 'https://api.opencode.ai/v1/chat/completions'
    });
  }
}
```

```js
// packages/agent-core/providers/openrouter.js
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor({ apiKey, fetchImpl, timeoutMs }) {
    super({
      apiKey,
      fetchImpl,
      timeoutMs,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      headers: { 'HTTP-Referer': 'https://corez.app', 'X-Title': 'CoreZ CLI' }
    });
  }
}
```

`MockProvider` receives a queue of scripted turns. Each call to `stream` shifts one turn and yields its events. An exhausted script throws `PROVIDER_RESPONSE_INVALID`; it never invents success.

- [ ] **Step 6: Run provider tests**

Run:

```bash
npx vitest run tests/cli/provider-router.test.js tests/cli/provider-streaming.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add packages/agent-core/providers packages/agent-core/index.js tests/cli/provider-router.test.js tests/cli/provider-streaming.test.js
git commit -m "feat(cli): add streaming provider adapters"
```

---

### Task 3: Canonical workspace sandbox and safe process execution

**Files:**

- Create: `packages/agent-core/sandbox/index.js`
- Create: `packages/agent-core/process/index.js`
- Modify: `packages/agent-core/index.js`
- Create: `tests/cli/workspace-sandbox.test.js`
- Create: `tests/cli/process-runner.test.js`

**Interfaces:**

- Consumes: `CorezError`, `ERROR_CODES`.
- Produces: `WorkspaceSandbox.create(root)`.
- Produces: `sandbox.resolveExisting(inputPath)`.
- Produces: `sandbox.resolveForCreate(inputPath)`.
- Produces: `buildCommandEnv(source, additions)`.
- Produces: `runProcess({ file, args, cwd, env, timeoutMs, maxOutputBytes, signal })`.

- [ ] **Step 1: Write failing containment tests**

```js
// tests/cli/workspace-sandbox.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceSandbox } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('WorkspaceSandbox', () => {
  it('allows existing and new paths inside the workspace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-ws-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'inside.txt'), 'ok');
    const sandbox = WorkspaceSandbox.create(root);
    expect(sandbox.resolveExisting('inside.txt')).toBe(path.join(root, 'inside.txt'));
    expect(sandbox.resolveForCreate('src/new.js')).toBe(path.join(root, 'src/new.js'));
  });

  it.each(['../outside.txt', '/tmp/outside.txt'])('rejects an escape: %s', input => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-ws-'));
    roots.push(root);
    const sandbox = WorkspaceSandbox.create(root);
    expect(() => sandbox.resolveForCreate(input)).toThrowError(
      expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' })
    );
  });

  it('rejects symlinks that point outside the workspace', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-ws-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-out-'));
    roots.push(root, outside);
    fs.symlinkSync(outside, path.join(root, 'escape'));
    const sandbox = WorkspaceSandbox.create(root);
    expect(() => sandbox.resolveForCreate('escape/new.txt'))
      .toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));
  });
});
```

- [ ] **Step 2: Write failing process timeout, cancellation, and output-bound tests**

```js
// tests/cli/process-runner.test.js
import { describe, expect, it } from 'vitest';
import { buildCommandEnv, runProcess } from '../../packages/agent-core/index.js';

describe('runProcess', () => {
  it('returns structured output and exit code', async () => {
    const result = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stdout.write("ok")'],
      cwd: process.cwd()
    });
    expect(result).toMatchObject({ exitCode: 0, stdout: 'ok', stderr: '' });
  });

  it('bounds captured output', async () => {
    const result = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(100))'],
      cwd: process.cwd(),
      maxOutputBytes: 16
    });
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(16);
    expect(result.truncated).toBe(true);
  });

  it('throws a stable timeout error', async () => {
    await expect(runProcess({
      file: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 10
    })).rejects.toMatchObject({ code: 'COMMAND_TIMEOUT' });
  });

  it('filters credentials from child-process environments', () => {
    const env = buildCommandEnv({
      PATH: '/usr/bin',
      HOME: '/home/test',
      OPENROUTER_API_KEY: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      SAFE_VALUE: 'not-forwarded'
    });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/test' });
  });
});
```

- [ ] **Step 3: Run sandbox/process tests and verify failure**

Run:

```bash
npx vitest run tests/cli/workspace-sandbox.test.js tests/cli/process-runner.test.js
```

Expected: FAIL because neither boundary exists.

- [ ] **Step 4: Implement canonical containment**

`WorkspaceSandbox.create(root)` must canonicalize an existing workspace through `fs.realpathSync.native`. Use this containment predicate, including the separator boundary:

```js
function isWithin(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}
```

For a missing target, walk parents upward until an existing path is found, canonicalize that parent, verify containment, then append the unresolved path segments. Reject an existing symlink target outside the root.

- [ ] **Step 5: Implement cancellable bounded processes**

Use `spawn(file, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })`. Maintain separate bounded stdout/stderr buffers, kill the child on timeout or abort, remove listeners on settlement, and map:

- timeout to `COMMAND_TIMEOUT`;
- caller abort to `COMMAND_CANCELLED`;
- ordinary nonzero processes to a resolved result with their exit code.

`buildCommandEnv` starts from an allowlist of `PATH`, `HOME`, `USERPROFILE`, `TMPDIR`, `TEMP`, `TMP`, `SystemRoot`, `ComSpec`, `PATHEXT`, `LANG`, `LC_ALL`, `TERM`, and `CI`. It applies only explicitly supplied additions whose keys do not match `/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i`. Provider credentials remain in the provider request layer and never enter tool child processes.

- [ ] **Step 6: Run sandbox/process tests**

Run:

```bash
npx vitest run tests/cli/workspace-sandbox.test.js tests/cli/process-runner.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add packages/agent-core/sandbox packages/agent-core/process packages/agent-core/index.js tests/cli/workspace-sandbox.test.js tests/cli/process-runner.test.js
git commit -m "feat(cli): enforce workspace and process boundaries"
```

---

### Task 4: Schema-valid tools and real approval decisions

**Files:**

- Create: `packages/agent-core/tools/core-tools.js`
- Replace: `packages/agent-core/tools/index.js`
- Replace: `packages/agent-core/permissions/index.js`
- Create: `packages/agent-core/permissions/approval-controller.js`
- Modify: `packages/agent-core/index.js`
- Replace: `tests/cli/tools.test.js`
- Replace: `tests/cli/permissions.test.js`

**Interfaces:**

- Consumes: `WorkspaceSandbox`, `runProcess`, stable errors/events.
- Produces: `ToolRegistry.getProviderSchemas()`.
- Produces: `ToolRegistry.executeTool(name, args, context)`.
- Produces: `PermissionManager.resolve({ category, operation, autoApprove })`.
- Produces: `ApprovalController.authorize(request)`.

- [ ] **Step 1: Write failing schema and workspace-tool tests**

```js
// tests/cli/tools.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ToolRegistry, WorkspaceSandbox } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('ToolRegistry', () => {
  it('emits OpenAI-compatible function schemas', () => {
    const schema = new ToolRegistry().getProviderSchemas()[0];
    expect(schema).toMatchObject({
      type: 'function',
      function: {
        name: expect.any(String),
        description: expect.any(String),
        parameters: { type: 'object' }
      }
    });
  });

  it('cannot read outside the workspace', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    const registry = new ToolRegistry();
    await expect(registry.executeTool('read_file', { filePath: '/etc/passwd' }, {
      sandbox: WorkspaceSandbox.create(root),
      authorize: async () => ({ allowed: true })
    })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_WORKSPACE' });
  });

  it('patches an exact unique string and records the change', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-tools-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'a.txt'), 'before\n');
    const result = await new ToolRegistry().executeTool('edit_file', {
      filePath: 'a.txt',
      targetContent: 'before',
      replacementContent: 'after'
    }, {
      sandbox: WorkspaceSandbox.create(root),
      authorize: async () => ({ allowed: true })
    });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after\n');
  });
});
```

- [ ] **Step 2: Write failing approval tests**

```js
// tests/cli/permissions.test.js
import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalController,
  PermissionManager
} from '../../packages/agent-core/index.js';

describe('CoreZ permissions', () => {
  it('returns ask without treating it as allowed', () => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({ category: 'shell', operation: 'npm test' }))
      .toMatchObject({ action: 'ask', allowed: false });
  });

  it('auto-approves contained ordinary operations only', () => {
    const manager = new PermissionManager({ shell: 'ask' });
    expect(manager.resolve({
      category: 'shell',
      operation: 'npm test',
      autoApprove: true,
      contained: true
    }).action).toBe('allow');
    expect(manager.resolve({
      category: 'shell',
      operation: 'git reset --hard',
      autoApprove: true,
      contained: true
    }).action).toBe('blocked');
  });

  it('caches allow-for-session by normalized scope', async () => {
    const prompt = vi.fn(async () => 'session');
    const controller = new ApprovalController({ prompt });
    const request = { tool: 'run_command', category: 'shell', operation: 'npm test', scope: 'shell:npm test' };
    expect(await controller.authorize(request)).toMatchObject({ allowed: true, persistence: 'session' });
    expect(await controller.authorize(request)).toMatchObject({ allowed: true, persistence: 'session' });
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run tool/permission tests and verify failure**

Run:

```bash
npx vitest run tests/cli/tools.test.js tests/cli/permissions.test.js
```

Expected: FAIL because current schemas are not OpenAI-compatible and `ask` is treated as execution permission.

- [ ] **Step 4: Implement permission resolution and approvals**

Hard-block at least these normalized command classes:

```js
export const HARD_BLOCKED_COMMANDS = Object.freeze([
  /\brm\s+(-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r)\s+(\/|~|\*)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[A-Za-z]*f/i,
  /\bsudo\b/i,
  /\b(mkfs|fdisk|parted)\b/i,
  /\bdd\s+if=/i
]);
```

`ApprovalController.authorize` receives the permission decision. In non-interactive mode, an unresolved `ask` throws `TOOL_APPROVAL_REQUIRED`. In interactive mode its injected prompt returns `once`, `session`, or `deny`. A denial throws `TOOL_DENIED`.

- [ ] **Step 5: Implement focused tools through the sandbox**

Every file tool calls `resolveExisting` or `resolveForCreate` before filesystem access. `edit_file` must require exactly one target match. `run_command` uses the process boundary and an explicit `cwd` equal to the canonical workspace.

Return tool results in this shape:

```js
{
  success: true,
  data: { filePath: 'README.md', bytesRead: 128, content: '# CoreZ\n' },
  durationMs: 12
}
```

Return execution failures to the runtime as structured results only when the provider can act on them; boundary and policy failures remain typed thrown errors.

- [ ] **Step 6: Run tool/permission tests**

Run:

```bash
npx vitest run tests/cli/tools.test.js tests/cli/permissions.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add packages/agent-core/tools packages/agent-core/permissions packages/agent-core/index.js tests/cli/tools.test.js tests/cli/permissions.test.js
git commit -m "feat(cli): add approved sandboxed tools"
```

---

### Task 5: Reliable event-driven agent state machine

**Files:**

- Create: `packages/agent-core/runtime/tool-loop.js`
- Replace: `packages/agent-core/runtime/index.js`
- Modify: `packages/agent-core/index.js`
- Replace: `tests/cli/agent-loop.test.js`
- Create: `tests/cli/runtime-failures.test.js`

**Interfaces:**

- Consumes: provider async events, tool registry, command policy, sandbox, approval controller.
- Produces: `AgentRuntime.runTask(prompt, options)` as an async generator of CoreZ events.
- Produces: `AgentRuntime.execute(prompt, options)` returning `{ success, response, stepsCount, inspectedFiles, modifiedFiles, executedToolsCount }`.
- Produces: `toolCallFingerprint(call)`, `DuplicateToolGuard`.

- [ ] **Step 1: Write failing multi-turn runtime test**

```js
// tests/cli/agent-loop.test.js
import { describe, expect, it } from 'vitest';
import { AgentRuntime, MockProvider } from '../../packages/agent-core/index.js';

describe('AgentRuntime', () => {
  it('executes a tool turn and streams final completion', async () => {
    const provider = new MockProvider({ turns: [
      [{ type: 'tool.requested', data: { id: 'c1', name: 'read_file', arguments: { filePath: 'package.json' } } }],
      [
        { type: 'assistant.delta', data: { text: 'Inspected package.json.' } },
        { type: 'assistant.completed', data: { finishReason: 'stop' } }
      ]
    ] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });
    const events = [];
    for await (const event of runtime.runTask('inspect package', { policy: 'plan' })) events.push(event);

    expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
      'run.started', 'tool.requested', 'tool.completed',
      'assistant.delta', 'assistant.completed', 'run.completed'
    ]));
    expect(events.at(-1).data.success).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing loop, step-limit, denial, and cancellation tests**

```js
// tests/cli/runtime-failures.test.js
import { describe, expect, it } from 'vitest';
import { AgentRuntime, MockProvider } from '../../packages/agent-core/index.js';

const repeated = () => ({
  type: 'tool.requested',
  data: { id: crypto.randomUUID(), name: 'list_directory', arguments: { dirPath: '.' } }
});

describe('AgentRuntime failure states', () => {
  it('fails after three identical consecutive calls', async () => {
    const provider = new MockProvider({ turns: [[repeated()], [repeated()], [repeated()]] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), { provider });
    await expect(runtime.execute('loop', { policy: 'plan' }))
      .rejects.toMatchObject({ code: 'DUPLICATE_TOOL_LOOP' });
  });

  it('fails instead of reporting success at the step limit', async () => {
    const provider = new MockProvider({ turns: [[repeated()], [repeated()]] });
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), {
      provider,
      duplicateToolLimit: 99,
      maxSteps: 2
    });
    await expect(runtime.execute('limit', { policy: 'plan' }))
      .rejects.toMatchObject({ code: 'STEP_LIMIT' });
  });

  it('propagates an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const runtime = AgentRuntime.createForWorkspace(process.cwd(), {
      provider: new MockProvider({ turns: [] })
    });
    await expect(runtime.execute('cancel', { signal: controller.signal }))
      .rejects.toMatchObject({ code: 'COMMAND_CANCELLED' });
  });
});
```

- [ ] **Step 3: Run runtime tests and verify failure**

Run:

```bash
npx vitest run tests/cli/agent-loop.test.js tests/cli/runtime-failures.test.js
```

Expected: FAIL because the current runtime returns one final object, repeats calls to exhaustion, and reports success at the limit.

- [ ] **Step 4: Implement duplicate detection and the runtime generator**

Use a stable recursively key-sorted JSON representation:

```js
export function toolCallFingerprint(call) {
  return `${call.name}:${stableStringify(call.arguments || {})}`;
}
```

Reset the consecutive count whenever the fingerprint changes or a mutating tool completes successfully. Throw on the third identical consecutive call.

The runtime generator owns `messages`, provider turns, step counting, streamed assistant text, tool execution, and terminal states. It must persist or emit an error before throwing so renderers can show structured failure.

- [ ] **Step 5: Add the compatibility `execute` collector**

`execute` consumes `runTask`, concatenates `assistant.delta` text, tracks counts, and returns only after a successful `run.completed`. It rethrows typed errors and never converts them to `{ success: true }`.

- [ ] **Step 6: Run runtime tests**

Run:

```bash
npx vitest run tests/cli/agent-loop.test.js tests/cli/runtime-failures.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add packages/agent-core/runtime packages/agent-core/index.js tests/cli/agent-loop.test.js tests/cli/runtime-failures.test.js
git commit -m "feat(cli): add reliable agent execution loop"
```

---

### Task 6: Persistent append-only sessions

**Files:**

- Create: `packages/agent-core/sessions/jsonl-store.js`
- Create: `packages/agent-core/sessions/index.js`
- Modify: `packages/agent-core/index.js`
- Create: `tests/cli/session-store.test.js`
- Create: `tests/cli/session-service.test.js`

**Interfaces:**

- Consumes: CoreZ events and session errors.
- Produces: `JsonlSessionStore({ rootDir, now })`.
- Produces: `SessionService.create({ projectPath, model, policy, title })`.
- Produces: `append`, `resume`, `list`, `show`, `compact`, `delete`.

- [ ] **Step 1: Write failing storage tests**

```js
// tests/cli/session-store.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonlSessionStore } from '../../packages/agent-core/index.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('JsonlSessionStore', () => {
  it('atomically indexes and appends session events', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-sessions-'));
    roots.push(rootDir);
    const store = new JsonlSessionStore({ rootDir, now: () => new Date('2026-07-26T00:00:00Z') });
    const meta = store.create({ projectPath: '/project', model: 'deepseek-v4-pro', policy: 'chat', title: 'Test' });
    store.append(meta.id, { type: 'status', timestamp: '2026-07-26T00:00:00.000Z', data: { text: 'ok' } });

    expect(store.list()).toHaveLength(1);
    expect(store.readEvents(meta.id)).toHaveLength(1);
    expect(fs.existsSync(path.join(rootDir, 'index.json.tmp'))).toBe(false);
  });

  it('isolates a corrupt JSONL record', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-sessions-'));
    roots.push(rootDir);
    const store = new JsonlSessionStore({ rootDir });
    const meta = store.create({ projectPath: '/project', model: 'x', policy: 'chat', title: 'Broken' });
    fs.appendFileSync(path.join(rootDir, `${meta.id}.jsonl`), '{bad json}\n');
    expect(() => store.readEvents(meta.id))
      .toThrowError(expect.objectContaining({ code: 'SESSION_CORRUPT' }));
    expect(store.list()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Write failing project-indexed resume tests**

```js
// tests/cli/session-service.test.js
import { describe, expect, it } from 'vitest';
import { SessionService } from '../../packages/agent-core/index.js';

function createMemoryStore() {
  const metadata = new Map();
  const events = new Map();
  let sequence = 0;
  return {
    create(input) {
      const id = `s${++sequence}`;
      const record = {
        id,
        ...input,
        createdAt: `2026-07-26T00:00:0${sequence}.000Z`,
        updatedAt: `2026-07-26T00:00:0${sequence}.000Z`,
        status: 'active'
      };
      metadata.set(id, record);
      events.set(id, []);
      return record;
    },
    list: () => [...metadata.values()],
    get: id => metadata.get(id),
    append: (id, event) => events.get(id).push(event),
    readEvents: id => [...events.get(id)],
    update(id, patch) {
      const record = { ...metadata.get(id), ...patch };
      metadata.set(id, record);
      return record;
    },
    delete(id) {
      metadata.delete(id);
      events.delete(id);
    }
  };
}

describe('SessionService', () => {
  it('continues the newest session for the canonical project', () => {
    const store = createMemoryStore();
    const service = new SessionService({ store, realpath: value => value });
    const first = service.create({ projectPath: '/a', model: 'x', policy: 'chat', title: 'first' });
    const second = service.create({ projectPath: '/a', model: 'x', policy: 'chat', title: 'second' });
    service.create({ projectPath: '/b', model: 'x', policy: 'chat', title: 'other' });
    expect(service.continue('/a').id).toBe(second.id);
    expect(() => service.resume(first.id, '/b'))
      .toThrowError(expect.objectContaining({ code: 'SESSION_PROJECT_MISMATCH' }));
  });
});
```

- [ ] **Step 3: Run session tests and verify failure**

Run:

```bash
npx vitest run tests/cli/session-store.test.js tests/cli/session-service.test.js
```

Expected: FAIL because no session storage exists.

- [ ] **Step 4: Implement JSONL storage**

Use `crypto.randomUUID()` for opaque IDs. Write index updates to `index.json.tmp`, `fsync` the opened file, then `renameSync` to `index.json`. Append exactly one JSON object plus newline per event.

Metadata updates must retain `createdAt`, update `updatedAt`, and never store provider credentials or environment values.

- [ ] **Step 5: Implement project-indexed session behavior**

Canonicalize project paths through the injected `realpath`. `continue(project)` sorts matching sessions by `updatedAt` descending. `resume(id, project)` throws:

- `SESSION_NOT_FOUND` for an unknown ID;
- `SESSION_PROJECT_MISMATCH` when canonical project paths differ.

Compaction appends a `compaction.summary` record only after a supplied summarizer succeeds; it never discards the original JSONL history in this milestone.

- [ ] **Step 6: Run session tests**

Run:

```bash
npx vitest run tests/cli/session-store.test.js tests/cli/session-service.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add packages/agent-core/sessions packages/agent-core/index.js tests/cli/session-store.test.js tests/cli/session-service.test.js
git commit -m "feat(cli): persist resumable sessions"
```

---

### Task 7: Human/JSON renderers, interactive approvals, and real session commands

**Files:**

- Replace: `packages/cli/src/ui/terminal.js`
- Create: `packages/cli/src/ui/json.js`
- Create: `packages/cli/src/run-agent-command.js`
- Replace: `packages/cli/src/commands/chat.js`
- Create: `packages/cli/src/commands/session.js`
- Modify: `packages/cli/src/commands/model.js`
- Modify: `packages/cli/src/cli.js`
- Modify: `packages/cli/bin/corez.mjs`
- Test: `tests/cli/renderers.test.js`
- Test: `tests/cli/session-command.test.js`
- Modify: `tests/cli/slash-suggestions.test.js`

**Interfaces:**

- Consumes: runtime event stream, session service, stable exit-code mapping.
- Produces: `HumanRenderer.render(event)`.
- Produces: `JsonRenderer.render(event)`.
- Produces: `runAgentCommand({ prompt, policy, options, renderer })`.
- Produces: `handleSessionCommand(args, options, renderer)`.

- [ ] **Step 1: Write failing renderer tests**

```js
// tests/cli/renderers.test.js
import { describe, expect, it } from 'vitest';
import { HumanRenderer } from '../../packages/cli/src/ui/terminal.js';
import { JsonRenderer } from '../../packages/cli/src/ui/json.js';

function sink() {
  let value = '';
  return { write: chunk => { value += chunk; }, value: () => value };
}

describe('CLI renderers', () => {
  it('streams human assistant text', () => {
    const output = sink();
    const renderer = new HumanRenderer({ stdout: output, stderr: sink(), color: false });
    renderer.render({ type: 'assistant.delta', timestamp: 'x', data: { text: 'hello' } });
    expect(output.value()).toBe('hello');
  });

  it('emits one valid JSON object per event without ANSI', () => {
    const output = sink();
    const renderer = new JsonRenderer({ stdout: output });
    renderer.render({ type: 'status', timestamp: 'x', data: { text: 'working' } });
    expect(JSON.parse(output.value())).toEqual({
      type: 'status', timestamp: 'x', data: { text: 'working' }
    });
    expect(output.value()).not.toContain('\u001b[');
  });
});
```

- [ ] **Step 2: Write failing session-command and slash-command tests**

```js
// tests/cli/session-command.test.js
import { describe, expect, it, vi } from 'vitest';
import { handleSessionCommand } from '../../packages/cli/src/commands/session.js';

describe('session command', () => {
  it('lists persisted sessions', async () => {
    const renderer = { render: vi.fn() };
    const sessions = { list: () => [{ id: 's1', title: 'Work', projectPath: '/repo', status: 'active' }] };
    expect(await handleSessionCommand(['list'], { sessions, cwd: '/repo' }, renderer)).toBe(0);
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.list'
    }));
  });

  it('requires confirmation for non-interactive deletion', async () => {
    const sessions = { delete: vi.fn() };
    const renderer = { render: vi.fn() };
    expect(await handleSessionCommand(['delete', 's1'], {
      sessions, cwd: '/repo', interactive: false, yes: false
    }, renderer)).not.toBe(0);
    expect(sessions.delete).not.toHaveBeenCalled();
  });
});
```

Update `tests/cli/slash-suggestions.test.js` to assert `/new`, `/sessions`, `/compact`, `/permissions`, `/model`, `/clear`, `/help`, and `/exit`.

- [ ] **Step 3: Run presentation/session command tests and verify failure**

Run:

```bash
npx vitest run tests/cli/renderers.test.js tests/cli/session-command.test.js tests/cli/slash-suggestions.test.js
```

Expected: FAIL because renderer separation and real session commands do not exist.

- [ ] **Step 4: Implement renderers and shared command runner**

`HumanRenderer` writes assistant deltas directly, renders status/tool events on their own concise lines, and sends errors to `stderr`. `JsonRenderer` writes `JSON.stringify(event) + '\n'` for every event and never calls terminal styling helpers.

`runAgentCommand`:

1. Creates or resumes the requested session.
2. Creates the selected provider, sandbox, permission manager, approval controller, and runtime.
3. Iterates runtime events, appending each event to the session before rendering it.
4. Returns `0` only after successful `run.completed`.
5. Renders typed errors and returns `exitCodeForError(error)`.

- [ ] **Step 5: Implement line-oriented chat and approvals**

Use `node:readline/promises`. Parse slash commands before sending prompts to the runtime. `/permissions` updates session-scoped permission settings. Approval prompts accept:

```text
[o] Allow once  [s] Allow for session  [d] Deny
```

Only `o`, `s`, and `d` are accepted; invalid input repeats the prompt. EOF exits cleanly. A first `Ctrl+C` aborts the active turn and returns to the prompt; idle `Ctrl+C` exits.

- [ ] **Step 6: Implement real session commands and global flag routing**

Support:

```text
corez session list
corez session show <id>
corez session delete <id> [--yes]
corez --continue
corez --session <id>
```

Ensure `--model`, `--agent`, `--auto`, `--mock`, `--json`, and the process abort signal reach both named commands and interactive chat.

The direct `corez model <id>` command may continue to update project configuration. Interactive `/model <id>` updates only the active session metadata and the next-turn resolved configuration; it must not call `saveCorezConfig`.

- [ ] **Step 7: Run presentation/session command tests**

Run:

```bash
npx vitest run tests/cli/renderers.test.js tests/cli/session-command.test.js tests/cli/slash-suggestions.test.js tests/cli/cli-args.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Task 7**

```bash
git add packages/cli/src packages/cli/bin/corez.mjs tests/cli/renderers.test.js tests/cli/session-command.test.js tests/cli/slash-suggestions.test.js tests/cli/cli-args.test.js
git commit -m "feat(cli): add streaming sessions and renderers"
```

---

### Task 8: Migrate commands, require verification, and prove end-to-end behavior

**Files:**

- Modify: `packages/cli/src/commands/plan.js`
- Modify: `packages/cli/src/commands/build.js`
- Modify: `packages/cli/src/commands/fix.js`
- Modify: `packages/cli/src/commands/review.js`
- Modify: `packages/cli/src/commands/swarm.js`
- Modify: `packages/cli/src/cli.js`
- Modify: `packages/cli/README.md`
- Replace: `tests/cli/cli-commands.test.js`
- Create: `tests/cli/command-policies.test.js`
- Create: `tests/cli/cli-e2e.test.js`

**Interfaces:**

- Consumes: `runAgentCommand`, command policies, mock provider, sessions.
- Produces: truthful exit codes for every agent command.
- Produces: required verification result for build/fix.

- [ ] **Step 1: Write failing command-policy tests**

```js
// tests/cli/command-policies.test.js
import { describe, expect, it } from 'vitest';
import { getCommandPolicy } from '../../packages/agent-core/index.js';

describe('agent command policies', () => {
  it.each(['plan', 'review'])('%s excludes mutating and shell tools', name => {
    const policy = getCommandPolicy(name);
    expect(policy.tools).not.toContain('write_file');
    expect(policy.tools).not.toContain('edit_file');
    expect(policy.tools).not.toContain('run_command');
  });

  it.each(['build', 'fix'])('%s requires successful verification', name => {
    expect(getCommandPolicy(name).requireVerification).toBe(true);
  });
});
```

- [ ] **Step 2: Write failing end-to-end mock test**

```js
// tests/cli/cli-e2e.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../packages/cli/src/cli.js';

const roots = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('CoreZ CLI end to end', () => {
  it('inspects, edits, verifies, persists, and resumes in explicit mock mode', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-e2e-'));
    const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corez-session-e2e-'));
    roots.push(cwd, sessionRoot);
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
      name: 'fixture',
      scripts: { test: 'node -e "process.exit(0)"' }
    }));
    fs.writeFileSync(path.join(cwd, 'message.txt'), 'before\n');

    const first = await runCli(['build', 'change message', '--mock', '--auto', '--json'], {
      cwd,
      sessionRoot,
      mockTurns: [
        [{ type: 'tool.requested', data: { id: 'r1', name: 'read_file', arguments: { filePath: 'message.txt' } } }],
        [{ type: 'tool.requested', data: { id: 'r2', name: 'edit_file', arguments: {
          filePath: 'message.txt', targetContent: 'before', replacementContent: 'after'
        } } }],
        [{ type: 'tool.requested', data: { id: 'r3', name: 'run_tests', arguments: {} } }],
        [{ type: 'assistant.delta', data: { text: 'Changed and verified.' } },
         { type: 'assistant.completed', data: { finishReason: 'stop' } }]
      ]
    });

    expect(first).toBe(0);
    expect(fs.readFileSync(path.join(cwd, 'message.txt'), 'utf8')).toBe('after\n');

    const resumed = await runCli(['--continue', '--mock', '--json'], {
      cwd,
      sessionRoot,
      mockTurns: [[
        { type: 'assistant.delta', data: { text: 'Resumed.' } },
        { type: 'assistant.completed', data: { finishReason: 'stop' } }
      ]]
    });
    expect(resumed).toBe(0);
  });
});
```

- [ ] **Step 3: Replace shallow command tests with truthful failure assertions**

`tests/cli/cli-commands.test.js` must assert:

- `status`, `models`, `agents`, `completion`, and help return `0` without credentials.
- Live `run`, `plan`, `build`, `fix`, and `review` return `AUTH_MISSING`'s nonzero exit code when no relevant key exists.
- The same commands can complete only with an injected provider or explicit `--mock`.
- Unknown flags and missing prompts return usage exit code `2`.
- `--json` output contains parseable JSON lines only.

- [ ] **Step 4: Run policy/E2E tests and verify failure**

Run:

```bash
npx vitest run tests/cli/command-policies.test.js tests/cli/cli-e2e.test.js tests/cli/cli-commands.test.js
```

Expected: FAIL until all command handlers use the shared runtime and verification contract.

- [ ] **Step 5: Migrate plan/build/fix/review and gate verification**

Each handler becomes a thin wrapper:

```js
export function handlePlanCommand(prompt, options, renderer) {
  return runAgentCommand({ prompt, policy: 'plan', options, renderer });
}
```

Build and fix may return `0` only if at least one verification tool completed with exit code `0` after the final successful mutation. Otherwise throw `VERIFICATION_FAILED`.

Review and plan must reject any provider-requested tool outside their policy before approval is considered.

- [ ] **Step 6: Route swarm through the shared safety boundary**

Do not expand swarm features. Ensure any swarm worker runtime is constructed from the same provider, sandbox, permission, and event contracts. If the current swarm cannot meet those contracts in this milestone, make `corez swarm` return a clear nonzero `USAGE_ERROR` explaining that hardened swarm execution is unavailable instead of printing a false success.

- [ ] **Step 7: Update CLI documentation**

Document:

- Supported live providers and credential variables.
- Fail-closed behavior and `--mock`.
- Approval choices and `--auto` boundaries.
- Session create/list/show/delete/resume commands.
- `--json` NDJSON contract.
- Human and automation examples.
- Exact verification and live-smoke commands.

Remove every claim that offline fallback completes real repository work.

- [ ] **Step 8: Run focused policy/E2E tests**

Run:

```bash
npx vitest run tests/cli/command-policies.test.js tests/cli/cli-e2e.test.js tests/cli/cli-commands.test.js
```

Expected: PASS.

- [ ] **Step 9: Run all CLI tests**

Run:

```bash
npm run test:cli
```

Expected: PASS with no repeated 25-step simulated loops and no credential-free false-success output.

- [ ] **Step 10: Run the full repository verification gate**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit `0`.

Report explicitly:

```text
Typecheck: NOT RUN — package.json has no typecheck script.
OpenCode Go live smoke: PASS, FAIL with evidence, or NOT RUN — credential missing.
OpenRouter live smoke: PASS, FAIL with evidence, or NOT RUN — credential missing.
```

- [ ] **Step 11: Review the final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only planned CLI, agent-core, test, and documentation files are changed.

- [ ] **Step 12: Commit Task 8**

```bash
git add packages/cli packages/agent-core tests/cli
git commit -m "feat(cli): deliver reliable CoreZ coding agent"
```

- [ ] **Step 13: Apply the repository Git completion policy**

Confirm the branch:

```bash
git branch --show-current
```

Expected: `main`. If it is not `main`, stop without committing or pushing.

Then follow the repository-local `git-superpowers` skill: fetch `origin/main`, rebase without merge commits, rerun the complete verification gate if the rebase changes source state, and push `main:main`.
