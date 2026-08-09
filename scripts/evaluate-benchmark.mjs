#!/usr/bin/env node
// COREZ strict benchmark evaluator.
//
// Usage:
//   node scripts/evaluate-benchmark.mjs [--module] [--url <base>] [--no-key]
//     [--only general,writing,coding,game,adversarial] [--limit N]
//     [--scenarios snake-5-turn-continuity] [--all-scenarios]
//     [--out <dir>]
//
// Labels:
//   UNIT            — deterministic detector/evaluator self-checks
//   INTEGRATION     — module-level worker with a mocked provider
//   E2E             — HTTP-level /api/ai (--url)
//   LIVE PROVIDER   — module-level worker with a real provider key
//
// Outputs JSON + Markdown into --out (default benchmark-results/).

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { benchmarkCases, multiTurnScenarios, failureCases } from '../benchmarks/benchmark-cases.js';
import { evaluateCase, followUpBreakdown } from '../benchmarks/evaluator-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : join(ROOT, 'benchmark-results');

const args = process.argv.slice(2);
const onlyCategories = args.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const limit = args.includes('--limit') ? Number(process.argv[process.argv.indexOf('--limit') + 1]) : Infinity;
const scenarioIds = args.includes('--scenarios')
  ? process.argv[process.argv.indexOf('--scenarios') + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const runAllScenarios = args.includes('--all-scenarios');
const urlArg = args.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
const noKey = args.includes('--no-key');

function loadKey() {
  if (noKey) return null;
  if (process.env.OPENCODE_GO_API_KEY) return process.env.OPENCODE_GO_API_KEY;
  try {
    const vars = readFileSync(join(ROOT, '.dev.vars'), 'utf8');
    const match = vars.match(/^OPENCODE_GO_API_KEY=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function callApi({ prompt, intent, messages, project, stream }) {
  const body = {
    prompt,
    ...(intent ? { intent } : {}),
    ...(messages && messages.length > 0 ? { messages } : {}),
    ...(project ? { project } : {}),
    ...(stream ? { stream: true } : {})
  };
  const startedAt = Date.now();
  if (urlArg) {
    const response = await fetch(`${urlArg}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok && typeof data.content === 'string' && data.content.length > 0,
      status: response.status,
      content: data.content || null,
      model: data.model || null,
      provider: data.provider || null,
      projectState: data.projectState || null,
      diagnostics: data.diagnostics || null,
      latencyMs: Date.now() - startedAt
    };
  }

  // Module mode: drive the real worker entrypoint.
  const worker = (await import('../worker/swarm-index.js')).default;
  const env = {
    ASSETS: { fetch: async () => new Response('asset') },
    __COREZ_RETRY_SLEEP_MS: '0'
  };
  const key = loadKey();
  if (key) env.OPENCODE_GO_API_KEY = key;
  const response = await worker.fetch(
    new Request('https://corez.test/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return {
    ok: response.status === 200 && typeof data.content === 'string' && data.content.length > 0,
    status: response.status,
    content: data.content || null,
    model: data.model || null,
    provider: data.provider || null,
    projectState: data.projectState || null,
    diagnostics: data.diagnostics || null,
    latencyMs: Date.now() - startedAt
  };
}

function labelFor() {
  if (noKey) return 'INTEGRATION';
  if (urlArg) return 'E2E';
  return 'LIVE PROVIDER';
}

const results = [];

// ---------------------------------------------------------------------------
// Single cases (skipped when only scenarios were requested, unless explicit
// category/limit selectors were given)
// ---------------------------------------------------------------------------
const wantScenarios = runAllScenarios || scenarioIds.length > 0;
const explicitSelectors = args.includes('--only') || args.includes('--limit');
const selectedSingle = (!wantScenarios || explicitSelectors)
  ? benchmarkCases.filter((c) => !onlyCategories || onlyCategories.includes(c.category)).slice(0, limit)
  : [];
for (const caseDef of selectedSingle) {
  const apiResult = await callApi({
    prompt: caseDef.prompt,
    intent: caseDef.intent,
    messages: [],
    project: null
  });
  const context = {
    stopReason: apiResult.diagnostics?.stopReason || null,
    latencyMs: apiResult.latencyMs
  };
  const verdict = evaluateCase({
    content: apiResult.ok ? apiResult.content : '',
    caseDef,
    project: null,
    context
  });
  results.push({
    label: labelFor(),
    kind: 'single',
    id: caseDef.id,
    category: caseDef.category,
    prompt: caseDef.prompt,
    passed: apiResult.ok ? verdict.passed : false,
    score: verdict.score,
    aspects: verdict.aspects,
    hardFailures: verdict.hardFailures,
    diagnostics: apiResult.diagnostics || null,
    latencyMs: apiResult.latencyMs,
    provider: apiResult.provider,
    model: apiResult.model,
    transportError: apiResult.ok ? null : `HTTP ${apiResult.status}`,
    responseLength: apiResult.content ? apiResult.content.length : 0
  });
  process.stdout.write(`[${labelFor()}] ${caseDef.id} ${apiResult.ok && verdict.passed ? 'PASS' : 'FAIL'} (${verdict.score}/5, ${apiResult.latencyMs}ms)\n`);
}

// ---------------------------------------------------------------------------
// Multi-turn scenarios
// ---------------------------------------------------------------------------
const selectedScenarios = multiTurnScenarios.filter((s) => runAllScenarios || scenarioIds.includes(s.id));
for (const scenario of selectedScenarios) {
  let messages = [];
  let project = null;
  const turnResults = [];
  for (let i = 0; i < scenario.turns.length; i += 1) {
    const turn = scenario.turns[i];
    const apiResult = await callApi({
      prompt: turn.prompt,
      intent: turn.intent,
      messages,
      project
    });
    const context = {
      stopReason: apiResult.diagnostics?.stopReason || null,
      latencyMs: apiResult.latencyMs
    };
    const verdict = evaluateCase({
      content: apiResult.ok ? apiResult.content : '',
      caseDef: { ...turn, prompt: turn.prompt },
      project,
      context
    });
    const breakdown = followUpBreakdown({
      content: apiResult.ok ? apiResult.content : '',
      caseDef: { ...turn, prompt: turn.prompt },
      project
    });
    turnResults.push({
      turn: i + 1,
      id: `${scenario.id}-t${i + 1}`,
      prompt: turn.prompt,
      passed: apiResult.ok ? verdict.passed : false,
      score: verdict.score,
      aspects: verdict.aspects,
      hardFailures: verdict.hardFailures,
      breakdown: i > 0 ? breakdown : null,
      diagnostics: apiResult.diagnostics || null,
      latencyMs: apiResult.latencyMs,
      provider: apiResult.provider,
      model: apiResult.model,
      responseLength: apiResult.content ? apiResult.content.length : 0
    });
    process.stdout.write(`[${labelFor()}] ${scenario.id} turn ${i + 1} ${apiResult.ok && verdict.passed ? 'PASS' : 'FAIL'} (${verdict.score}/5, ${apiResult.latencyMs}ms)\n`);
    if (apiResult.ok) {
      messages = [...messages, { role: 'user', content: turn.prompt }, { role: 'assistant', content: apiResult.content }];
    } else {
      messages = [...messages, { role: 'user', content: turn.prompt }];
    }
    project = apiResult.projectState || project;
  }
  results.push({
    label: labelFor(),
    kind: 'scenario',
    id: scenario.id,
    category: 'multi-turn',
    description: scenario.description,
    passed: turnResults.every((t) => t.passed),
    score: Math.round((turnResults.reduce((sum, t) => sum + t.score, 0) / turnResults.length) * 10) / 10,
    turns: turnResults
  });
}

// ---------------------------------------------------------------------------
// Failure cases (deterministic evaluator checks — UNIT)
// ---------------------------------------------------------------------------
for (const failure of failureCases) {
  const verdict = evaluateCase({
    content: failure.content,
    caseDef: { prompt: failure.userPrompt, required: failure.required || [], expectCode: failure.expectCode === true, expectGame: failure.expectGame === true },
    project: failure.project || null,
    context: {}
  });
  const flagged = !verdict.passed && verdict.hardFailures.length > 0;
  results.push({
    label: 'UNIT',
    kind: 'failure',
    id: failure.id,
    category: 'failure',
    description: failure.label,
    passed: flagged,
    score: verdict.score,
    hardFailures: verdict.hardFailures,
    expectedReason: failure.reason,
    responseLength: failure.content.length
  });
  process.stdout.write(`[UNIT] ${failure.id} ${flagged ? 'PASS (rejected)' : 'FAIL (not rejected)'} — ${failure.label}\n`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.passed);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = join(OUT_DIR, `benchmark-${timestamp}.json`);
const mdPath = join(OUT_DIR, `benchmark-${timestamp}.md`);
writeFileSync(jsonPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: labelFor(),
  url: urlArg || null,
  summary: { total: results.length, passed: passed.length, failed: results.length - passed.length },
  results
}, null, 2));

const md = [];
md.push(`# COREZ Benchmark Report — ${new Date().toISOString()}`);
md.push('');
md.push(`Mode: **${labelFor()}**${urlArg ? ` (${urlArg})` : ''} | PASS threshold: 4.0/5 | Hard failures override the score`);
md.push('');
md.push(`## Summary`);
md.push('');
md.push(`- Total cases: ${results.length}`);
md.push(`- Passed: ${passed.length}`);
md.push(`- Failed: ${results.length - passed.length}`);
md.push('');
md.push('## Results');
md.push('');
md.push('| ID | Category | Kind | Status | Score /5 | Latency (ms) | Model | Hard failures |');
md.push('|----|----------|------|--------|----------|--------------|-------|---------------|');
for (const r of results) {
  const hard = r.hardFailures && r.hardFailures.length > 0 ? r.hardFailures.join('; ') : (r.turns ? `${r.turns.filter((t) => !t.passed).length}/${r.turns.length} turns failed` : '');
  const lat = r.latencyMs ?? (r.turns ? Math.round(r.turns.reduce((s, t) => s + t.latencyMs, 0)) : '');
  md.push(`| ${r.id} | ${r.category || 'multi-turn'} | ${r.kind} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.score} | ${lat} | ${r.model || ''} | ${hard} |`);
}
md.push('');
md.push('## Aspect detail');
md.push('');
for (const r of results) {
  if (r.kind === 'failure') {
    md.push(`### ${r.id} — ${r.description}`);
    md.push('');
    md.push(`- ${r.passed ? 'Correctly rejected' : 'NOT rejected'}: ${r.hardFailures.join('; ')}`);
    md.push('');
    continue;
  }
  if (r.kind === 'scenario') {
    md.push(`### ${r.id} — ${r.description}`);
    md.push('');
    for (const turn of r.turns) {
      md.push(`**Turn ${turn.turn}:** ${turn.prompt}`);
      md.push(`- Score: ${turn.score}/5 ${turn.passed ? 'PASS' : 'FAIL'} | ${turn.latencyMs}ms | provider: ${turn.provider || 'n/a'}`);
      if (turn.breakdown) {
        md.push(`- Follow-up breakdown — continuity: ${turn.breakdown.continuity}/5 | change precision: ${turn.breakdown.changePrecision}/5 | regression safety: ${turn.breakdown.regressionSafety}/5`);
      }
      if (turn.hardFailures.length > 0) md.push(`- Hard failures: ${turn.hardFailures.join('; ')}`);
    }
    md.push('');
    continue;
  }
  md.push(`### ${r.id} — ${r.prompt}`);
  md.push('');
  md.push(`- Score: ${r.score}/5 ${r.passed ? 'PASS' : 'FAIL'} | ${r.latencyMs}ms | provider: ${r.provider || 'n/a'} | model: ${r.model || 'n/a'}`);
  md.push(`- Response length: ${r.responseLength} chars`);
  md.push(`- Aspects — instruction: ${r.aspects?.instructionAdherence?.toFixed(2)} | functional: ${r.aspects?.functionalCorrectness?.toFixed(2)} | continuity: ${r.aspects?.conversationContinuity?.toFixed(2)} | execution: ${r.aspects?.executionValidation?.toFixed(2)} | completeness: ${r.aspects?.completeness?.toFixed(2)} | UX: ${r.aspects?.uxQuality?.toFixed(2)} | efficiency: ${r.aspects?.efficiency?.toFixed(2)}`);
  if (r.diagnostics) {
    md.push(`- Diagnostics — truncation: ${r.diagnostics.truncationDetected} | language mismatch: ${r.diagnostics.languageMismatch} | repaired: ${r.diagnostics.repaired} (${r.diagnostics.repairAttempts} attempts) | TTFT: ${r.diagnostics.ttftMs}ms | tokens in/out: ${r.diagnostics.inputTokens}/${r.diagnostics.outputTokens} | fallback used: ${r.diagnostics.fallbackUsed}`);
    if (r.diagnostics.verification) {
      const v = r.diagnostics.verification;
      md.push(`- Verification — passed: ${v.passed} | hard failures: ${(v.hardFailures || []).join(', ') || 'none'} | repair attempts: ${v.repairAttempts} | verification latency: ${v.latencyMs}ms`);
      for (const result of v.results || []) {
        md.push(`  - ${result.skillId} (${result.risk}): ${result.failures.length === 0 ? 'PASS' : result.failures.join(', ')}`);
      }
    }
    if (r.diagnostics.liveData) {
      const l = r.diagnostics.liveData;
      md.push(`- Live data — required: ${l.liveDataRequired} | used: ${l.liveDataUsed} | source: ${Array.isArray(l.dataSource) ? l.dataSource.join(', ') : l.dataSource} | fetched: ${l.fetchedAt} | freshnessMs: ${l.freshnessMs}`);
    }
    if (r.diagnostics.usage) {
      const u = r.diagnostics.usage;
      md.push(`- Usage — initial in/out: ${u.initial?.inputTokens}/${u.initial?.outputTokens} | repairs: ${u.repairs?.length || 0} | total in/out: ${u.total?.inputTokens}/${u.total?.outputTokens}`);
    }
    if (r.diagnostics.latency) {
      const lat = r.diagnostics.latency;
      md.push(`- Latency — routing: ${lat.routingMs}ms | provider: ${lat.providerMs}ms | verification: ${lat.verificationMs}ms | repair: ${lat.repairMs}ms | total: ${lat.totalMs}ms`);
    }
    if (r.diagnostics.validation) {
      md.push(`- Validation — code blocks: ${r.diagnostics.validation.codeBlockCount} | game signals: ${(r.diagnostics.validation.gameSignals || []).join(', ') || 'n/a'}`);
    }
  }
  if (r.hardFailures.length > 0) md.push(`- Hard failures: ${r.hardFailures.join('; ')}`);
  md.push('');
}

writeFileSync(mdPath, md.join('\n'));
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
console.log(`\nSummary: ${passed.length}/${results.length} passed`);

if (passed.length < results.length) {
  process.exit(1);
}
