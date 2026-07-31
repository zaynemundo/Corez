/**
 * CoreZ Prompt Critic
 *
 * Scores enriched prompts against the raw intent, checking for:
 *   - intent preservation
 *   - clarity & completeness
 *   - scope creep
 *   - execution feasibility
 *   - unnecessary assumptions
 */

import { createCriticResult } from './schemas.js';

/**
 * Scores an enriched prompt from 0-10.
 *
 * @param {string} rawPrompt       — the original user prompt
 * @param {string} enrichedPrompt  — the architect's output
 * @param {object} intent          — IntentEngine result
 * @param {object} requirements    — { explicit, inferred, forbidden }
 * @returns {object} critic result
 */
export function critiquePrompt(rawPrompt, enrichedPrompt, intent, requirements) {
  const result = createCriticResult();
  const dimensions = [];

  // 1. Intent preservation (max 2.5 points)
  const preservationScore = scoreIntentPreservation(rawPrompt, enrichedPrompt, intent);
  dimensions.push({ name: 'intentPreservation', score: preservationScore, max: 2.5 });

  // 2. Clarity (max 2.0 points)
  const clarityScore = scoreClarity(enrichedPrompt);
  dimensions.push({ name: 'clarity', score: clarityScore, max: 2.0 });

  // 3. Completeness (max 1.5 points)
  const completenessScore = scoreCompleteness(enrichedPrompt, requirements);
  dimensions.push({ name: 'completeness', score: completenessScore, max: 1.5 });

  // 4. Scope control (max 1.5 points) — lower is better
  const scopeScore = scoreScopeControl(rawPrompt, enrichedPrompt, requirements);
  dimensions.push({ name: 'scopeControl', score: scopeScore, max: 1.5 });

  // 5. Execution feasibility (max 1.5 points)
  const feasibilityScore = scoreFeasibility(enrichedPrompt);
  dimensions.push({ name: 'feasibility', score: feasibilityScore, max: 1.5 });

  // 6. Context usage (max 1.0 points)
  const contextScore = scoreContextUsage(enrichedPrompt);
  dimensions.push({ name: 'contextUsage', score: contextScore, max: 1.0 });

  // Sum and normalize to 0-10
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  result.score = Math.round(totalScore * 10) / 10;

  // Detect drift
  result.intentPreserved = preservationScore >= 2.0;
  result.intentDrift = !result.intentPreserved;

  // Build issues
  for (const dim of dimensions) {
    if (dim.score < dim.max * 0.5) {
      result.issues.push(`${dim.name} is weak (${Math.round((dim.score / dim.max) * 100)}%)`);
      result.recommendedImprovements.push(`Improve ${dim.name}`);
    }
  }

  // Specific issue checks (word-count based to avoid short-prompt over-penalty)
  const rawWords = (rawPrompt.match(/\S+/g) || []).length;
  const enrichedWords = (enrichedPrompt.match(/\S+/g) || []).length;
  if (rawWords >= 3 && enrichedWords > rawWords * 8) {
    result.issues.push('Enriched prompt is significantly longer than the original — possible over-enrichment');
    result.recommendedImprovements.push('Reduce prompt size by removing redundant elaboration');
  }

  if (!/test|validate|verify/i.test(enrichedPrompt) && enrichedPrompt.length > 100) {
    result.issues.push('No testing or validation requirements specified');
    result.recommendedImprovements.push('Add explicit test and validation requirements');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------

function scoreIntentPreservation(raw, enriched, intent) {
  const rawLower = raw.toLowerCase();
  const enrichedLower = enriched.toLowerCase();

  const rawWords = new Set(rawLower.match(/[a-z]{4,}/g) || []);
  const enrichedWords = new Set(enrichedLower.match(/[a-z]{4,}/g) || []);

  let missingCoreWords = 0;
  let totalCoreWords = 0;
  for (const word of rawWords) {
    if (['that', 'this', 'with', 'from', 'have', 'been', 'they', 'will', 'when', 'what', 'your', 'just', 'like', 'some', 'them', 'also', 'than', 'then', 'over', 'into', 'such'].includes(word)) continue;
    totalCoreWords += 1;
    if (!enrichedWords.has(word)) missingCoreWords += 1;
  }

  let score;
  if (totalCoreWords > 0) {
    score = 2.5 * (1 - missingCoreWords / totalCoreWords);
  } else {
    score = 2.5;
  }

  if (intent && intent.domain && !enrichedLower.includes(intent.domain.toLowerCase())) {
    score *= 0.8;
  }

  return Math.max(0, Math.min(2.5, score));
}

function scoreClarity(enriched) {
  let score;

  if (/#{1,3}\s|\*\*|-\s|•|\d\.\s/.test(enriched)) score = 2.0;
  else if (enriched.includes('\n- ') || enriched.includes('\n##')) score = 1.8;
  else if (enriched.split('\n').length >= 3) score = 1.5;
  else score = 1.0;

  if (enriched.length > 2000 && enriched.split('\n').length < 5) score *= 0.7;
  if (/do something|somehow|maybe|perhaps|possibly/i.test(enriched)) score *= 0.8;

  return Math.max(0, Math.min(2.0, score));
}

function scoreCompleteness(enriched, requirements) {
  const explicit = requirements?.explicit || [];
  if (explicit.length === 0) return 1.5;

  const enrichedLower = enriched.toLowerCase();
  let matched = 0;

  for (const req of explicit) {
    const keywords = req.toLowerCase().match(/[a-z]{4,}/g) || [];
    const hasMatch = keywords.some((kw) => enrichedLower.includes(kw));
    if (hasMatch) matched += 1;
  }

  return Math.max(0, Math.min(1.5, 1.5 * (matched / explicit.length)));
}

function scoreScopeControl(raw, enriched, requirements) {
  let score = 1.5;
  const forbidden = requirements?.forbidden || [];
  const enrichedLower = enriched.toLowerCase();

  // Detect forbidden terms
  for (const f of forbidden) {
    const fLower = f.toLowerCase();
    if (fLower.includes('testimonial') && /testimonial/i.test(enrichedLower)) {
      score *= 0.6;
    }
    if (fLower.includes('pricing') && /pricing.*features|paid|subscription|premium/i.test(enrichedLower)) {
      score *= 0.6;
    }
  }

  // Heuristic: if enriched prompt is >5x longer than raw and adds lots of new nouns
  if (enriched.replace(/\s+/g, ' ').length > raw.replace(/\s+/g, ' ').length * 5) {
    score *= 0.7;
  }

  return Math.max(0, Math.min(1.5, score));
}

function scoreFeasibility(enriched) {
  if (enriched.length < 20) return 0.5;

  if (/#{1,3}\s|-\s|\d\.\s/.test(enriched) && enriched.length > 50) return 1.5;
  if (enriched.split('\n').length >= 3 && enriched.length > 50) return 1.2;

  return 1.0;
}

function scoreContextUsage(enriched) {
  // Basic check: does it mention project-specific context like framework names?
  if (/\b(React|Next\.js|Vue|Svelte|Angular|Tailwind|Sass|styled-components|TypeScript|JavaScript)\b/i.test(enriched)) {
    return 1.0;
  }
  return 0.5;
}
