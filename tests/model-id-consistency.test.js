/**
 * Model id consistency contract.
 *
 * The specialist swarm was unroutable for an unknown period because the id
 * `deepseek-flash` was duplicated across the worker, the agent core, the CLI
 * and 17 `.opencode/agents/*.md` bindings, while the OpenCode Go catalog only
 * serves versioned ids (`deepseek-v4.1-flash`). Nothing failed loudly: the
 * agent configs simply could not be resolved.
 *
 * These tests make that class of drift fail in CI instead:
 *   1. `resolveTextModel` clamps anything outside the allow-list.
 *   2. Every DeepSeek model id referenced in first-party source must be an
 *      allowed (or explicitly retired) id.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

import {
  ALLOWED_TEXT_MODELS,
  DEFAULT_TEXT_MODEL,
  DEEPSEEK_V4_1_FLASH,
  isAllowedTextModel,
  resolveTextModel,
} from '../packages/agent-core/providers/modelIds.js';

const REPO_ROOT = process.cwd();

/** Directories whose committed files must reference only live model ids. */
const SCAN_ROOTS = ['worker', 'packages', 'src', '.opencode/agents'];

/** Ids that are deliberately referenced but no longer routable. */
const RETIRED_IDS = new Set([]);

/** Ids belonging to other providers/capabilities, not the text pipeline. */
const NON_TEXT_ALLOWED = new Set([
  'deepseek-v4-flash-vision-exp', // gateway vision experiment
]);

/**
 * Tokens that match the id shape but are not model ids: npm package scopes
 * such as `@deepseek-ai/dsh-agent-loop`, and provider labels such as
 * `DeepSeek-direct` used in comments about routes that no longer exist.
 */
const NON_MODEL_TOKENS = new Set(['deepseek-ai', 'deepseek-direct']);

/**
 * The canonical module is exempt: it documents the retired id on purpose.
 */
const CANONICAL_MODULE = 'packages/agent-core/providers/modelIds.js';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (['.js', '.mjs', '.jsx', '.md', '.json'].includes(extname(full))) out.push(full);
  }
  return out;
}

describe('model id contract', () => {
  it('pins DeepSeek V4.1 Flash as the default text model', () => {
    expect(DEFAULT_TEXT_MODEL).toBe(DEEPSEEK_V4_1_FLASH);
    expect(DEEPSEEK_V4_1_FLASH).toBe('deepseek-v4.1-flash');
    expect(ALLOWED_TEXT_MODELS).toContain('deepseek-v4.1-flash');
  });

  it('allows only ids on the allow-list', () => {
    expect(isAllowedTextModel('deepseek-v4.1-flash')).toBe(true);
    for (const bad of ['deepseek-flash', 'deepseek-v4-flash', 'kimi-k3', '', '  ', null, undefined, 42]) {
      expect(isAllowedTextModel(bad), `${String(bad)} must not be allowed`).toBe(false);
    }
  });

  it('clamps every rejected candidate to the pinned default', () => {
    // The exact stale id that broke the swarm, plus a typo and an empty value.
    for (const bad of ['deepseek-flash', 'deepseek-v4.1-falsh', '', undefined, null]) {
      expect(resolveTextModel(bad)).toBe(DEEPSEEK_V4_1_FLASH);
    }
    expect(resolveTextModel('deepseek-v4.1-flash')).toBe('deepseek-v4.1-flash');
    expect(resolveTextModel('  deepseek-v4.1-flash  ')).toBe('deepseek-v4.1-flash');
  });

  it('uses no stale or unknown DeepSeek model id anywhere in first-party source', () => {
    const offenders = [];

    for (const root of SCAN_ROOTS) {
      for (const file of walk(join(REPO_ROOT, root))) {
        const rel = file.replace(REPO_ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
        if (rel === CANONICAL_MODULE) continue;
        let text;
        try {
          text = readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        // Only DeepSeek-family ids are policed here; other vendors and the
        // image/vision models are separate capabilities.
        const ids = text.match(/deepseek-[a-z0-9][a-z0-9.-]*/gi) || [];
        for (const id of ids) {
          const normalized = id.toLowerCase();
          if (
            ALLOWED_TEXT_MODELS.includes(normalized) ||
            RETIRED_IDS.has(normalized) ||
            NON_TEXT_ALLOWED.has(normalized) ||
            NON_MODEL_TOKENS.has(normalized)
          ) {
            continue;
          }
          offenders.push(`${file.replace(REPO_ROOT, '').replace(/\\/g, '/')} -> ${normalized}`);
        }
      }
    }

    expect(
      offenders,
      `Unknown DeepSeek model id(s) found. Update modelIds.js or the reference:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
