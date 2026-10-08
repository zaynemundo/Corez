/**
 * Model id consistency contract.
 *
 * CoreZ's text pipeline runs exactly one model at a time, and nothing fails
 * loudly when its id drifts: the specialist swarm was once unroutable for an
 * unknown period because `deepseek-flash` was duplicated across the worker,
 * the agent core, the CLI and 17 `.opencode/agents/*.md` bindings while the
 * OpenCode Go catalog only served versioned ids. The same class of failure
 * applies to the current single model, `muse-spark-1.3-contributor`.
 *
 * These tests make that drift fail in CI instead:
 *   1. `resolveTextModel` clamps anything outside the allow-list.
 *   2. Every text-model id referenced in first-party source must be an
 *      allowed (or explicitly retired) id.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

import {
  ALLOWED_TEXT_MODELS,
  DEFAULT_TEXT_MODEL,
  MUSE_SPARK_1_3_CONTRIBUTOR,
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
 * Text-model id shapes policed in first-party source: DeepSeek (historical)
 * and Muse Spark (current). Other vendors and the image/vision models are
 * separate capabilities.
 */
const TEXT_MODEL_ID_PATTERN = /(?:deepseek|muse-spark)-[a-z0-9][a-z0-9.-]*/gi;

/**
 * Tokens that match the id shape but are not model ids: npm package scopes
 * such as `@deepseek-ai/dsh-agent-loop`, and provider labels such as
 * `DeepSeek-direct` used in comments about routes that no longer exist.
 */
const NON_MODEL_TOKENS = new Set(['deepseek-ai', 'deepseek-direct']);

/**
 * The canonical module is exempt: it documents the replaced id on purpose.
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
  it('pins Muse Spark 1.3 Contributor as the default text model', () => {
    expect(DEFAULT_TEXT_MODEL).toBe(MUSE_SPARK_1_3_CONTRIBUTOR);
    expect(MUSE_SPARK_1_3_CONTRIBUTOR).toBe('muse-spark-1.3-contributor');
    expect(ALLOWED_TEXT_MODELS).toContain('muse-spark-1.3-contributor');
  });

  it('allows only ids on the allow-list', () => {
    expect(isAllowedTextModel('muse-spark-1.3-contributor')).toBe(true);
    for (const bad of [
      'deepseek-v4.1-flash',
      'deepseek-flash',
      'deepseek-v4-flash',
      'muse-spark-1.2-contributor',
      'muse-spark-1.3-contributor-free',
      'kimi-k3',
      '',
      '  ',
      null,
      undefined,
      42,
    ]) {
      expect(isAllowedTextModel(bad), `${String(bad)} must not be allowed`).toBe(false);
    }
  });

  it('clamps every rejected candidate to the pinned default', () => {
    // The stale ids that previously broke the swarm, plus typos and empties.
    for (const bad of ['deepseek-v4.1-flash', 'deepseek-flash', 'muse-spark-1.3-contributr', '', undefined, null]) {
      expect(resolveTextModel(bad)).toBe(MUSE_SPARK_1_3_CONTRIBUTOR);
    }
    expect(resolveTextModel('muse-spark-1.3-contributor')).toBe('muse-spark-1.3-contributor');
    expect(resolveTextModel('  muse-spark-1.3-contributor  ')).toBe('muse-spark-1.3-contributor');
  });

  it('uses no stale or unknown text-model id anywhere in first-party source', () => {
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
        const ids = text.match(TEXT_MODEL_ID_PATTERN) || [];
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
      `Unknown text-model id(s) found. Update modelIds.js or the reference:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
