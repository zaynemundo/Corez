// Swarm pre-pass for the creation harness.
//
// Non-fast-path creation builds (complex websites/apps) run a small swarm of
// PARALLEL specialist briefs — architecture, art direction — before the
// streamed build. Each specialist answers with a short, focused contribution
// (no code), and all contributions are injected into the build context so
// the single streamed artifact is better informed on the FIRST attempt:
// fewer truncations and repair rounds means less wall time and less worker
// CPU re-streaming full artifacts.
//
// The swarm is an ENHANCEMENT, never a gate: any specialist failure falls
// back to the plain build context, and the whole pre-pass can be disabled
// with AI_SWARM_ENABLED=false. Nothing here caps what the AI may produce —
// the build stream itself is unchanged and uncapped.

import { runProviderChain } from './providerChain.js';

const SPEC_SYSTEM_PROMPT =
  'You are COREZ AI, an AI creation platform that builds websites, apps, and games. Answer directly with the requested output only.';

// Each specialist gets a focused brief and a hard word budget so the calls
// stay short and fast — the parallelism, not the prompt size, is the point.
export const SWARM_SPECIALIST_BRIEFS = Object.freeze([
  {
    role: 'architect',
    instruction:
      'Analyze the build specification below and produce a concise implementation brief: overall page structure, key sections, state and data flow, and the components that must exist. At most 200 words. Do not write code.'
  },
  {
    role: 'art-director',
    instruction:
      'Produce a concise visual direction brief: a color palette with hex values, typography, spacing rhythm, and 2-3 signature micro-interactions suited to the audience. At most 150 words. Do not write code.'
  }
]);

const DEFAULT_SWARM_TIMEOUT_MS = 25_000;

export function envFlagEnabled(env, key, defaultValue = true) {
  const value = env?.[key];
  if (value === undefined || value === null) return defaultValue;
  const str = String(value).trim().toLowerCase();
  if (str === '') return defaultValue;
  return str !== 'false' && str !== '0' && str !== 'no';
}

export function swarmEnabledFor(env) {
  return envFlagEnabled(env, 'AI_SWARM_ENABLED', true);
}

/**
 * Run all specialist briefs in parallel. Each call is a compact non-stream
 * provider request (no deltas -> minimal worker CPU). Returns:
 *   { contributions: [{ role, content, model, elapsedMs }], elapsedMs,
 *     cancelled, reason }
 * Failed specialists are dropped from contributions; if every specialist
 * fails, `reason` explains why and `contributions` is empty.
 */
export async function runSwarmSpecialists({ prompt, spec, env = {}, signal = null, sleep }) {
  const startedAt = Date.now();
  const timeoutMs = Number(env?.AI_SWARM_TIMEOUT_MS) > 0
    ? Number(env?.AI_SWARM_TIMEOUT_MS)
    : DEFAULT_SWARM_TIMEOUT_MS;
  // The same tight non-stream deadline guard the planning call uses: a hung
  // specialist surfaces quickly instead of burning the full 90s timeout.
  const chainEnv = { ...env, AI_NONSTREAM_TIMEOUT_MS: String(timeoutMs) };
  const brief = String(spec || '').trim();
  const originalRequest = String(prompt || '').trim();

  const results = await Promise.allSettled(
    SWARM_SPECIALIST_BRIEFS.map((specialist) => {
      const messages = [
        { role: 'system', content: SPEC_SYSTEM_PROMPT },
        { role: 'system', content: specialist.instruction },
        {
          role: 'user',
          content: `Original request:\n${originalRequest}\n\nBuild specification:\n${brief}`
        }
      ];
      return runProviderChain(messages, {
        env: chainEnv,
        signal,
        store: null,
        sleep,
        maxRequestRetryMs: timeoutMs
      });
    })
  );

  if (signal?.aborted) {
    return { contributions: [], elapsedMs: Date.now() - startedAt, cancelled: true };
  }

  const contributions = [];
  const failures = [];
  results.forEach((settled, index) => {
    const role = SWARM_SPECIALIST_BRIEFS[index].role;
    if (settled.status === 'fulfilled' && settled.value?.content) {
      contributions.push({
        role,
        content: settled.value.content,
        model: settled.value.model || null
      });
    } else {
      const result = settled.status === 'fulfilled' ? settled.value : null;
      failures.push(`${role}: ${result?.error || (settled.status === 'rejected' ? String(settled.reason) : 'no usable response')}`);
    }
  });

  return {
    contributions,
    elapsedMs: Date.now() - startedAt,
    cancelled: false,
    reason: contributions.length === 0
      ? (failures.slice(0, 2).join(' | ').slice(0, 300) || 'no specialist contributions')
      : null
  };
}

/**
 * Build the enriched build-context for the streamed artifact. Preserves the
 * original single-file contract and appends each specialist contribution in
 * stable role order.
 */
export function buildSwarmContext(spec, contributions) {
  const parts = [`Build specification:\n${String(spec || '').trim()}`];
  for (const contribution of contributions || []) {
    if (contribution?.role && contribution?.content) {
      parts.push(`## ${contribution.role}\n${contribution.content}`);
    }
  }
  parts.push('Deliver ONLY the complete, finished artifact as a single self-contained HTML document.');
  return parts.join('\n\n');
}
