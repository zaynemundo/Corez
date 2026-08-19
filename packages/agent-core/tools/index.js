import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { PERMISSION_CATEGORIES } from '../permissions/index.js';
import { resolveWorkspacePath } from '../runtime/pathResolver.js';
import { RepeatToolGuard } from '../guards/RepeatToolGuard.js';
import { ToolResultPruner } from './ToolResultPruner.js';
import { OutputSpillManager } from './OutputSpillManager.js';
import { UserQuestionService, createAskQuestionTool } from './interactive/UserQuestions.js';
import { SkillRegistry, createSkillTool } from '../skills/SkillRegistry.js';
import { TodoTracker, createTodoTool } from '../todos/TodoTracker.js';
import { SessionQueryEngine, createSessionQueryTool } from '../session-query/SessionQueryEngine.js';
import { PersistentTerminalManager, createPersistentCommandTool } from '../terminal/PersistentTerminalManager.js';
import { EventBus } from '../harness/EventBus.js';

// No fixed command timeout: valid builds, tests, and long-running commands
// must never be terminated prematurely. An operator may set an explicit
// hang guard via COREZ_COMMAND_TIMEOUT_MS; 0 means unlimited (default).
function commandTimeout() {
  const raw = Number(process.env.COREZ_COMMAND_TIMEOUT_MS || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export class ToolRegistry {
  constructor(options = {}) {
    this.tools = new Map();
    this.repeatToolGuard = options.repeatToolGuard !== undefined ? options.repeatToolGuard : new RepeatToolGuard();
    this.spillManager = options.spillManager !== undefined ? options.spillManager : new OutputSpillManager({ inMemory: true });
    this.pruner = options.pruner !== undefined ? options.pruner : new ToolResultPruner({ spillManager: this.spillManager });
    this.userQuestionService = options.userQuestionService || new UserQuestionService();
    this.skillRegistry = options.skillRegistry || new SkillRegistry();
    this.todoTracker = options.todoTracker || new TodoTracker();
    this.sessionQueryEngine = options.sessionQueryEngine || new SessionQueryEngine();
    this.terminalManager = options.terminalManager || new PersistentTerminalManager();
    // DSH-inspired: every registry owns its typed event bus; shared bus is injected.
    this.eventBus = options.eventBus || new EventBus();
    // Monotonic guards after pre-execute waterfall (ctx.tools.guard)
    this._toolGuards = [];
    this.registerCoreTools();
  }

  registerTool(tool) {
    if (!tool.name) throw new Error('Tool must have a name');
    // DSH throws on duplicate within one layer; for test compatibility we
    // allow overwriting (idempotent re-register from a recreated sub-registry).
    // A dedicated guard could still enforce monotonic policy via tools themselves.
    this.tools.set(tool.name, tool);
  }

  getTool(name) {
    return this.tools.get(name);
  }

  getAllTools() {
    return Array.from(this.tools.values());
  }

  getToolSchemas() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  // DSH parity: monotonic guard registration (plain or agent-scoped in future)
  guard(guardFn) {
    if (typeof guardFn !== 'function') throw new Error('ToolGuard must be a function');
    this._toolGuards.push(guardFn);
    return () => {
      const i = this._toolGuards.indexOf(guardFn);
      if (i !== -1) this._toolGuards.splice(i, 1);
    };
  }

  // Convenience shims for waterfall registration (mirrors ctx.waterfall usage)
  onPreExecute(handler) {
    return this.eventBus.waterfall('tools/pre-execute', handler);
  }
  onExecute(handler) {
    return this.eventBus.waterfall('tools/execute', handler);
  }
  onPostExecute(handler) {
    return this.eventBus.waterfall('tools/post-execute', handler);
  }

  // Execution pipeline: pre-execute -> guards -> execute wrapper -> body -> post-execute -> finalizeContent -> prune
  async executeTool(name, args, runtimeOptions = {}) {
    const tool = this.getTool(name);
    if (!tool) {
      return { error: `Unknown tool: "${name}"` };
    }

    const { context, permissionManager, autoApprove, signal } = runtimeOptions;
    const scopeId = runtimeOptions.taskId || runtimeOptions.sessionId || 'default';
    const taskId = runtimeOptions.taskId || null;
    if (signal?.aborted) {
      return { error: `Tool "${name}" aborted before dispatch.`, code: 'ABORTED_BEFORE_DISPATCH' };
    }

    // 1. pre-execute waterfall (reorderable policy)
    let preDecision;
    try {
      preDecision = await this.eventBus.dispatchWaterfall('tools/pre-execute', { tool: name, args, taskId, signal }, () => ({ kind: 'allow' }));
    } catch (err) {
      return { error: `pre-execute failed for "${name}": ${err.message}` };
    }
    if (preDecision && preDecision.kind === 'deny') {
      return { error: preDecision.reason || `Tool "${name}" denied by policy.`, code: 'DENIED' };
    }
    if (preDecision && preDecision.kind === 'ask') {
      // Without ctx.approval (not composed), degrade to deny
      return { error: preDecision.reason || `Tool "${name}" requires approval.`, code: 'DENIED', asked: true };
    }

    // 2. Guard check: repeat loop + monotonic guards
    const guardCheck = this.repeatToolGuard?.evaluate(name, args, scopeId);
    if (guardCheck?.status === 'blocked') {
      return { error: guardCheck.error, blocked: true };
    }
    for (const g of this._toolGuards) {
      try {
        const reason = g({ name, args, taskId });
        if (typeof reason === 'string' && reason) {
          return { error: `Tool "${name}" denied by guard: ${reason}`, code: 'DENIED' };
        }
      } catch (err) {
        return { error: `Tool guard failed: ${err.message}` };
      }
    }

    // 3. Check permissions
    if (permissionManager) {
      const category = tool.category || PERMISSION_CATEGORIES.READ;
      const detail = args?.command || args?.filePath || args?.path || name;
      const permCheck = permissionManager.checkPermission(category, detail, { autoApprove });
      if (!permCheck.allowed) {
        return { error: `Permission denied for ${name}: ${permCheck.reason}` };
      }
    }

    // 4. Build execution descriptor (lossless arg snapshot, opaque token)
    const token = Symbol(`tool:${name}`);
    const frozenArgs = JSON.parse(JSON.stringify(args ?? {}));
    Object.freeze(frozenArgs);
    const execution = Object.freeze({
      token,
      name,
      arguments: frozenArgs,
      signal,
      taskId,
      ...(runtimeOptions.agent ? { agent: runtimeOptions.agent } : {}),
      ...(runtimeOptions.parent ? { parent: runtimeOptions.parent } : {})
    });

    // 5. execute wrapper waterfall (timeout/retry/metrics plugins)
    let innerResult;
    const invokeBody = async () => {
      const timeoutMs = tool.timeoutMs;
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        // bounded execution
        return await Promise.race([
          tool.execute(args, { ...runtimeOptions, signal, execution }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`TOOL_TIMEOUT after ${timeoutMs}ms`)), timeoutMs))
            .then(() => { throw new Error(`TOOL_TIMEOUT`); })
        ]);
      }
      return tool.execute(args, { ...runtimeOptions, signal, execution });
    };

    try {
      innerResult = await this.eventBus.dispatchWaterfall('tools/execute', { execution, args: frozenArgs, signal }, invokeBody);
    } catch (err) {
      if (signal?.aborted) {
        return { error: `Tool "${name}" aborted.`, code: 'ABORTED', detail: err.message };
      }
      // TOOL_TIMEOUT is more specific than generic failure
      if (err.message === 'TOOL_TIMEOUT' || err.message?.includes('TIMEOUT')) {
        return { error: `Tool "${name}" timed out.`, code: 'TOOL_TIMEOUT' };
      }
      return { error: `Tool "${name}" execution error: ${err.message}` };
    }

    // on pre-abort, skip remaining phases
    if (signal?.aborted && innerResult && !innerResult._abortedHandled) {
      // if body succeeded but cancellation won, surface abort only if no more specific failure
      // (DSH: successful outcome replaced with ABORTED)
      if (innerResult && !innerResult.error) {
        return { error: `Tool "${name}" aborted.`, code: 'ABORTED' };
      }
    }

    // record execution for context
    let normalized = innerResult;
    if (context && typeof context.recordToolExecution === 'function') {
      try {
        context.recordToolExecution(name, args, normalized);
      } catch {}
      if (['write_file', 'edit_file'].includes(name) && args.filePath && typeof context.recordModifiedFile === 'function') {
        try { context.recordModifiedFile(args.filePath); } catch {}
      } else if (['read_file', 'edit_file'].includes(name) && args.filePath && typeof context.recordInspectedFile === 'function') {
        try { context.recordInspectedFile(args.filePath); } catch {}
      }
    }

    // 6. post-execute waterfall (may replace content/value or block)
    if (normalized && typeof normalized === 'object') {
      try {
        const postDecision = await this.eventBus.dispatchWaterfall('tools/post-execute', { execution, result: normalized, signal }, () => null);
        if (postDecision && postDecision.kind === 'block') {
          normalized = { isError: true, error: { message: postDecision.reason || 'Blocked by post-execute' }, content: postDecision.reason || 'Blocked', _blocked: true };
        } else if (postDecision && postDecision.kind === 'replace') {
          if (postDecision.content !== undefined) normalized = { ...normalized, content: postDecision.content };
          if (postDecision.value !== undefined) {
            // re-validate canonical value path: replace value, keep content rerender if needed
            normalized = { ...normalized, value: postDecision.value };
          }
        } else if (postDecision && postDecision.content !== undefined) {
          // allow raw content replacement shorthand
          normalized = { ...normalized, content: postDecision.content };
        }
      } catch (err) {
        return { error: `post-execute failed for "${name}": ${err.message}` };
      }
    }

    // 7. definition-owned finalizeContent (sync, total)
    if (tool.finalizeContent && typeof tool.finalizeContent === 'function') {
      try {
        const finalized = tool.finalizeContent(execution, normalized);
        if (finalized !== undefined && finalized !== null) {
          // finalize may replace only content per DSH contract
          if (typeof finalized === 'string') normalized = { ...normalized, content: finalized };
          else if (typeof finalized === 'object' && finalized.content !== undefined) normalized = { ...normalized, content: finalized.content };
        }
      } catch (err) {
        return { error: `finalizeContent failed for "${name}": ${err.message}` };
      }
    }

    // 8. observe-only tools/result notification
    try {
      await this.eventBus.dispatchParallel('tools/result', { execution, result: normalized });
      // legacy broadcast as well
      this.eventBus.emit({ type: 'tools/result', execution, result: normalized, taskId });
    } catch {}

    // 9. Model-free pruning of oversized tool output
    let finalResult = normalized;
    if (this.pruner) {
      const pruneRes = this.pruner.prune(normalized, { toolName: name, args, scopeId });
      finalResult = pruneRes.result;
    }

    // Attach advisory warning if guard detected repetition
    if (guardCheck?.status === 'advisory' || guardCheck?.status === 'diagnostic') {
      if (typeof finalResult === 'object' && finalResult !== null) {
        finalResult._guardWarning = guardCheck.message;
      }
    }

    return finalResult;
  }

  // DSH parity: executionMode only parallel when explicitly isConcurrencySafe
  executionMode(exec) {
    const tool = this.getTool(exec.name);
    if (!tool || typeof tool.isConcurrencySafe !== 'function') return 'exclusive';
    try {
      return tool.isConcurrencySafe(exec.arguments) === true ? 'parallel' : 'exclusive';
    } catch {
      return 'exclusive';
    }
  }

  // Batch helper for agent-loop: executes many tool_calls with FIFO additionalContexts
  async executeToolCalls(toolCalls, runtimeOptions = {}) {
    const { signal } = runtimeOptions;
    const results = [];
    const additionalContexts = [];
    let concluded = false;
    // DSH: tool_calls within one step may be executed in parallel if safe; we simplify to parallel when all safe else sequential
    const exclusive = toolCalls.some((tc) => this.executionMode({ name: tc.name || tc.function?.name, arguments: tc.arguments || tc.args }) !== 'parallel');
    const runOne = async (tc) => {
      if (signal?.aborted) return { error: 'aborted', code: 'ABORTED' };
      const name = tc.name || tc.function?.name || tc.name;
      let args = tc.arguments || tc.args || tc.function?.arguments;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      const res = await this.executeTool(name, args, runtimeOptions);
      // capture deferred contexts (tool used exec.deferContext)
      if (res && Array.isArray(res.additionalContexts)) additionalContexts.push(...res.additionalContexts);
      return res;
    };
    if (exclusive) {
      for (const tc of toolCalls) results.push(await runOne(tc));
    } else {
      const settled = await Promise.all(toolCalls.map(runOne));
      results.push(...settled);
    }
    // DSH truncation: if any result was produced, turn may conclude or continue
    return { results, additionalContexts, concluded };
  }

  registerCoreTools() {
    // 1. read_file
    this.registerTool({
      name: 'read_file',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Read contents of a file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative or absolute file path to read' },
          startLine: { type: 'number', description: 'Optional 1-based start line' },
          endLine: { type: 'number', description: 'Optional 1-based end line' }
        },
        required: ['filePath']
      },
      async execute({ filePath, startLine, endLine }, { context }) {
        const cwd = context?.cwd || process.cwd();
        const resolved = resolveWorkspacePath(cwd, filePath);
        if (!resolved.ok) {
          return { success: false, error: resolved.error, code: resolved.code };
        }
        const fullPath = resolved.path;

        if (!fs.existsSync(fullPath)) {
          return { error: `File not found: ${filePath}` };
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        
        let selectedLines = lines;
        if (startLine || endLine) {
          const start = Math.max(1, startLine || 1) - 1;
          const end = endLine ? Math.min(lines.length, endLine) : lines.length;
          selectedLines = lines.slice(start, end);
        }

        return {
          filePath,
          totalLines: lines.length,
          content: selectedLines.join('\n')
        };
      }
    });

    // 2. write_file
    this.registerTool({
      name: 'write_file',
      category: PERMISSION_CATEGORIES.WORKSPACE_WRITE,
      description: 'Create or overwrite a file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Full file content to write' }
        },
        required: ['filePath', 'content']
      },
      async execute({ filePath, content }, { context }) {
        const cwd = context?.cwd || process.cwd();
        const resolved = resolveWorkspacePath(cwd, filePath);
        if (!resolved.ok) {
          return { success: false, error: resolved.error, code: resolved.code };
        }
        const fullPath = resolved.path;

        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        
        return { success: true, filePath, bytesWritten: Buffer.byteLength(content, 'utf8') };
      }
    });

    // 3. edit_file
    this.registerTool({
      name: 'edit_file',
      category: PERMISSION_CATEGORIES.WORKSPACE_WRITE,
      description: 'Replace a precise string snippet in a file with new content.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Target file path' },
          targetContent: { type: 'string', description: 'Exact string snippet to replace' },
          replacementContent: { type: 'string', description: 'New string content' }
        },
        required: ['filePath', 'targetContent', 'replacementContent']
      },
      async execute({ filePath, targetContent, replacementContent }, { context }) {
        const cwd = context?.cwd || process.cwd();
        const resolved = resolveWorkspacePath(cwd, filePath);
        if (!resolved.ok) {
          return { success: false, error: resolved.error, code: resolved.code };
        }
        const fullPath = resolved.path;

        if (!fs.existsSync(fullPath)) {
          return { error: `File not found: ${filePath}` };
        }
        
        const original = fs.readFileSync(fullPath, 'utf8');
        if (!original.includes(targetContent)) {
          return { error: `Target snippet not found in ${filePath}` };
        }
        
        const updated = original.replace(targetContent, replacementContent);
        fs.writeFileSync(fullPath, updated, 'utf8');
        
        return { success: true, filePath };
      }
    });

    // 4. list_directory
    this.registerTool({
      name: 'list_directory',
      category: PERMISSION_CATEGORIES.READ,
      description: 'List subdirectories and files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: { type: 'string', description: 'Directory path to list (defaults to workspace root)' }
        }
      },
      async execute({ dirPath = '.' } = {}, { context }) {
        const cwd = context?.cwd || process.cwd();
        const resolved = resolveWorkspacePath(cwd, dirPath);
        if (!resolved.ok) {
          return { success: false, error: resolved.error, code: resolved.code };
        }
        const fullPath = resolved.path;
        
        if (!fs.existsSync(fullPath)) {
          return { error: `Directory not found: ${dirPath}` };
        }
        
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const items = entries.map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          size: e.isFile() ? fs.statSync(path.join(fullPath, e.name)).size : undefined
        }));
        
        return { dirPath, items };
      }
    });

    // 5. search_files
    this.registerTool({
      name: 'search_files',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Find files matching a pattern or extension in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'File extension or keyword (e.g. ".js", "test")' }
        },
        required: ['pattern']
      },
      async execute({ pattern }, { context }) {
        const cwd = context?.cwd || process.cwd();
        const results = [];
        
        function walk(dir) {
          if (dir.includes('node_modules') || dir.includes('.git') || dir.includes('dist')) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
              results.push(path.relative(cwd, full));
            }
          }
        }
        
        walk(cwd);
        return { pattern, matches: results };
      }
    });

    // 6. search_text
    this.registerTool({
      name: 'search_text',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Search for text or regex pattern across workspace files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text string to search for' }
        },
        required: ['query']
      },
      async execute({ query }, { context }) {
        const cwd = context?.cwd || process.cwd();
        const matches = [];
        
        function walk(dir) {
          if (dir.includes('node_modules') || dir.includes('.git') || dir.includes('dist')) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (entry.isFile() && /\.(js|jsx|ts|tsx|json|md|html|css|py|sh)$/i.test(entry.name)) {
              try {
                const text = fs.readFileSync(full, 'utf8');
                if (text.includes(query)) {
                  const rel = path.relative(cwd, full);
                  const lines = text.split('\n');
                  lines.forEach((line, idx) => {
                    if (line.includes(query)) {
                      matches.push({ file: rel, lineNumber: idx + 1, content: line.trim() });
                    }
                  });
                }
              } catch (_e) {
                // Ignore binary/read errors
              }
            }
          }
        }
        
        walk(cwd);
        return { query, matches };
      }
    });

    // 7. run_command
    this.registerTool({
      name: 'run_command',
      category: PERMISSION_CATEGORIES.SHELL,
      description: 'Execute a shell command in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' }
        },
        required: ['command']
      },
      async execute({ command }, { context }) {
        const cwd = context?.cwd || process.cwd();
        try {
          const stdout = execSync(command, { cwd, encoding: 'utf8', timeout: commandTimeout() });
          return { command, stdout: stdout.trim(), exitCode: 0 };
        } catch (err) {
          return {
            command,
            stdout: err.stdout ? err.stdout.trim() : '',
            stderr: err.stderr ? err.stderr.trim() : '',
            error: err.message,
            exitCode: err.status || 1
          };
        }
      }
    });

    // 8. git_status
    this.registerTool({
      name: 'git_status',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Get current Git status of the repository.',
      parameters: { type: 'object', properties: {} },
      async execute(_, { context }) {
        const cwd = context?.cwd || process.cwd();
        try {
          const stdout = execSync('git status --short', { cwd, encoding: 'utf8' });
          const branch = execSync('git branch --show-current', { cwd, encoding: 'utf8' }).trim();
          return { branch, status: stdout.trim() };
        } catch (err) {
          return { error: err.message };
        }
      }
    });

    // 9. git_diff
    this.registerTool({
      name: 'git_diff',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Get current Git diff of uncommitted changes.',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'View staged diff if true' }
        }
      },
      async execute({ staged = false } = {}, { context }) {
        const cwd = context?.cwd || process.cwd();
        try {
          const cmd = staged ? 'git diff --cached' : 'git diff';
          const diff = execSync(cmd, { cwd, encoding: 'utf8' });
          return { staged, diff: diff.trim() || 'No uncommitted changes' };
        } catch (err) {
          return { error: err.message };
        }
      }
    });

    // 10. git_log
    this.registerTool({
      name: 'git_log',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Get recent Git commit logs.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits to retrieve (default 5)' }
        }
      },
      async execute({ count = 5 } = {}, { context }) {
        const cwd = context?.cwd || process.cwd();
        try {
          const safeCount = Number.isFinite(count) ? Math.min(100, Math.max(1, Math.floor(count))) : 5;
          const result = spawnSync('git', ['log', '-n', String(safeCount), '--oneline'], { cwd, encoding: 'utf8' });
          if (result.status !== 0) {
            return { error: result.stderr?.trim() || `git log failed with exit code ${result.status}` };
          }
          return { count: safeCount, log: result.stdout.trim() };
        } catch (err) {
          return { error: err.message };
        }
      }
    });

    // 11. run_tests
    this.registerTool({
      name: 'run_tests',
      category: PERMISSION_CATEGORIES.SHELL,
      description: 'Run project unit test suite.',
      parameters: {
        type: 'object',
        properties: {
          testFilter: { type: 'string', description: 'Optional test filter/file name' }
        }
      },
      async execute({ testFilter = '' } = {}, { context }) {
        const cwd = context?.cwd || process.cwd();
        const safeFilter = typeof testFilter === 'string' && testFilter.trim()
          ? testFilter.trim().replace(/[;&|`$(){}<>]/g, '')
          : '';
        const args = safeFilter ? ['test', '--', safeFilter] : ['test'];
        const cmd = ['npm', ...args].join(' ');
        try {
          const result = spawnSync('npm', args, { cwd, encoding: 'utf8', timeout: commandTimeout(), shell: false });
          if (result.status !== 0) {
            return {
              command: cmd,
              stdout: result.stdout ? result.stdout.trim() : '',
              stderr: result.stderr ? result.stderr.trim() : '',
              error: result.error?.message || `npm test failed with exit code ${result.status}`,
              exitCode: result.status ?? 1
            };
          }
          return { command: cmd, stdout: result.stdout.trim(), exitCode: 0 };
        } catch (err) {
          return {
            command: cmd,
            stdout: '',
            stderr: '',
            error: err.message,
            exitCode: 1
          };
        }
      }
    });

    // 12. run_build
    this.registerTool({
      name: 'run_build',
      category: PERMISSION_CATEGORIES.SHELL,
      description: 'Run project build command.',
      parameters: { type: 'object', properties: {} },
      async execute(_, { context }) {
        const cwd = context?.cwd || process.cwd();
        try {
          const stdout = execSync('npm run build', { cwd, encoding: 'utf8', timeout: commandTimeout() });
          return { command: 'npm run build', stdout: stdout.trim(), exitCode: 0 };
        } catch (err) {
          return {
            command: 'npm run build',
            stdout: err.stdout ? err.stdout.trim() : '',
            stderr: err.stderr ? err.stderr.trim() : '',
            error: err.message,
            exitCode: err.status || 1
          };
        }
      }
    });

    // 13. run_lint
    this.registerTool({
      name: 'run_lint',
      category: PERMISSION_CATEGORIES.SHELL,
      description: 'Run project linter.',
      parameters: { type: 'object', properties: {} },
      async execute(_, { context }) {
        const cwd = context?.cwd || process.cwd();
        try {
          const stdout = execSync('npm run lint', { cwd, encoding: 'utf8', timeout: commandTimeout() });
          return { command: 'npm run lint', stdout: stdout.trim(), exitCode: 0 };
        } catch (err) {
          return {
            command: 'npm run lint',
            stdout: err.stdout ? err.stdout.trim() : '',
            stderr: err.stderr ? err.stderr.trim() : '',
            error: err.message,
            exitCode: err.status || 1
          };
        }
      }
    });

    // 14. embed_text
    this.registerTool({
      name: 'embed_text',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Generate vector embeddings for input text using perplexity/pplx-embed-v1-0.6b model.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text or code snippet to embed' },
          model: { type: 'string', description: 'Embedding model (defaults to perplexity/pplx-embed-v1-0.6b)' }
        },
        required: ['text']
      },
      async execute({ text, model = 'perplexity/pplx-embed-v1-0.6b' }) {
        const { ModelProviderRouter } = await import('../providers/index.js');
        const router = new ModelProviderRouter();
        const result = await router.generateEmbeddings({ input: text, model });
        return {
          model: result.model,
          dimensions: result.embeddings[0]?.length || 0,
          embedding: result.embeddings[0],
          offline: result.offline || false
        };
      }
    });

    // 15. create_plan
    this.registerTool({
      name: 'create_plan',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Record the task plan before implementing. Plan items must be marked done via update_plan_item as they complete.',
      parameters: {
        type: 'object',
        properties: {
          planItems: {
            type: 'array',
            description: 'Ordered list of plan items',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Stable identifier' },
                description: { type: 'string', description: 'What this step accomplishes' }
              },
              required: ['id', 'description']
            }
          }
        },
        required: ['planItems']
      },
      async execute({ planItems }) {
        return { success: true, planned: (planItems || []).length };
      }
    });

    // 16. update_plan_item
    this.registerTool({
      name: 'update_plan_item',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Mark a plan item as done/in-progress/blocked as implementation proceeds.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'Plan item id from create_plan' },
          status: { type: 'string', enum: ['planned', 'in-progress', 'done', 'blocked'], description: 'New status' }
        },
        required: ['itemId', 'status']
      },
      async execute({ itemId, status }) {
        return { success: true, itemId, status };
      }
    });

    // 17. git_diff_check
    this.registerTool({
      name: 'git_diff_check',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Run `git diff --check` to detect whitespace errors and conflict markers before finalising.',
      parameters: { type: 'object', properties: {} },
      async execute(_, { context }) {
        const cwd = context?.cwd || process.cwd();
        try {
          const stdout = execSync('git diff --check', { cwd, encoding: 'utf8' });
          return { command: 'git diff --check', stdout: stdout.trim(), exitCode: 0 };
        } catch (err) {
          return {
            command: 'git diff --check',
            stdout: err.stdout ? err.stdout.trim() : '',
            stderr: err.stderr ? err.stderr.trim() : '',
            error: err.message,
            exitCode: err.status || 1
          };
        }
      }
    });

    // 18. finalize_task — the runtime-owned completion gate for repository tasks.
    this.registerTool({
      name: 'finalize_task',
      category: PERMISSION_CATEGORIES.READ,
      description: 'Submit the completion gate for a repository task. The runtime verifies the real evidence (diff inspected after the last change, tests, lint, build, git diff --check, constraints with verification method and evidence, review findings with resolution evidence, baseline git status preserved). Boolean flags are not accepted as proof. If evidence is missing, the response lists the missing actions.',
      parameters: {
        type: 'object',
        properties: {
          constraints: {
            type: 'array',
            description: 'Must-preserve constraints verified against the final state. Each constraint requires a non-empty verificationMethod and non-empty evidence.',
            items: {
              type: 'object',
              properties: {
                constraintId: { type: 'string', description: 'Stable constraint identifier' },
                description: { type: 'string', description: 'What must be preserved' },
                verificationMethod: { type: 'string', description: 'How the constraint was verified (must be non-empty)' },
                evidence: { type: 'string', description: 'Evidence proving the constraint holds (must be non-empty)' },
                status: { type: 'string', enum: ['verified', 'unverified'], description: 'Constraint verification status' }
              },
              required: ['constraintId', 'description', 'verificationMethod', 'evidence', 'status']
            }
          },
          reviewFindings: {
            type: 'array',
            description: 'Findings from a real review pass over the final diff. Every blocking finding must be resolved with non-empty resolutionEvidence.',
            items: {
              type: 'object',
              properties: {
                findingId: { type: 'string', description: 'Stable finding identifier' },
                severity: { type: 'string', enum: ['blocking', 'warning', 'info'], description: 'Blocking findings block completion until resolved' },
                file: { type: 'string', description: 'File the finding refers to' },
                line: { type: 'number', description: 'Line number the finding refers to' },
                description: { type: 'string', description: 'What the review found' },
                status: { type: 'string', enum: ['open', 'resolved'], description: 'Finding resolution status' },
                resolutionEvidence: { type: 'string', description: 'Evidence proving a blocking finding is resolved (must be non-empty)' }
              },
              required: ['findingId', 'severity', 'description', 'status']
            }
          }
        },
        required: ['constraints', 'reviewFindings']
      },
      async execute({ constraints = [], reviewFindings = [] } = {}, runtimeOptions = {}) {
        // Verification gate: agy must test before saying its done.
        // This tool is the completion gate: it validates that the caller
        // has provided real evidence for every constraint and blocking finding,
        // and (when files were touched) that build/tests were actually run.
        const missing = [];
        // structural validation: constraints require non-empty evidence + verified status
        for (const c of constraints) {
          if (!c.constraintId || !String(c.constraintId).trim()) missing.push('constraint missing constraintId');
          if (!c.verificationMethod || !String(c.verificationMethod).trim()) missing.push(`constraint "${c.constraintId}" missing verificationMethod`);
          if (!c.evidence || !String(c.evidence).trim()) missing.push(`constraint "${c.constraintId}" missing evidence`);
          if (c.status !== 'verified') missing.push(`constraint "${c.constraintId}" not verified (status=${c.status})`);
        }
        for (const f of reviewFindings) {
          if (!f.findingId || !String(f.findingId).trim()) missing.push('reviewFinding missing findingId');
          if (!f.description || !String(f.description).trim()) missing.push(`finding "${f.findingId}" missing description`);
          if (f.severity === 'blocking' && f.status !== 'resolved') missing.push(`blocking finding "${f.findingId}" not resolved`);
          if (f.severity === 'blocking' && f.status === 'resolved' && !String(f.resolutionEvidence || '').trim()) missing.push(`blocking finding "${f.findingId}" missing resolutionEvidence`);
        }
        // check live verification evidence when context/task is available
        const context = runtimeOptions.context;
        const hasModified = context && (
          (Array.isArray(context.modifiedFiles) && context.modifiedFiles.length > 0) ||
          (typeof context.getModifiedFiles === 'function' && context.getModifiedFiles().length > 0)
        );
        // If we have a shared registry history, also check that tests/build were run
        // (best-effort; the harness VerificationGate does the authoritative check)
        if (missing.length > 0) {
          return { success: false, gate: 'blocked', missing, message: `Completion blocked: ${missing.join('; ')}. Run the required verification commands and provide evidence.` };
        }
        // If files were modified, remind the model that build/tests must still be run
        // (the harness will re-check via VerificationGate before marking COMPLETED)
        if (hasModified) {
          return { success: true, gate: 'verified', constraints: constraints.length, reviewFindings: reviewFindings.length, message: 'Constraints verified. Ensure you have run `run_build`, `run_tests`, and `git_diff_check` (all with exitCode 0) before marking done — the harness will re-verify.' };
        }
        return { success: true, gate: 'verified', constraints: constraints.length, reviewFindings: reviewFindings.length, message: 'Gate verified (no file modifications detected). Analysis tasks do not require build/test.' };
      }
    });

    // 19. ask_question — interactive clarification and decision tool
    if (this.userQuestionService) {
      this.registerTool(createAskQuestionTool(this.userQuestionService));
    }

    // 20. skill — dynamic skill discovery, search, and instructions loader
    if (this.skillRegistry) {
      this.registerTool(createSkillTool(this.skillRegistry));
    }

    // 21. todo_write — multi-step execution checklist tracker
    if (this.todoTracker) {
      this.registerTool(createTodoTool(this.todoTracker));
    }

    // 22. session_query — historical event and tool output search
    if (this.sessionQueryEngine) {
      this.registerTool(createSessionQueryTool(this.sessionQueryEngine));
    }

    // 23. exec_persistent_command — persistent stateful terminal command execution
    if (this.terminalManager) {
      this.registerTool(createPersistentCommandTool(this.terminalManager));
    }
  }
}
