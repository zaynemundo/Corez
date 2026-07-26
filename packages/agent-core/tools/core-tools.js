import fs from 'node:fs';
import path from 'node:path';
import { CorezError, ERROR_CODES } from '../contracts/errors.js';
import { PERMISSION_CATEGORIES, SENSITIVE_FILE_OPERATION } from '../permissions/index.js';
import { runProcess } from '../process/index.js';

const SEARCHABLE_FILE = /\.(js|jsx|ts|tsx|json|md|html|css|py|sh)$/i;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

function result(success, data) {
  return { success, data };
}

function failure(error) {
  if (error instanceof CorezError) throw error;
  return result(false, { error: error?.message || String(error) });
}

function relativePath(root, canonicalPath) {
  return path.relative(root, canonicalPath) || '.';
}

function selectLines(content, startLine, endLine) {
  const lines = content.split('\n');
  if (!startLine && !endLine) return { content, totalLines: lines.length };
  const start = Math.max(1, Number(startLine) || 1) - 1;
  const end = endLine ? Math.min(lines.length, Number(endLine)) : lines.length;
  return { content: lines.slice(start, end).join('\n'), totalLines: lines.length };
}

function walkFiles(sandbox, visitor) {
  const root = sandbox.resolveExisting('.');
  const walk = canonicalDirectory => {
    for (const entry of fs.readdirSync(canonicalDirectory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(canonicalDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(sandbox.resolveExisting(candidate));
      } else if (entry.isFile()) {
        visitor(sandbox.resolveExisting(candidate));
      }
    }
  };
  walk(root);
  return root;
}

function tokenizeCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    throw new CorezError(ERROR_CODES.TOOL_ARGUMENT_INVALID, 'Command must be a non-empty string.', { command });
  }
  const tokens = [];
  const matcher = /(?:[^\s'"]+|'[^']*'|"[^"]*")+/g;
  for (const token of command.match(matcher) || []) {
    tokens.push(token.replace(/^(?:'([^']*)'|"([^"]*)")$/, (_match, single, double) => single ?? double ?? token));
  }
  if (tokens.length === 0) {
    throw new CorezError(ERROR_CODES.TOOL_ARGUMENT_INVALID, 'Command must contain an executable.', { command });
  }
  return tokens;
}

function hasExternalOrTraversalPath(value) {
  const source = String(value ?? '');
  return /(^|[\s'"=:(])\//.test(source)
    || /(^|[\s'"=:(])[A-Za-z]:[\\/]/.test(source)
    || /(^|[\s'"=:(])\\\\[^\s]/.test(source)
    || /(^|[\\/\s'"=:(])\.\.(?=$|[\\/\s'"=:)])/.test(source);
}

function commandIsLexicallyContained(command) {
  tokenizeCommand(command);
  return !hasExternalOrTraversalPath(command);
}

function testFilterIsLexicallyContained(testFilter = '') {
  return typeof testFilter === 'string' && !hasExternalOrTraversalPath(testFilter);
}

async function processResult(command, cwd, options = {}) {
  const [file, ...args] = tokenizeCommand(command);
  const execution = await runProcess({ file, args, cwd, ...options });
  return result(execution.exitCode === 0, { command, ...execution });
}

function schema(name, category, description, parameters, execute, contained = () => true, autoEligible = true) {
  return { name, category, description, parameters, execute, contained, autoEligible };
}

export function createCoreTools() {
  return [
    schema('read_file', PERMISSION_CATEGORIES.READ, 'Read contents of a file from the workspace.', {
      type: 'object', properties: {
        filePath: { type: 'string', description: 'Relative file path to read' },
        startLine: { type: 'number', description: 'Optional 1-based start line' },
        endLine: { type: 'number', description: 'Optional 1-based end line' }
      }, required: ['filePath'], additionalProperties: false
    }, ({ filePath, startLine, endLine }, { sandbox }) => {
      try {
        const canonicalPath = sandbox.resolveExisting(filePath);
        const content = fs.readFileSync(canonicalPath, 'utf8');
        const selected = selectLines(content, startLine, endLine);
        return result(true, {
          filePath: relativePath(sandbox.root, canonicalPath),
          bytesRead: Buffer.byteLength(selected.content, 'utf8'),
          ...selected
        });
      } catch (error) { return failure(error); }
    }),

    schema('write_file', PERMISSION_CATEGORIES.WORKSPACE_WRITE, 'Create or overwrite a file in the workspace.', {
      type: 'object', properties: {
        filePath: { type: 'string', description: 'Relative file path to write' },
        content: { type: 'string', description: 'Full file content' }
      }, required: ['filePath', 'content'], additionalProperties: false
    }, ({ filePath, content }, { sandbox }) => {
      try {
        if (typeof content !== 'string') throw new CorezError(ERROR_CODES.TOOL_ARGUMENT_INVALID, 'File content must be a string.');
        const canonicalPath = sandbox.resolveForCreate(filePath);
        fs.mkdirSync(path.dirname(canonicalPath), { recursive: true });
        fs.writeFileSync(canonicalPath, content, 'utf8');
        return result(true, { filePath: relativePath(sandbox.root, canonicalPath), bytesWritten: Buffer.byteLength(content, 'utf8') });
      } catch (error) { return failure(error); }
    }),

    schema('edit_file', PERMISSION_CATEGORIES.WORKSPACE_WRITE, 'Replace one exact unique string snippet in a workspace file.', {
      type: 'object', properties: {
        filePath: { type: 'string', description: 'Relative file path to edit' },
        targetContent: { type: 'string', description: 'Exact unique content to replace' },
        replacementContent: { type: 'string', description: 'Replacement content' }
      }, required: ['filePath', 'targetContent', 'replacementContent'], additionalProperties: false
    }, ({ filePath, targetContent, replacementContent }, { sandbox }) => {
      try {
        if (typeof targetContent !== 'string' || typeof replacementContent !== 'string' || targetContent === '') {
          throw new CorezError(ERROR_CODES.TOOL_ARGUMENT_INVALID, 'Edit content must be non-empty target and string replacement.');
        }
        const canonicalPath = sandbox.resolveExisting(filePath);
        const original = fs.readFileSync(canonicalPath, 'utf8');
        const matches = original.split(targetContent).length - 1;
        if (matches !== 1) return result(false, { filePath: relativePath(sandbox.root, canonicalPath), error: matches === 0 ? 'Target content was not found.' : 'Target content must occur exactly once.' });
        const updated = original.replace(targetContent, replacementContent);
        fs.writeFileSync(canonicalPath, updated, 'utf8');
        return result(true, { filePath: relativePath(sandbox.root, canonicalPath), bytesWritten: Buffer.byteLength(updated, 'utf8') });
      } catch (error) { return failure(error); }
    }),

    schema('list_directory', PERMISSION_CATEGORIES.READ, 'List files and directories in a workspace directory.', {
      type: 'object', properties: { dirPath: { type: 'string', description: 'Relative directory path' } }, additionalProperties: false
    }, ({ dirPath = '.' } = {}, { sandbox }) => {
      try {
        const canonicalPath = sandbox.resolveExisting(dirPath);
        const items = fs.readdirSync(canonicalPath, { withFileTypes: true }).map(entry => ({
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: entry.isFile() ? fs.statSync(sandbox.resolveExisting(path.join(canonicalPath, entry.name))).size : undefined
        }));
        return result(true, { dirPath: relativePath(sandbox.root, canonicalPath), items });
      } catch (error) { return failure(error); }
    }),

    schema('search_files', PERMISSION_CATEGORIES.READ, 'Find workspace files whose names match a pattern.', {
      type: 'object', properties: { pattern: { type: 'string', description: 'Case-insensitive filename text' } }, required: ['pattern'], additionalProperties: false
    }, ({ pattern }, { sandbox }) => {
      try {
        if (typeof pattern !== 'string') throw new CorezError(ERROR_CODES.TOOL_ARGUMENT_INVALID, 'Search pattern must be a string.');
        const matches = [];
        const root = walkFiles(sandbox, canonicalPath => {
          if (canonicalPath.toLowerCase().includes(pattern.toLowerCase()) && matches.length < 50) matches.push(relativePath(sandbox.root, canonicalPath));
        });
        return result(true, { root: relativePath(sandbox.root, root), pattern, matches });
      } catch (error) { return failure(error); }
    }),

    schema('search_text', PERMISSION_CATEGORIES.READ, 'Search text across workspace source files.', {
      type: 'object', properties: { query: { type: 'string', description: 'Text to find' } }, required: ['query'], additionalProperties: false
    }, ({ query }, { sandbox }) => {
      try {
        if (typeof query !== 'string') throw new CorezError(ERROR_CODES.TOOL_ARGUMENT_INVALID, 'Search query must be a string.');
        const matches = [];
        walkFiles(sandbox, canonicalPath => {
          if (matches.length >= 30 || !SEARCHABLE_FILE.test(canonicalPath)) return;
          if (SENSITIVE_FILE_OPERATION.test(relativePath(sandbox.root, canonicalPath))) return;
          const content = fs.readFileSync(canonicalPath, 'utf8');
          content.split('\n').forEach((line, index) => {
            if (matches.length < 30 && line.includes(query)) matches.push({ file: relativePath(sandbox.root, canonicalPath), lineNumber: index + 1, content: line.trim() });
          });
        });
        return result(true, { query, matches });
      } catch (error) { return failure(error); }
    }),

    schema('run_command', PERMISSION_CATEGORIES.SHELL, 'Execute a command without a shell in the workspace.', {
      type: 'object', properties: { command: { type: 'string', description: 'Command and arguments' } }, required: ['command'], additionalProperties: false
    }, ({ command }, { sandbox, signal }) => processResult(command, sandbox.root, { signal }), ({ command }) => commandIsLexicallyContained(command), false),

    schema('git_status', PERMISSION_CATEGORIES.READ, 'Get the current Git status.', { type: 'object', properties: {}, additionalProperties: false },
      (_args, { sandbox, signal }) => processResult('git status --short', sandbox.root, { signal })),
    schema('git_diff', PERMISSION_CATEGORIES.READ, 'Get the current Git diff.', {
      type: 'object', properties: { staged: { type: 'boolean', description: 'Show staged changes' } }, additionalProperties: false
    }, ({ staged = false } = {}, { sandbox, signal }) => processResult(staged ? 'git diff --cached' : 'git diff', sandbox.root, { signal })),
    schema('git_log', PERMISSION_CATEGORIES.READ, 'Get recent Git commits.', {
      type: 'object', properties: { count: { type: 'integer', minimum: 1, maximum: 100, description: 'Number of commits' } }, additionalProperties: false
    }, ({ count = 5 } = {}, { sandbox, signal }) => {
      const safeCount = Number.isInteger(count) && count > 0 && count <= 100 ? count : 5;
      return processResult(`git log -n ${safeCount} --oneline`, sandbox.root, { signal });
    }),
    schema('run_tests', PERMISSION_CATEGORIES.SHELL, 'Run the project test suite.', {
      type: 'object', properties: { testFilter: { type: 'string', description: 'Optional test filter' } }, additionalProperties: false
    }, ({ testFilter = '' } = {}, { sandbox, signal }) => processResult(testFilter ? `npm test -- ${testFilter}` : 'npm test', sandbox.root, { signal }), ({ testFilter }) => testFilterIsLexicallyContained(testFilter)),
    schema('run_build', PERMISSION_CATEGORIES.SHELL, 'Run the project build.', { type: 'object', properties: {}, additionalProperties: false },
      (_args, { sandbox, signal }) => processResult('npm run build', sandbox.root, { signal })),
    schema('run_lint', PERMISSION_CATEGORIES.SHELL, 'Run the project linter.', { type: 'object', properties: {}, additionalProperties: false },
      (_args, { sandbox, signal }) => processResult('npm run lint', sandbox.root, { signal })),
    schema('embed_text', PERMISSION_CATEGORIES.NETWORK, 'Generate an embedding for text.', {
      type: 'object', properties: {
        text: { type: 'string', description: 'Text to embed' },
        model: { type: 'string', description: 'Optional embedding model' }
      }, required: ['text'], additionalProperties: false
    }, async ({ text, model = 'nvidia/nemotron-3-embed-1b:free' }) => {
      const { ModelProviderRouter } = await import('../providers/index.js');
      const embedded = await new ModelProviderRouter().generateEmbeddings({ input: text, model });
      return result(true, {
        model: embedded.model,
        dimensions: embedded.embeddings[0]?.length || 0,
        embedding: embedded.embeddings[0],
        offline: embedded.offline || false
      });
    })
  ];
}
