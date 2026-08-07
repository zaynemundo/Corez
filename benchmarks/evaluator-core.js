// COREZ strict evaluator core — pure scoring used by both the benchmark CLI
// (scripts/evaluate-benchmark.mjs) and the evaluator self-tests
// (tests/benchmark-evaluator.test.js). No I/O here: scoring is fully
// deterministic.

import {
  detectTruncation,
  extractCodeBlocks,
  syntaxCheckJS,
  validateHtmlDocument,
  checkGameRequirements,
  scoreContinuity
} from '../worker/responseProcessor.js';

export const WEIGHTS = {
  instructionAdherence: 0.2,
  functionalCorrectness: 0.25,
  conversationContinuity: 0.15,
  executionValidation: 0.15,
  completeness: 0.1,
  uxQuality: 0.1,
  efficiency: 0.05
};

export const PASS_THRESHOLD = 4.0; // /5

// Hard failure conditions that override any average score.
export function detectHardFailures({ content, caseDef, project, context }) {
  const text = String(content || '');
  const failures = [];
  const add = (reason) => { if (!failures.includes(reason)) failures.push(reason); };
  const blocks = extractCodeBlocks(text);

  if (!text.trim()) add('empty-provider-response');

  const truncation = detectTruncation(text, { stopReason: context?.stopReason || null });
  if (truncation.truncated) add(`truncated-response (${truncation.signals.join(', ')})`);

  // Required core terms (ignored core requirement). `required` is an AND
  // group; `requiredAny` holds OR-groups where at least one term must appear
  // (e.g. a CSS answer may centre with margin, flex or grid).
  const required = Array.isArray(caseDef.required) ? caseDef.required : [];
  const missing = required.filter((term) => !text.toLowerCase().includes(term.toLowerCase()));
  if (missing.length > 0) add(`ignored-core-requirement (missing: ${missing.join(', ')})`);
  const requiredAny = Array.isArray(caseDef.requiredAny) ? caseDef.requiredAny : [];
  for (const group of requiredAny) {
    if (Array.isArray(group) && group.length > 0 && !group.some((term) => text.toLowerCase().includes(term.toLowerCase()))) {
      add(`ignored-core-requirement (need one of: ${group.join(' | ')})`);
    }
  }

  // Forbidden terms (instruction adherence).
  const forbidden = Array.isArray(caseDef.mustNotContain) ? caseDef.mustNotContain : [];
  const present = forbidden.filter((term) => text.toLowerCase().includes(term.toLowerCase()));
  if (present.length > 0) add(`forbidden-term-present (${present.join(', ')})`);

  // Max length caps (adversarial brevity cases).
  if (Number.isFinite(caseDef.maxLength) && text.length > caseDef.maxLength) {
    add(`exceeds-max-length (${text.length} > ${caseDef.maxLength})`);
  }

  // Missing requested deliverable (code expected but absent).
  if (caseDef.expectCode === true && blocks.length === 0) {
    add('missing-requested-deliverable (no code block)');
  }

  // Syntax / structure validation of extracted code.
  if (blocks.length > 0) {
    const jsBlocks = blocks.filter((b) => ['js', 'javascript', 'jsx'].includes(b.lang));
    for (const block of jsBlocks) {
      const syntax = syntaxCheckJS(block.code);
      if (!syntax.ok) add(`syntax-failure (${block.lang}: ${syntax.error})`);
    }
    const htmlBlocks = blocks.filter((b) => b.lang === 'html');
    for (const block of htmlBlocks) {
      const html = validateHtmlDocument(block.code);
      if (!html.ok) add(`html-structure-failure (${html.issues.join(', ')})`);
    }
  }

  // Game requirement verification: scoring, loop, controls, collision,
  // canvas — a beautiful UI with broken game logic must not pass.
  if (caseDef.expectGame === true && blocks.length > 0) {
    const signals = checkGameRequirements(blocks.map((b) => b.code));
    const core = ['game-loop', 'scoring', 'controls'];
    const missingCore = core.filter((signal) => !signals.includes(signal));
    if (missingCore.length > 0) {
      add(`broken-game-logic (missing signals: ${missingCore.join(', ')})`);
    }
  }

  // Follow-up continuity: framework replacement / deleted functionality /
  // fabricated claims about the previous implementation.
  if (project && project.framework && project.framework !== 'unknown' && caseDef.expectFrameworkPreserved !== false) {
    const continuity = scoreContinuity({ project, response: text, userPrompt: caseDef.prompt || '' });
    if (continuity.checks['preserved-framework'] === false) {
      add('unrelated-framework-replacement-during-follow-up');
    }
    if (continuity.checks['preserved-unrelated-features'] === false) {
      add('removed-existing-functionality');
    }
    // Fabricated claim heuristic: "instead of ... previous version ..." when
    // the claimed feature never existed in the project state.
    const claimedPrevious = text.match(/instead of\b[\s\S]{0,80}?\b(previous|old|earlier|before|original)\b[\s\S]{0,120}?(\b[a-z][a-z- ]{2,30}?)\b/i);
    if (claimedPrevious) {
      const claimed = claimedPrevious[2].trim().toLowerCase();
      const known = (project.features || []).map((f) => f.toLowerCase());
      const knownMatch = known.some((f) => claimed.includes(f) || f.includes(claimed));
      if (!knownMatch) {
        add('fabricated-claim-about-existing-implementation');
      }
    }
    if (caseDef.expectDelta === true && continuity.score < 3.0) {
      add(`continuity-failure (${continuity.score.toFixed(1)}/5)`);
    }
  }

  return { hardFail: failures.length > 0, failures };
}

// Aspect scores in 0..1. `context` carries measured metrics from the runner.
export function scoreAspects({ content, caseDef, project, context }) {
  const text = String(content || '');
  const blocks = extractCodeBlocks(text);
  const c = context || {};

  // --- instruction adherence -------------------------------------------------
  const required = Array.isArray(caseDef.required) ? caseDef.required : [];
  const requiredFound = required.filter((term) => text.toLowerCase().includes(term.toLowerCase())).length;
  const requiredAny = Array.isArray(caseDef.requiredAny) ? caseDef.requiredAny : [];
  const anyGroupsMet = requiredAny.map((group) => Array.isArray(group) && group.length > 0
    ? group.some((term) => text.toLowerCase().includes(term.toLowerCase()))
    : true);
  const forbidden = Array.isArray(caseDef.mustNotContain) ? caseDef.mustNotContain : [];
  const forbiddenPresent = forbidden.filter((term) => text.toLowerCase().includes(term.toLowerCase())).length;
  const anyGroupsFailed = anyGroupsMet.filter((met) => !met).length;
  const instructionAdherence = (required.length === 0 && requiredAny.length === 0)
    ? (forbiddenPresent === 0 ? 1 : 0)
    : Math.max(0, (requiredFound / Math.max(1, required.length))
      - (forbiddenPresent + anyGroupsFailed) * 0.5);

  // --- functional correctness -------------------------------------------------
  let functionalCorrectness;
  if (caseDef.expectCode === true) {
    if (blocks.length === 0) {
      functionalCorrectness = 0.4; // hard-failed anyway (missing deliverable)
    } else {
      const signals = caseDef.expectGame ? checkGameRequirements(blocks.map((b) => b.code)) : [];
      const syntaxOk = blocks
        .filter((b) => ['js', 'javascript', 'jsx', 'html'].includes(b.lang))
        .every((b) => {
          if (b.lang === 'html') return validateHtmlDocument(b.code).ok;
          return syntaxCheckJS(b.code).ok;
        });
      functionalCorrectness = 0.35;
      if (syntaxOk) functionalCorrectness += 0.35;
      if (caseDef.expectGame) {
        functionalCorrectness += Math.min(0.3, signals.length * 0.1);
      } else {
        functionalCorrectness += 0.2;
      }
      functionalCorrectness = Math.min(1, functionalCorrectness);
    }
  } else {
    // Prose answers: functionally correct when every core requirement is
    // addressed.
    const required = Array.isArray(caseDef.required) ? caseDef.required : [];
    const allRequired = required.every((term) => text.toLowerCase().includes(term.toLowerCase()));
    functionalCorrectness = allRequired ? 1 : 0.6;
  }

  // --- conversation continuity -------------------------------------------------
  let conversationContinuity = 0.6; // fresh-turn baseline
  if (project && project.framework && project.framework !== 'unknown') {
    const continuity = scoreContinuity({ project, response: text, userPrompt: caseDef.prompt || '' });
    conversationContinuity = continuity.score / 5;
  }

  // --- execution / validation -------------------------------------------------
  let executionValidation = 1;
  if (blocks.length > 0) {
    const results = blocks
      .filter((b) => ['js', 'javascript', 'jsx', 'html'].includes(b.lang))
      .map((b) => (b.lang === 'html' ? validateHtmlDocument(b.code).ok : syntaxCheckJS(b.code).ok));
    executionValidation = results.length > 0 ? results.filter(Boolean).length / results.length : 1;
  }
  if (caseDef.expectGame === true && blocks.length > 0) {
    const signals = checkGameRequirements(blocks.map((b) => b.code));
    executionValidation = Math.min(executionValidation, Math.min(1, signals.length / 5));
  }

  // --- completeness -------------------------------------------------------------
  let completeness = 1;
  if (Number.isFinite(caseDef.minLength) && text.length < caseDef.minLength) {
    completeness = Math.max(0, text.length / caseDef.minLength);
  }
  if (Number.isFinite(caseDef.maxLength) && text.length > caseDef.maxLength) {
    completeness = Math.max(0, 1 - (text.length - caseDef.maxLength) / caseDef.maxLength);
  }

  // --- UX / output quality -------------------------------------------------------
  let uxQuality = 0.6;
  if (/\n|[-*]\s|\d+[.)]\s|^#{1,3} /.test(text)) uxQuality += 0.2;
  if (!/\b(i can'?t|unable to|as an ai language model|as a language model)\b/i.test(text)) uxQuality += 0.1;
  // Games: short brief before the code (max ~500 chars of preamble).
  if (caseDef.expectGame === true && blocks.length > 0) {
    const preamble = text.slice(0, text.indexOf('```'));
    if (preamble.length <= 500) uxQuality += 0.1;
  }
  uxQuality = Math.min(1, uxQuality);

  // --- efficiency -----------------------------------------------------------------
  let efficiency = 1;
  if (caseDef.category === 'general' && text.length > 4000) efficiency = 0.5;
  if (Number.isFinite(caseDef.minLength) && caseDef.minLength >= 1200 && text.length > 16000) efficiency = 0.5;
  if (c.latencyMs && caseDef.category === 'general' && c.latencyMs > 20000) efficiency = Math.min(efficiency, 0.7);
  if (c.latencyMs && caseDef.category === 'writing' && c.latencyMs > 15000) efficiency = Math.min(efficiency, 0.7);

  return {
    instructionAdherence,
    functionalCorrectness,
    conversationContinuity,
    executionValidation,
    completeness,
    uxQuality,
    efficiency
  };
}

// Full case verdict. Returns { score, passed, aspects, hardFailures }.
export function evaluateCase({ content, caseDef, project = null, context = {} }) {
  const hard = detectHardFailures({ content, caseDef, project, context });
  const aspects = scoreAspects({ content, caseDef, project, context });
  const weighted = Object.entries(aspects).reduce(
    (total, [aspect, value]) => total + value * (WEIGHTS[aspect] || 0),
    0
  );
  const score = Math.round(weighted * 50) / 10; // 0..5
  const passed = !hard.hardFail && score >= PASS_THRESHOLD;
  return { score, passed, aspects, hardFailures: hard.failures, passThreshold: PASS_THRESHOLD };
}

// Follow-up diagnostics: report general quality, continuity, change
// precision and regression safety separately for modification tasks.
export function followUpBreakdown({ content, caseDef, project }) {
  const continuity = project ? scoreContinuity({ project, response: String(content || ''), userPrompt: caseDef.prompt || '' }) : { score: 0, checks: {} };
  const changePrecision = caseDef.expectDelta === true
    ? (continuity.checks['implemented-requested-change'] ? 5 : 1)
    : 3;
  const regressionSafety = continuity.checks['preserved-unrelated-features'] === false ? 1 : 5;
  return {
    overall: null, // filled by the caller from evaluateCase
    continuity: continuity.score,
    changePrecision,
    regressionSafety
  };
}
