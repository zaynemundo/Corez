/**
 * Materialise the shared CoreZ package as a real directory inside
 * mobile/node_modules.
 *
 * npm links a `file:` dependency as a Windows junction. Metro 0.87 crawls the
 * junction inconsistently: it loads the package entry from the real path but
 * relative imports inside the package then miss its file map. Copying the
 * package (which is small, pure JS) removes the symlink entirely and keeps
 * Metro, Jest and tsc resolving the same canonical sources.
 *
 * Runs on postinstall and before every build/test command. The canonical files
 * stay in ../../packages/corez-shared; never edit the copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.resolve(projectRoot, '..', 'packages', 'corez-shared');
const targetRoot = path.join(projectRoot, 'node_modules', '@corez_ai', 'shared');

const SKIP_DIRECTORIES = new Set(['node_modules', '__tests__', '.git']);

if (!fs.existsSync(path.join(sourceRoot, 'package.json'))) {
  console.warn(`[sync-shared] source package not found at ${sourceRoot}; skipping.`);
  process.exit(0);
}

function hashTree(dir, hash) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    hash.update(path.relative(sourceRoot, full));
    if (fs.statSync(full).isDirectory()) hashTree(full, hash);
    else hash.update(fs.readFileSync(full));
  }
  return hash;
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    // statSync (not the Dirent type): OneDrive marks synced folders as reparse
    // points, which readdir reports as symbolic links even though they are
    // ordinary directories.
    if (fs.statSync(from).isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

function isLink(candidate) {
  try {
    return fs.lstatSync(candidate).isSymbolicLink();
  } catch {
    return false;
  }
}

// Remove the junction (or a stale copy) without ever touching the source: a
// junction is unlinked, never recursed into.
if (fs.existsSync(targetRoot) || isLink(targetRoot)) {
  if (isLink(targetRoot)) fs.unlinkSync(targetRoot);
  else fs.rmSync(targetRoot, { recursive: true, force: true });
}

copyTree(sourceRoot, targetRoot);
const digest = hashTree(sourceRoot, crypto.createHash('sha256')).digest('hex').slice(0, 12);
console.log(`[sync-shared] @corez_ai/shared synced (${digest})`);
