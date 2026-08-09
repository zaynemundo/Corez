#!/usr/bin/env node
// COREZ live skills verification — drives every specialist skill through the
// real worker module with the real provider key, mirroring the frontend flow:
//   1. resolveSkills() selects the matching specialist skill(s)
//   2. the resolved skill instructions are passed to /api/ai
//   3. the response is scored with the strict evaluator
// Writes test_results_0708/chat-skills-test-<date>.md + raw JSON.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSkills } from '../src/skills/resolver.js';
import { evaluateCase } from '../benchmarks/evaluator-core.js';

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

const cases = [
  { id: 'research-report', prompt: 'Write me a research report on the benefits of electric vehicles, citing sources.', required: ['electric', 'source'] },
  { id: 'document-generation', prompt: 'Draft a service contract for my freelance web design work.', required: ['contract'] },
  { id: 'data-analysis', prompt: 'Analyze this data: monthly sales were 12000, 15000, 9000, 16000, 21000. What is the trend?', required: ['trend'] },
  { id: 'marketing-copywriting', prompt: 'Write launch copy and a tagline for my new coffee brand.', required: ['coffee', 'tagline'] },
  { id: 'translation-localization', prompt: 'Translate this into Spanish: "Welcome to our website. Feel free to browse our products."', required: ['Bienvenido'] },
  { id: 'live-data-utilities', prompt: 'Convert 25000 PHP to USD.', required: ['USD'] },
  { id: 'education-tutor', prompt: 'Teach me the basics of how CSS Flexbox works.', required: ['flex'] },
  { id: 'accessibility-compliance', prompt: 'Explain how to make a form accessible for screen readers.', required: ['screen reader', 'aria'] },
  { id: 'business-planning', prompt: 'Help me plan a coffee shop startup: pricing and go-to-market.', required: ['pricing', 'market'] },
  { id: 'resume-career', prompt: 'Write 3 resume bullet points for a data analyst role.', required: ['data'] },
  { id: 'creative-writing', prompt: 'Write me a short story about a lighthouse keeper.', required: ['lighthouse'] },
  { id: 'presentation-design', prompt: 'Outline a 5-slide presentation about remote work productivity.', required: ['slide'] },
  { id: 'personal-productivity', prompt: 'Plan my day: I have a report due, a team meeting, and I want to exercise.', required: ['plan'] },
  { id: 'personal-finance', prompt: 'Build a monthly budget for a family with 40000 PHP income.', required: ['budget'] },
  { id: 'travel-planning', prompt: 'Plan a 3-day itinerary in Cebu.', required: ['Cebu'] },
  { id: 'fitness-nutrition', prompt: 'Build me a beginner home workout plan with no equipment.', required: ['workout'] },
  { id: 'event-planning', prompt: 'Give me a birthday party planning checklist for 20 guests.', required: ['checklist'] },
  { id: 'study-aids', prompt: 'Make me a 5-question quiz on World War II with an answer key.', required: ['quiz', 'answer'] },
  { id: 'meeting-notes', prompt: 'Summarize these meeting notes and list action items: Team agreed to launch in June. Maria owns the landing page. John will finalize pricing by Friday. Next sync Wednesday.', required: ['action'] }
];

async function callAi({ prompt, skills }) {
  const body = { prompt, skills };
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
    diagnostics: data.diagnostics || null,
    latencyMs: Date.now() - startedAt
  };
}

const results = [];
for (const item of cases) {
  // Step 1: resolver must activate the target skill for this prompt.
  const resolved = resolveSkills({ intent: 'general', prompt: item.prompt });
  const activated = resolved.skills.map((s) => s.id);
  const skillSelected = activated.includes(item.id);
  const skillObjs = resolved.skills.filter((s) => s.id === item.id);

  // Step 2: live AI call with the skill instructions injected (frontend flow).
  const apiResult = await callAi({ prompt: item.prompt, skills: skillObjs });
  const verdict = evaluateCase({
    content: apiResult.ok ? apiResult.content : '',
    caseDef: { prompt: item.prompt, required: item.required, minLength: 120 },
    context: { stopReason: apiResult.diagnostics?.stopReason || null, latencyMs: apiResult.latencyMs }
  });
  const passed = skillSelected && apiResult.ok && verdict.passed;
  const reasons = [];
  if (!skillSelected) reasons.push(`skill-not-activated (got: ${activated.join(', ') || 'none'})`);
  if (!apiResult.ok) reasons.push(`transport-${apiResult.status}`);
  reasons.push(...verdict.hardFailures);

  results.push({
    id: item.id,
    prompt: item.prompt,
    skillSelected,
    activatedSkills: activated,
    ok: apiResult.ok,
    score: verdict.score,
    passed,
    reasons,
    aspects: verdict.aspects,
    diagnostics: apiResult.diagnostics,
    latencyMs: apiResult.latencyMs,
    model: apiResult.model,
    content: apiResult.content || ''
  });

  console.log(`[skills] ${item.id} ${passed ? 'PASS' : 'FAIL'} (${verdict.score}/5, ${apiResult.latencyMs}ms, ${apiResult.model}${skillSelected ? '' : ', SKILL NOT ACTIVATED'})`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.passed);
const today = new Date().toISOString().slice(0, 10);
mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonPath = join(OUT_DIR, `chat-skills-raw-${stamp}.json`);
const mdPath = join(OUT_DIR, `chat-skills-test-${today}.md`);

writeFileSync(jsonPath, JSON.stringify(results, null, 2));

const md = [];
md.push(`# CoreZ Live Skills Test — ${today} (test_results_0708)`);
md.push('');
md.push(`Every specialist skill driven through the real worker module (worker/swarm-index.js), full /api/ai code path, with the resolved skill instructions injected exactly like the frontend does.`);
md.push(`- Provider: OpenCode Go (deepseek-v4-flash) via OPENCODE_GO_API_KEY`);
md.push(`- Total skills: ${results.length} | Passed: ${passed.length} | Failed: ${results.length - passed.length}`);
md.push('');
md.push('## Case summary');
md.push('');
md.push('| # | Skill | Status | Score | Latency (ms) | Model | Activated | Failure reasons |');
md.push('|---|-------|--------|-------|--------------|-------|-----------|-----------------|');
results.forEach((r, i) => {
  const reasons = r.reasons.length > 0 ? r.reasons.join('; ') : '-';
  md.push(`| ${i + 1} | ${r.id} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.score}/5 | ${r.latencyMs} | ${r.model} | ${r.skillSelected ? 'yes' : 'NO'} | ${reasons} |`);
});
md.push('');
md.push('## Full transcripts');
md.push('');
for (const r of results) {
  md.push(`### ${r.id} — ${r.passed ? 'PASS' : 'FAIL'}`);
  md.push('');
  md.push(`**Prompt:** ${r.prompt}`);
  md.push('');
  md.push(`**Skills activated:** ${r.activatedSkills.join(', ') || 'none'}`);
  md.push('');
  md.push(`**Response (${r.latencyMs}ms, quality score ${r.score}/5):**`);
  md.push('');
  md.push('```');
  md.push(r.content || '(empty)');
  md.push('```');
  md.push('');
  if (r.reasons.length > 0) {
    md.push(`Failure reasons: ${r.reasons.join('; ')}`);
    md.push('');
  }
  if (r.diagnostics) {
    md.push(`Diagnostics — repaired: ${r.diagnostics.repaired} | TTFT: ${r.diagnostics.ttftMs}ms | tokens in/out: ${r.diagnostics.inputTokens}/${r.diagnostics.outputTokens} | fallback used: ${r.diagnostics.fallbackUsed}`);
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
