/**
 * Workspace path containment for every path-taking tool.
 *
 * All file operations must stay inside the workspace root. Paths are
 * normalized (Windows and POSIX separators), resolved lexically ('.'/'..'),
 * and verified against the root after realpath resolution so symbolic links
 * cannot smuggle reads or writes outside the workspace.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * True when `resolvedPath` equals the workspace root or lives underneath it.
 * Comparison is case-insensitive on Windows where the filesystem is.
 */
export function isInsideWorkspace(workspaceRoot, resolvedPath) {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(resolvedPath);
  const rootNorm = process.platform === 'win32' ? root.toLowerCase() : root;
  const targetNorm = process.platform === 'win32' ? target.toLowerCase() : target;
  return targetNorm === rootNorm || targetNorm.startsWith(rootNorm + path.sep);
}

/**
 * Realpath of the deepest existing ancestor, so that a symlinked parent
 * directory (a common escape vector) is resolved even when the target file
 * does not exist yet (e.g. a pending write).
 */
function deepestExistingRealpath(p) {
  let current = path.resolve(p);
  const missing = [];
  while (!fs.existsSync(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) return { real: path.resolve(p) };
    current = parent;
  }
  return { real: path.join(fs.realpathSync(current), ...missing) };
}

/**
 * Resolve `requestedPath` against `workspaceRoot`, rejecting any path that
 * escapes the workspace.
 *
 * Returns { ok: true, path } for an allowed absolute path, or
 * { ok: false, error, code } with codes:
 *   PATH_INVALID, PATH_NUL_BYTE, PATH_TRAVERSAL, PATH_ABSOLUTE_ESCAPE,
 *   PATH_OUTSIDE_WORKSPACE, PATH_SYMLINK_ESCAPE
 */
export function resolveWorkspacePath(workspaceRoot, requestedPath) {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0) {
    return { ok: false, error: 'Path must be a non-empty string', code: 'PATH_INVALID' };
  }
  if (requestedPath.includes('\0')) {
    return { ok: false, error: 'Path contains a NUL byte', code: 'PATH_NUL_BYTE' };
  }

  const root = path.resolve(workspaceRoot);
  const normalized = requestedPath.replace(/\\/g, '/');

  let resolved;
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/')) {
    // Absolute path (drive-qualified or POSIX-style): must stay inside root.
    resolved = path.resolve(root, normalized);
    if (!isInsideWorkspace(root, resolved)) {
      return {
        ok: false,
        error: `Absolute path escapes the workspace: ${requestedPath}`,
        code: 'PATH_ABSOLUTE_ESCAPE'
      };
    }
  } else {
    // Relative path: resolve '.'/'..' segments lexically; a '..' that would
    // climb above the root is a traversal escape.
    const stack = [];
    for (const segment of normalized.split('/')) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (stack.length === 0) {
          return {
            ok: false,
            error: `Path escapes the workspace via traversal: ${requestedPath}`,
            code: 'PATH_TRAVERSAL'
          };
        }
        stack.pop();
      } else {
        stack.push(segment);
      }
    }
    resolved = path.resolve(root, ...stack);
    if (!isInsideWorkspace(root, resolved)) {
      return {
        ok: false,
        error: `Resolved path is outside the workspace: ${requestedPath}`,
        code: 'PATH_OUTSIDE_WORKSPACE'
      };
    }
  }

  // Symlink containment: follow the deepest existing ancestor through its
  // real path; anything that lands outside the root is a symlink escape.
  try {
    const { real } = deepestExistingRealpath(resolved);
    if (!isInsideWorkspace(root, real)) {
      return {
        ok: false,
        error: `Path resolves outside the workspace via a symbolic link: ${requestedPath}`,
        code: 'PATH_SYMLINK_ESCAPE'
      };
    }
  } catch (_e) {
    // Unresolvable paths fall through to the caller's own existence checks.
  }

  return { ok: true, path: resolved };
}
