// FsService — DSH dsh-fs / dsh-fs capability seam parity
// Service Definition + local Provider. Consumers (tools) call ctx.fs,
// which emits capability events (fs/*) and respects workspace policy.

import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspacePath } from '../runtime/pathResolver.js';

export class FsService {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.cwd = options.cwd || process.cwd();
    // policy: workspace (default), strict, or open (for tests)
    this.policy = options.policy || 'workspace';
  }

  // DSH: ctx.fs.readFile(path, opts)
  readFile(filePath, opts = {}) {
    const cwd = opts.cwd || this.cwd;
    const resolved = resolveWorkspacePath(cwd, filePath);
    if (!resolved.ok) {
      const err = new Error(resolved.error);
      err.code = resolved.code;
      throw err;
    }
    this._emit('fs/read', { filePath, cwd });
    return fs.readFileSync(resolved.path, 'utf8');
  }

  writeFile(filePath, content, opts = {}) {
    const cwd = opts.cwd || this.cwd;
    const resolved = resolveWorkspacePath(cwd, filePath);
    if (!resolved.ok) {
      const err = new Error(resolved.error);
      err.code = resolved.code;
      throw err;
    }
    this._emit('fs/write', { filePath, cwd });
    fs.mkdirSync(path.dirname(resolved.path), { recursive: true });
    fs.writeFileSync(resolved.path, content, 'utf8');
    return { bytesWritten: Buffer.byteLength(content, 'utf8') };
  }

  readdir(dirPath, opts = {}) {
    const cwd = opts.cwd || this.cwd;
    const resolved = resolveWorkspacePath(cwd, dirPath);
    if (!resolved.ok) throw new Error(resolved.error);
    this._emit('fs/readdir', { dirPath, cwd });
    const entries = fs.readdirSync(resolved.path, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      size: e.isFile() ? fs.statSync(path.join(resolved.path, e.name)).size : undefined
    }));
  }

  exists(filePath, opts = {}) {
    const cwd = opts.cwd || this.cwd;
    const resolved = resolveWorkspacePath(cwd, filePath);
    if (!resolved.ok) return false;
    return fs.existsSync(resolved.path);
  }

  stat(filePath, opts = {}) {
    const cwd = opts.cwd || this.cwd;
    const resolved = resolveWorkspacePath(cwd, filePath);
    if (!resolved.ok) throw new Error(resolved.error);
    return fs.statSync(resolved.path);
  }

  _emit(type, payload) {
    if (this.eventBus) {
      try { this.eventBus.emit({ type, ...payload }); } catch {}
    }
  }
}
