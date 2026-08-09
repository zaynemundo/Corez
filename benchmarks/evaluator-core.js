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

// Per-skill scoring profiles (section 20): different trust dimensions get
// different weights depending on what a skill must guarantee. A skill's
// profile is selected via caseDef.skillProfile; the default WEIGHTS table is
// untouched so existing behaviour stays stable.
export const SKILL_WEIGHT_PROFILES = {
  'live-data-utilities': {
    dimensions: ['grounding', 'factualAccuracy', 'freshness', 'instructionAdherence', 'completeness', 'formatting'],
    weights: { grounding: 0.3, factualAccuracy: 0.25, freshness: 0.2, instructionAdherence: 0.1, completeness: 0.1, formatting: 0.05 }
  },
  'research-report': {
    dimensions: ['grounding', 'factualAccuracy', 'instructionAdherence', 'completeness', 'formatting'],
    weights: { grounding: 0.35, factualAccuracy: 0.25, instructionAdherence: 0.15, completeness: 0.15, formatting: 0.1 }
  },
  'meeting-notes': {
    dimensions: ['factualAccuracy', 'assumptionDiscipline', 'instructionAdherence', 'completeness', 'formatting'],
    weights: { factualAccuracy: 0.3, assumptionDiscipline: 0.25, instructionAdherence: 0.15, completeness: 0.2, formatting: 0.1 }
  },
  'marketing-copywriting': {
    dimensions: ['instructionAdherence', 'factualAccuracy', 'assumptionDiscipline', 'completeness', 'formatting'],
    weights: { instructionAdherence: 0.3, factualAccuracy: 0.25, assumptionDiscipline: 0.2, completeness: 0.15, formatting: 0.1 }
  },
  'presentation-design': {
    dimensions: ['instructionAdherence', 'factualAccuracy', 'completeness', 'formatting'],
    weights: { instructionAdherence: 0.3, factualAccuracy: 0.3, completeness: 0.2, formatting: 0.2 }
  },
  'data-analysis': {
    dimensions: ['factualAccuracy', 'functionalCorrectness', 'instructionAdherence', 'completeness', 'formatting'],
    weights: { factualAccuracy: 0.35, functionalCorrectness: 0.3, instructionAdherence: 0.15, completeness: 0.15, formatting: 0.05 }
  },
  'personal-finance': {
    dimensions: ['factualAccuracy', 'functionalCorrectness', 'assumptionDiscipline', 'completeness', 'formatting'],
    weights: { factualAccuracy: 0.35, functionalCorrectness: 0.3, assumptionDiscipline: 0.15, completeness: 0.15, formatting: 0.05 }
  },
  'business-planning': {
    dimensions: ['instructionAdherence', 'assumptionDiscipline', 'completeness', 'formatting'],
    weights: { instructionAdherence: 0.3, assumptionDiscipline: 0.3, completeness: 0.25, formatting: 0.15 }
  },
  'travel-planning': {
    dimensions: ['functionalCorrectness', 'factualAccuracy', 'instructionAdherence', 'completeness', 'formatting'],
    weights: { functionalCorrectness: 0.3, factualAccuracy: 0.25, instructionAdherence: 0.2, completeness: 0.15, formatting: 0.1 }
  },
  'fitness-nutrition': {
    dimensions: ['safety', 'instructionAdherence', 'completeness', 'formatting'],
    weights: { safety: 0.4, instructionAdherence: 0.25, completeness: 0.25, formatting: 0.1 }
  },
  'accessibility-compliance': {
    dimensions: ['functionalCorrectness', 'instructionAdherence', 'completeness', 'formatting'],
    weights: { functionalCorrectness: 0.35, instructionAdherence: 0.3, completeness: 0.2, formatting: 0.15 }
  },
  'creative-writing': {
    dimensions: ['instructionAdherence', 'creativity', 'coherence', 'completeness', 'formatting'],
    weights: { instructionAdherence: 0.3, creativity: 0.3, coherence: 0.2, completeness: 0.15, formatting: 0.05 }
  },
  'translation-localization': {
    dimensions: ['instructionAdherence', 'factualAccuracy', 'completeness', 'formatting'],
    weights: { instructionAdherence: 0.35, factualAccuracy: 0.3, completeness: 0.2, formatting: 0.15 }
  }
};

// Hard failures produced by the Skill Verification Layer force FAIL
// regardless of the numerical score (section 21/22).
export const VERIFICATION_HARD_FAILURES = [
  'live-data-required-but-not-used', 'stale-live-data', 'fabricated-live-value',
  'fabricated-current-date', 'fabricated-current-time', 'missing-live-source',
  'live-source-fetch-failed-but-answer-presented-as-current', 'unsupported-citation',
  'fabricated-action-item', 'fabricated-owner', 'fabricated-deadline',
  'duplicate-action-item', 'unsupported-business-claim', 'unsupported-statistic',
  'fabricated-study-result', 'uncited-data-claim', 'impossible-itinerary-timeline',
  'insufficient-transfer-time', 'overlapping-activities', 'missing-travel-buffer',
  'arithmetic-error', 'percentage-error', 'trend-calculation-error',
  'unsupported-forecast', 'critical-safety-issue', 'duplicate-critical-content',
  'unlabeled-assumption'
];
const VERIFICATION_HARD_FAILURE_SET = new Set(VERIFICATION_HARD_FAILURES);

export const PASS_THRESHOLD = 4.0; // /5

// Hard failure conditions that override any average score.
export function detectHardFailures({ content, caseDef, project, context }) {
  const text = String(content || '');
  const failures = [];
  const add = (reason) => { if (!failures.includes(reason)) failures.push(reason); };
  const blocks = extractCodeBlocks(text);

  // Skill Verification Layer failures ride in via context.verification and
  // always force FAIL — a beautiful response with a fabricated live value,
  // invented action item, impossible itinerary, or arithmetic error must not
  // pass merely because it is well written.
  const verificationFailures = Array.isArray(context?.verification?.hardFailures)
    ? context.verification.hardFailures
    : [];
  for (const failure of verificationFailures) {
    if (VERIFICATION_HARD_FAILURE_SET.has(failure)) add(failure);
  }

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
  const anyGroupsMetCount = anyGroupsMet.filter(Boolean).length;
  const instructionAdherence = (required.length === 0 && requiredAny.length === 0)
    ? (forbiddenPresent === 0 ? 1 : 0)
    : Math.max(0, ((requiredFound + anyGroupsMetCount) / Math.max(1, required.length + requiredAny.length))
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
// caseDef.skillProfile switches to a skill-specific weight profile when set;
// otherwise the default WEIGHTS table is used, preserving existing behaviour.
export function evaluateCase({ content, caseDef, project = null, context = {} }) {
  const hard = detectHardFailures({ content, caseDef, project, context });
  const aspects = scoreAspects({ content, caseDef, project, context });
  const profile = SKILL_WEIGHT_PROFILES[caseDef?.skillProfile];

  let weighted;
  let score;
  if (profile) {
    // Skill profile dimensions override/add to the base aspects; dimensions
    // the profile references but the base table already computes (instruction
    // adherence, functional correctness, completeness, ...) keep their base
    // values — never silently drop to zero.
    const profileAspects = { ...aspects, ...profileAspectScores({ content, caseDef, project, context, profile }) };
    weighted = Object.entries(profile.weights).reduce(
      (total, [aspect, weight]) => total + (profileAspects[aspect] || 0) * weight,
      0
    );
    score = Math.round(weighted * 50) / 10;
    Object.assign(aspects, profileAspects);
  } else {
    weighted = Object.entries(aspects).reduce(
      (total, [aspect, value]) => total + value * (WEIGHTS[aspect] || 0),
      0
    );
    score = Math.round(weighted * 50) / 10; // 0..5
  }
  const passed = !hard.hardFail && score >= PASS_THRESHOLD;
  return { score, passed, aspects, hardFailures: hard.failures, passThreshold: PASS_THRESHOLD };
}

// Skill-profile dimension scores (0..1) for the dimensions that the default
// aspects table does not compute: grounding, factualAccuracy, freshness,
// assumptionDiscipline, safety, formatting, creativity, coherence.
export function profileAspectScores({ content, context, profile }) {
  const text = String(content || '');
  const scores = {};
  const dimensionList = profile?.dimensions || Object.keys(profile?.weights || {});
  const verification = context?.verification || {};

  if (dimensionList.includes('grounding')) {
    const research = Array.isArray(verification.results)
      ? verification.results.find((r) => r.skillId === 'research-report')
      : null;
    const evidence = research?.evidence || {};
    const grounded = Number(evidence.verifiedSources) || 0;
    const requested = Number(evidence.requestedSources) || 0;
    scores.grounding = requested > 0 ? Math.min(1, grounded / requested) : 0.6;
  }

  if (dimensionList.includes('factualAccuracy')) {
    const hardFailures = Array.isArray(verification.hardFailures) ? verification.hardFailures : [];
    const factual = hardFailures.filter((f) => [
      'fabricated-live-value', 'fabricated-current-date', 'fabricated-current-time',
      'unsupported-citation', 'unsupported-statistic', 'fabricated-study-result',
      'arithmetic-error', 'percentage-error', 'trend-calculation-error'
    ].includes(f));
    scores.factualAccuracy = factual.length === 0 ? 1 : Math.max(0, 1 - factual.length * 0.5);
  }

  if (dimensionList.includes('freshness')) {
    const live = verification.liveData || {};
    scores.freshness = live.freshnessValid === false || live.stale === true ? 0 : (live.liveDataUsed ? 1 : 0.4);
  }

  if (dimensionList.includes('assumptionDiscipline')) {
    const hardFailures = Array.isArray(verification.hardFailures) ? verification.hardFailures : [];
    scores.assumptionDiscipline = hardFailures.includes('unlabeled-assumption') ? 0.2 : 1;
  }

  if (dimensionList.includes('safety')) {
    const hardFailures = Array.isArray(verification.hardFailures) ? verification.hardFailures : [];
    scores.safety = hardFailures.includes('critical-safety-issue') ? 0 : 1;
  }

  if (dimensionList.includes('formatting')) {
    const qualityFailures = Array.isArray(verification.results)
      ? verification.results.filter((r) => ['malformed-code-fence', 'broken-inline-code', 'duplicate-critical-content', 'empty-heading'].some((f) => (r.failures || []).includes(f))).length
      : 0;
    const hasStructure = /\n|[-*]\s|^\|.*\|$|^#{1,3} /m.test(text);
    scores.formatting = qualityFailures === 0 ? (hasStructure ? 1 : 0.6) : 0.3;
  }

  if (dimensionList.includes('creativity')) {
    scores.creativity = text.length > 200 ? 0.9 : 0.7;
  }

  if (dimensionList.includes('coherence')) {
    const hardFailureText = Array.isArray(verification.hardFailures) ? verification.hardFailures.join(' ') : '';
    const truncated = /(?:truncated-response|unfinished-sentence)/i.test(hardFailureText);
    scores.coherence = truncated ? 0.3 : 1;
  }

  return scores;
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
