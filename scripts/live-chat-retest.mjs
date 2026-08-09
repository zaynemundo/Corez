#!/usr/bin/env node
// COREZ live chat retest driver — mirrors the test_results_0708 methodology.
//
// Runs the same 7 chat cases used in the original 0708 live test against the
// real worker module (worker/swarm-index.js) through the full /api/ai code
// path, with a real provider key, and writes:
//   test_results_0708/chat-retest2-raw-<date>.json
//   test_results_0708/chat-retest2-report-<date>.md
//
// Provider key is read from OPENCODE_GO_API_KEY env or .dev.vars.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateCase, followUpBreakdown } from '../benchmarks/evaluator-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'test_results_0708');

function loadKey() {
  if (process.env.OPENCODE_GO_API_KEY) return process.env.OPENCODE_GO_API_KEY;
  try {
    const vars = readFileSync(join(ROOT, '.dev.vars'), 'utf8');
    const match = vars.match(/^OPENCODE_GO_API_KEY=(.*)$/m);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const key = loadKey();
if (!key) {
  console.error('No OPENCODE_GO_API_KEY found (env or .dev.vars). Aborting.');
  process.exit(1);
}

const worker = (await import('../worker/swarm-index.js')).default;
const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  __COREZ_RETRY_SLEEP_MS: '0',
  OPENCODE_GO_API_KEY: key
};

async function callAi({ prompt, messages }) {
  const body = { prompt, ...(messages && messages.length > 0 ? { messages } : {}) };
  const startedAt = Date.now();
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

const cases = [
  {
    id: 'game-1',
    category: 'game',
    prompt: 'Build me a snake game with a score counter, speed that increases as you eat, and a game over screen.',
    caseDef: { prompt: 'Build me a snake game with a score counter, speed that increases as you eat, and a game over screen.', required: ['snake'], expectCode: true, expectGame: true, minLength: 800 }
  },
  {
    id: 'general-1',
    category: 'general',
    prompt: 'What are some good habits for staying productive when working from home?',
    caseDef: { prompt: 'What are some good habits for staying productive when working from home?', required: ['habit', 'productiv'], minLength: 200 }
  },
  {
    id: 'code-help-1',
    category: 'more',
    prompt: 'My React button click does nothing. How should I debug it?',
    caseDef: { prompt: 'My React button click does nothing. How should I debug it?', required: ['React', 'debug'], minLength: 200 }
  },
  {
    id: 'explanation-1',
    category: 'more',
    prompt: 'Explain how CSS flexbox works like I am new to web development.',
    caseDef: { prompt: 'Explain how CSS flexbox works like I am new to web development.', required: ['flex'], minLength: 300 }
  },
  {
    id: 'writing-1',
    category: 'more',
    prompt: 'Write a short product description for a minimalist AI workspace.',
    caseDef: { prompt: 'Write a short product description for a minimalist AI workspace.', required: ['workspace'], minLength: 150 }
  },
  {
    id: 'game-2-followup',
    category: 'game',
    prompt: 'Now make the snake speed up gradually instead of jumping between levels.',
    caseDef: { prompt: 'Now make the snake speed up gradually instead of jumping between levels.', expectCode: true, expectGame: true, minLength: 800, expectDelta: true }
  },
  {
    id: 'greeting-1',
    category: 'more',
    prompt: 'hi',
    caseDef: { prompt: 'hi' }
  }
];

const results = [];
let game1Content = null;
let game1Project = null;

for (const item of cases) {
  let messages = [];
  let project = null;
  if (item.id === 'game-2-followup' && game1Content) {
    messages = [
      { role: 'user', content: cases[0].prompt },
      { role: 'assistant', content: game1Content }
    ];
    project = game1Project;
  }

  const apiResult = await callAi({ prompt: item.prompt, messages });

  // Greeting short-circuit: no LLM call, no diagnostics — verify only.
  let score = null;
  let passed = false;
  let hardFailures = [];
  let aspects = null;
  let breakdown = null;
  if (item.id === 'greeting-1') {
    const content = apiResult.content || '';
    passed = apiResult.model === 'corez-greeting' && content.length > 0;
    score = 1; // fixed score for short-circuit greeting, mirroring the 0708 retest
  } else {
    const context = {
      stopReason: apiResult.diagnostics?.stopReason || null,
      latencyMs: apiResult.latencyMs
    };
    const verdict = evaluateCase({
      content: apiResult.ok ? apiResult.content : '',
      caseDef: item.caseDef,
      project,
      context
    });
    score = verdict.score;
    passed = apiResult.ok ? verdict.passed : false;
    hardFailures = verdict.hardFailures;
    aspects = verdict.aspects;
    if (item.id === 'game-2-followup') {
      breakdown = followUpBreakdown({
        content: apiResult.ok ? apiResult.content : '',
        caseDef: item.caseDef,
        project
      });
    }
  }

  results.push({
    id: item.id,
    category: item.category,
    prompt: item.prompt,
    ok: apiResult.ok,
    error: apiResult.ok ? null : `HTTP ${apiResult.status}`,
    model: apiResult.model,
    provider: apiResult.provider,
    projectState: apiResult.projectState,
    diagnostics: apiResult.diagnostics,
    latencyMs: apiResult.latencyMs,
    score,
    maxScore: 5,
    passed,
    hardFailures,
    aspects,
    breakdown,
    content: apiResult.content || ''
  });

  console.log(`[retest] ${item.id} ${passed ? 'PASS' : 'FAIL'} (${score}/5, ${apiResult.latencyMs}ms, ${apiResult.model})`);

  if (item.id === 'game-1' && apiResult.ok) {
    game1Content = apiResult.content;
    game1Project = apiResult.projectState;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.passed);
const today = new Date().toISOString().slice(0, 10);
mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonPath = join(OUT_DIR, `chat-retest2-raw-${stamp}.json`);
const mdPath = join(OUT_DIR, `chat-retest2-report-${today}.md`);

writeFileSync(jsonPath, JSON.stringify(results, null, 2));

const md = [];
md.push(`# CoreZ Chat Live Retest — ${today} (test_results_0708)`);
md.push('');
md.push(`Re-run of the same 7 chat cases from the original 0708 live test, against the current worker.`);
md.push('- Driver: real worker module (worker/swarm-index.js), full /api/ai code path');
md.push(`- Provider: OpenCode Go (deepseek-v4-flash) via OPENCODE_GO_API_KEY`);
md.push(`- Total cases: ${results.length} | Passed: ${passed.length} | Failed: ${results.length - passed.length}`);
md.push('');
md.push('## Case summary');
md.push('');
md.push('| # | Case | Category | Status | Score | Latency (ms) | Model | Provider | Truncated | Repaired | Continuity |');
md.push('|---|------|----------|--------|-------|--------------|-------|----------|-----------|----------|------------|');
results.forEach((r, i) => {
  const d = r.diagnostics || {};
  const continuity = r.breakdown
    ? `${r.breakdown.continuity}/5`
    : (r.projectState ? '-' : 'n/a (creation)');
  const truncated = d.truncationDetected === undefined ? '-' : String(d.truncationDetected);
  const repaired = d.repaired === undefined ? '-' : String(d.repaired);
  md.push(`| ${i + 1} | ${r.id} | ${r.category} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.score}/5 | ${r.latencyMs} | ${r.model} | ${r.provider || '-'} | ${truncated} | ${repaired} | ${continuity} |`);
});
md.push('');
md.push('## Full transcripts');
md.push('');
for (const r of results) {
  md.push(`### ${r.id} — ${r.category} — ${r.passed ? 'PASS' : 'FAIL'}`);
  md.push('');
  md.push(`**Prompt:** ${r.prompt}`);
  md.push('');
  md.push(`**Response (${r.latencyMs}ms, quality score ${r.score}/5):**`);
  md.push('');
  md.push('```');
  md.push(r.content || '(empty)');
  md.push('```');
  md.push('');
  if (r.breakdown) {
    md.push(`Follow-up breakdown — continuity: ${r.breakdown.continuity}/5 | change precision: ${r.breakdown.changePrecision}/5 | regression safety: ${r.breakdown.regressionSafety}/5`);
    md.push('');
  }
  if (r.hardFailures && r.hardFailures.length > 0) {
    md.push(`Hard failures: ${r.hardFailures.join('; ')}`);
    md.push('');
  }
  if (r.diagnostics) {
    md.push(`Diagnostics — truncation: ${r.diagnostics.truncationDetected} | language mismatch: ${r.diagnostics.languageMismatch} | repaired: ${r.diagnostics.repaired} (${r.diagnostics.repairAttempts} attempts) | TTFT: ${r.diagnostics.ttftMs}ms | tokens in/out: ${r.diagnostics.inputTokens}/${r.diagnostics.outputTokens} | fallback used: ${r.diagnostics.fallbackUsed}`);
    if (r.diagnostics.validation) {
      md.push(`Validation — code blocks: ${r.diagnostics.validation.codeBlockCount} | game signals: ${(r.diagnostics.validation.gameSignals || []).join(', ') || 'n/a'}`);
    }
    md.push('');
  }
}

writeFileSync(mdPath, md.join('\n'));
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
console.log(`\nSummary: ${passed.length}/${results.length} passed`);

if (passed.length < results.length) {
  process.exit(1);
}
