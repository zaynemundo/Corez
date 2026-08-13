#!/usr/bin/env node
// COREZ live skills verification — drives every specialist skill through the
// real worker module with the real provider key, mirroring the frontend flow:
//   1. resolveSkills() selects the matching specialist skill(s)
//   2. the resolved skill instructions are passed to /api/ai
//   3. the response is scored with the strict evaluator
// Writes test_results/chat-skills-test-<date>.md + raw JSON.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSkills } from '../src/skills/resolver.js';
import { evaluateCase } from '../benchmarks/evaluator-core.js';
import {
  buildRuntimeContext,
  runVerificationWithRepair,
  SKILL_RISK_LEVELS
} from '../worker/skillVerification.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'test_results');

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

const worker = (await import('../worker/entry.js')).default;
const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  __COREZ_RETRY_SLEEP_MS: '0',
  OPENCODE_GO_API_KEY: key
};

const allCases = [
  { id: 'research-report', prompt: 'Write me a research report on the benefits of electric vehicles, citing sources.', required: ['electric', 'source'] },
  { id: 'document-generation', prompt: 'Draft a service contract for my freelance web design work.', required: ['contract'] },
  { id: 'data-analysis', prompt: 'Analyze this data: monthly sales were 12000, 15000, 9000, 16000, 21000. What is the trend?', required: ['trend'] },
  { id: 'marketing-copywriting', prompt: 'Write launch copy and a tagline for my new coffee brand.', required: ['coffee', 'tagline'] },
  { id: 'translation-localization', prompt: 'Translate this into Spanish: "Welcome to our website. Feel free to browse our products."', required: ['Bienvenido'], minLength: 40 },
  { id: 'live-data-utilities', prompt: 'Convert 25000 PHP to USD.', required: ['USD'], minLength: 40 },
  { id: 'education-tutor', prompt: 'Teach me the basics of how CSS Flexbox works.', required: ['flex'] },
  { id: 'accessibility-compliance', prompt: 'Explain how to make a form accessible for screen readers.', required: ['screen reader', 'aria'] },
  { id: 'business-planning', prompt: 'Help me plan a coffee shop startup: pricing and go-to-market.', required: ['pricing', 'market'] },
  { id: 'resume-career', prompt: 'Write 3 resume bullet points for a data analyst role.', required: ['data'] },
  { id: 'creative-writing', prompt: 'Write me a short story about a lighthouse keeper.', required: ['light'], minLength: 120 },
  { id: 'presentation-design', prompt: 'Outline a 5-slide presentation about remote work productivity.', required: ['slide'], minLength: 120 },
  { id: 'personal-productivity', prompt: 'Plan my day: I have a report due, a team meeting, and I want to exercise.', requiredAny: [['priority', 'prioritized', 'priorities', 'prioritize', 'most important', 'mit', 'non-negotiable']], minLength: 120 },
  { id: 'personal-finance', prompt: 'Build a monthly budget for a family with 40000 PHP income.', required: ['budget'], minLength: 120 },
  { id: 'travel-planning', prompt: 'Plan a 3-day itinerary in Cebu.', required: ['Cebu'], minLength: 120 },
  { id: 'fitness-nutrition', prompt: 'Build me a beginner home workout plan with no equipment.', required: ['plan', 'beginner'], minLength: 120 },
  { id: 'event-planning', prompt: 'Give me a birthday party planning checklist for 20 guests.', required: ['checklist'] },
  { id: 'study-aids', prompt: 'Make me a 5-question quiz on World War II with an answer key.', required: ['quiz', 'answer'] },
  { id: 'meeting-notes', prompt: 'Summarize these meeting notes and list action items: Team agreed to launch in June. Maria owns the landing page. John will finalize pricing by Friday. Next sync Wednesday.', required: ['action'] }
];

const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const onlyIds = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map((id) => id.trim()).filter(Boolean))
  : null;
const cases = onlyIds ? allCases.filter((item) => onlyIds.has(item.id)) : allCases;
if (cases.length === 0) {
  console.error('No live skill cases matched --only.');
  process.exit(1);
}

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

function shouldRetryCase(item, apiResult) {
  if (!apiResult.ok) return true;
  if (apiResult.diagnostics?.verification?.passed === false) return true;
  if (['research-report', 'live-data-utilities'].includes(item.id)
    && apiResult.diagnostics?.liveData?.answerGrounded !== true) return true;
  const text = String(apiResult.content || '').toLowerCase();
  if ((item.required || []).some((term) => !text.includes(term.toLowerCase()))) return true;
  if ((item.requiredAny || []).some((group) => !group.some((term) => text.includes(term.toLowerCase())))) return true;
  if (Number.isFinite(item.minLength) && text.length < item.minLength) return true;
  return false;
}

const results = [];
for (const item of cases) {
  // Step 1: resolver must activate the target skill for this prompt.
  const resolved = resolveSkills({ intent: 'general', prompt: item.prompt });
  const activated = resolved.skills.map((s) => s.id);
  const skillSelected = activated.includes(item.id);
  const skillObjs = resolved.skills.filter((s) => s.id === item.id);

  // Step 2: live AI call with the skill instructions injected (frontend flow).
  let apiResult;
  let requestAttempts = 0;
  do {
    requestAttempts += 1;
    apiResult = await callAi({ prompt: item.prompt, skills: skillObjs });
  } while (requestAttempts < 3 && shouldRetryCase(item, apiResult));
  // Step 3: use the exact production verifier verdict returned by /api/ai.
  // Re-running here without the worker's private search evidence previously
  // produced misleading passes that disagreed with production verification.
  const productionVerification = apiResult.diagnostics?.verification;
  const verification = productionVerification && Array.isArray(productionVerification.results)
    ? { ...productionVerification, content: apiResult.content || '' }
    : runVerificationWithRepair({
        prompt: item.prompt,
        content: apiResult.content || '',
        skills: skillObjs.length > 0 ? skillObjs : [{ id: item.id }],
        runtimeContext: buildRuntimeContext()
      });
  const verdict = evaluateCase({
    content: verification.content,
    caseDef: {
      prompt: item.prompt,
      required: item.required,
      requiredAny: item.requiredAny || undefined,
      minLength: item.minLength,
      skillProfile: SKILL_RISK_LEVELS[item.id] ? item.id : undefined
    },
    context: {
      stopReason: apiResult.diagnostics?.stopReason || null,
      latencyMs: apiResult.latencyMs,
      verification: {
        hardFailures: verification.hardFailures,
        results: verification.results,
        liveData: apiResult.diagnostics?.liveData || null
      }
    }
  });
  const passed = skillSelected && apiResult.ok && verdict.passed && verification.passed;
  const reasons = [];
  if (!skillSelected) reasons.push(`skill-not-activated (got: ${activated.join(', ') || 'none'})`);
  if (!apiResult.ok) reasons.push(`transport-${apiResult.status}`);
  if (verification.hardFailures.length > 0) reasons.push(`verification: ${verification.hardFailures.join(', ')}`);
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
    verification: {
      risk: SKILL_RISK_LEVELS[item.id] || 'MEDIUM',
      hardFailures: verification.hardFailures,
      results: verification.results,
      repairAttempts: verification.repairAttempts,
      latencyMs: verification.latencyMs,
      productionVerdict: Boolean(productionVerification)
    },
    liveData: apiResult.diagnostics?.liveData || null,
    usage: apiResult.diagnostics?.usage || null,
    diagnostics: apiResult.diagnostics,
    latencyMs: apiResult.latencyMs,
    requestAttempts,
    model: apiResult.model,
    content: verification.content
  });

  console.log(`[skills] ${item.id} ${passed ? 'PASS' : 'FAIL'} (${verdict.score}/5, ${apiResult.latencyMs}ms, ${apiResult.model}${skillSelected ? '' : ', SKILL NOT ACTIVATED'}${verification.hardFailures.length ? `, VERIFY: ${verification.hardFailures.join('|')}` : ''})`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.passed);
const today = new Date().toISOString().slice(0, 10);
mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const selectionSuffix = onlyIds ? `-${Array.from(onlyIds).join('-')}` : '';
const jsonPath = join(OUT_DIR, `chat-skills-raw${selectionSuffix}-${stamp}.json`);
const mdPath = join(OUT_DIR, `chat-skills-test${selectionSuffix}-${today}.md`);

writeFileSync(jsonPath, JSON.stringify(results, null, 2));

const grounded = results.filter((result) => result.liveData?.answerGrounded).length;
const refusals = results.filter((result) => result.liveData?.honestRefusal).length;
const averageScore = results.length > 0
  ? Math.round((results.reduce((sum, result) => sum + result.score, 0) / results.length) * 100) / 100
  : 0;

const groundingLabel = (result) => {
  const research = result.verification.results.find((entry) => entry.skillId === 'research-report');
  const live = result.verification.results.find((entry) => entry.skillId === 'live-data-utilities');
  if (research) return `${research.evidence?.fetchedSources || 0}/${research.evidence?.requestedSources || 0} fetched`;
  if (live?.evidence?.honestRefusal) return 'honest refusal';
  if (live) return live.evidence?.liveDataUsed ? 'live grounded' : 'not grounded';
  return '-';
};

const md = [];
md.push(`# CoreZ Live Skills Test — ${today}`);
md.push('');
md.push(`Every specialist skill driven through the real worker module (worker/entry.js), full /api/ai code path, with the resolved skill instructions injected exactly like the frontend does.`);
md.push(`- Provider: OpenCode Go (deepseek-v4-flash) via OPENCODE_GO_API_KEY`);
md.push(`- Total skills: ${results.length} | Passed: ${passed.length} | Failed: ${results.length - passed.length}`);
md.push(`- Average score: ${averageScore}/5 | Grounded live/research answers: ${grounded} | Honest live-data refusals: ${refusals}`);
md.push('');
md.push('## Case summary');
md.push('');
md.push('| # | Skill | Risk | Status | Score | Latency (ms) | Attempts | Model | Activated | Verification | Grounding | Failure reasons |');
md.push('|---|-------|------|--------|-------|--------------|----------|-------|-----------|--------------|-----------|-----------------|');
results.forEach((r, i) => {
  const reasons = r.reasons.length > 0 ? r.reasons.join('; ') : '-';
  const verify = r.verification.hardFailures.length > 0 ? r.verification.hardFailures.join(', ') : 'PASS';
  md.push(`| ${i + 1} | ${r.id} | ${r.verification.risk} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.score}/5 | ${r.latencyMs} | ${r.requestAttempts} | ${r.model} | ${r.skillSelected ? 'yes' : 'NO'} | ${verify} | ${groundingLabel(r)} | ${reasons} |`);
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
  md.push(`**Verification:** production verdict: ${r.verification.productionVerdict ? 'yes' : 'no'} | request attempts: ${r.requestAttempts} | risk ${r.verification.risk} | hard failures: ${r.verification.hardFailures.join(', ') || 'none'} | repair attempts: ${r.verification.repairAttempts} | ${r.verification.latencyMs}ms | grounding: ${groundingLabel(r)}`);
  if (r.liveData) {
    md.push(`**Live data:** required: ${r.liveData.liveDataRequired} | search fetched: ${r.liveData.searchFetched} | answer grounded: ${r.liveData.answerGrounded} | honest refusal: ${r.liveData.honestRefusal || false} | source: ${Array.isArray(r.liveData.dataSource) ? r.liveData.dataSource.join(', ') : r.liveData.dataSource} | fetched: ${r.liveData.fetchedAt} | freshnessMs: ${r.liveData.freshnessMs}`);
  }
  if (r.usage) {
    md.push(`**Usage:** initial in/out: ${r.usage.initial?.inputTokens}/${r.usage.initial?.outputTokens} | repairs: ${r.usage.repairs?.length || 0} | total in/out: ${r.usage.total?.inputTokens}/${r.usage.total?.outputTokens}`);
  }
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
