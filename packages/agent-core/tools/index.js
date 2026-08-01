import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { PERMISSION_CATEGORIES } from '../permissions/index.js';
import { resolveWorkspacePath } from '../runtime/pathResolver.js';
import {
  checkReadBeforeWrite,
  ensureFileLifecycle,
  ensureRelevantFile,
  recordFileRead,
  recordFileWritten
} from '../runtime/fileLifecycle.js';

// No fixed command timeout: valid builds, tests, and long-running commands
// must never be terminated prematurely. An operator may set an explicit
// hang guard via COREZ_COMMAND_TIMEOUT_MS; 0 means unlimited (default).
function commandTimeout() {
  const raw = Number(process.env.COREZ_COMMAND_TIMEOUT_MS || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.registerCoreTools();
  }

  registerTool(tool) {
    if (!tool.name) throw new Error('Tool must have a name');
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

  async executeTool(name, args, runtimeOptions = {}) {
    const tool = this.getTool(name);
    if (!tool) {
      return { error: `Unknown tool: "${name}"` };
    }

    const { context, permissionManager, autoApprove } = runtimeOptions;

    // Check permissions
    if (permissionManager) {
      const category = tool.category || PERMISSION_CATEGORIES.READ;
      const detail = args?.command || args?.filePath || args?.path || name;
      const permCheck = permissionManager.checkPermission(category, detail, { autoApprove });
      
      if (!permCheck.allowed) {
        return { error: `Permission denied for ${name}: ${permCheck.reason}` };
      }
    }

    try {
      const result = await tool.execute(args, runtimeOptions);
      if (context) {
        context.recordToolExecution(name, args, result);
        if (['write_file', 'edit_file'].includes(name) && args.filePath) {
          context.recordModifiedFile(args.filePath);
        } else if (['read_file', 'edit_file'].includes(name) && args.filePath) {
          context.recordInspectedFile(args.filePath);
        }
      }
      return result;
    } catch (err) {
      return { error: `Tool "${name}" execution error: ${err.message}` };
    }
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
      async execute({ filePath, startLine, endLine }, { context, gate }) {
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

        if (gate) {
          // Successful reads only: failed reads never count as read evidence.
          recordFileRead(gate, fullPath);
          ensureRelevantFile(gate, fullPath, { discoveredBy: 'model-read', readSuccessfully: true });
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
      async execute({ filePath, content }, { context, gate }) {
        const cwd = context?.cwd || process.cwd();
        const resolved = resolveWorkspacePath(cwd, filePath);
        if (!resolved.ok) {
          return { success: false, error: resolved.error, code: resolved.code };
        }
        const fullPath = resolved.path;

        // Read-before-write: existing files must be read successfully before
        // they may be modified. New files may be created without a read.
        if (gate) {
          const rbw = checkReadBeforeWrite(gate, fullPath);
          if (!rbw.ok) {
            return { success: false, error: rbw.error, code: rbw.code, message: rbw.message };
          }
        }

        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');

        if (gate) {
          const lifecycle = ensureFileLifecycle(gate, fullPath);
          recordFileWritten(gate, fullPath, lifecycle?.existedBeforeTask === true);
          ensureRelevantFile(gate, fullPath, {
            discoveredBy: 'model-write',
            modified: true,
            readSuccessfully: lifecycle?.readSucceeded === true
          });
        }
        
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
      async execute({ filePath, targetContent, replacementContent }, { context, gate }) {
        const cwd = context?.cwd || process.cwd();
        const resolved = resolveWorkspacePath(cwd, filePath);
        if (!resolved.ok) {
          return { success: false, error: resolved.error, code: resolved.code };
        }
        const fullPath = resolved.path;

        if (!fs.existsSync(fullPath)) {
          return { error: `File not found: ${filePath}` };
        }

        // Read-before-write: existing files must be read successfully first.
        if (gate) {
          const rbw = checkReadBeforeWrite(gate, fullPath);
          if (!rbw.ok) {
            return { success: false, error: rbw.error, code: rbw.code, message: rbw.message };
          }
        }
        
        const original = fs.readFileSync(fullPath, 'utf8');
        if (!original.includes(targetContent)) {
          return { error: `Target snippet not found in ${filePath}` };
        }
        
        const updated = original.replace(targetContent, replacementContent);
        fs.writeFileSync(fullPath, updated, 'utf8');

        if (gate) {
          const lifecycle = ensureFileLifecycle(gate, fullPath);
          recordFileWritten(gate, fullPath, lifecycle?.existedBeforeTask === true);
          ensureRelevantFile(gate, fullPath, {
            discoveredBy: 'model-write',
            modified: true,
            readSuccessfully: lifecycle?.readSucceeded === true
          });
        }
        
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
      description: 'Generate vector embeddings for input text using nvidia/nemotron-3-embed-1b:free model.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text or code snippet to embed' },
          model: { type: 'string', description: 'Embedding model (defaults to nvidia/nemotron-3-embed-1b:free)' }
        },
        required: ['text']
      },
      async execute({ text, model = 'nvidia/nemotron-3-embed-1b:free' }) {
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
      async execute(args, runtimeOptions) {
        const gate = runtimeOptions?.gate;
        if (!gate) return { error: 'finalize_task is unavailable outside the agent runtime.' };
        const { evaluateCompletionGate } = await import('../runtime/gate.js');
        const scripts = runtimeOptions?.scripts || {};
        const constraints = Array.isArray(args?.constraints) ? args.constraints : [];
        const reviewFindings = Array.isArray(args?.reviewFindings) ? args.reviewFindings : [];
        gate.constraintEvidence = constraints;
        gate.reviewResults = reviewFindings;
        const result = evaluateCompletionGate(gate, {
          availableScripts: scripts,
          constraints,
          reviewFindings
        });
        gate.finalizeAttempted = true;
        gate.finalizePassed = result.passed;
        if (result.passed) {
          return { success: true, gate: 'passed', message: 'Completion gate passed. The task may now be summarised.' };
        }
        return {
          success: false,
          gate: 'pending',
          missingActions: result.missing,
          message: `Completion gate not passed. Missing: ${result.missing.join('; ')}`
        };
      }
    });
  }
}

