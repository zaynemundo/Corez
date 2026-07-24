/**
 * CoreZ Intent Guard
 *
 * Compares raw prompt + intent contract + improved prompt to detect
 * intent drift and scope creep.  Prevents the pipeline from silently
 * transforming "make a simple portfolio" into a WebGL CMS platform.
 */

/**
 * @param {string} rawPrompt        — original user input (immutable)
 * @param {object} contract         — IntentContract output
 * @param {string} enrichedPrompt   — what the architect produced
 * @param {object} intent           — IntentEngine result
 * @returns {object} guard result
 */
export function guardIntent(rawPrompt, contract, enrichedPrompt, intent) {
  if (!rawPrompt || !enrichedPrompt) {
    return { intentDrift: false, reason: '', violations: [] };
  }

  const violations = [];
  const rawLower = rawPrompt.toLowerCase();
  const enrichedLower = enrichedPrompt.toLowerCase();

  // 1. Size mismatch: If the enriched prompt is colossally larger, flag it
  const rawWordCount = rawPrompt.split(/\s+/).length;
  const enrichedWordCount = enrichedPrompt.split(/\s+/).length;
  if (rawWordCount > 3 && enrichedWordCount > rawWordCount * 15) {
    violations.push({
      severity: 'important',
      message: `Enriched prompt is ${Math.round(enrichedWordCount / rawWordCount)}x longer than the raw prompt — likely excessive scope expansion`,
    });
  }

  // 2. Check for explicitly forbidden additions (but skip "Do not:" / prohibition context)
  const forbiddenTerms = [
    { term: /webgl/i, message: 'WebGL was never requested' },
    { term: /CMS|content management system/i, message: 'CMS was never requested' },
    { term: /analytics/i, message: 'Analytics was never requested' },
    { term: /3D animation|three\.js/i, message: '3D animations were never requested' },
    { term: /artificial intelligence|AI assistant|machine learning/i, message: 'AI/ML integration was never requested' },
    { term: /database|backend\s*server|API endpoint|sql|mongo|postgres/i, message: 'Backend/database was never requested' },
    { term: /authentication|login|sign up|user account/i, message: 'Authentication was never requested' },
    { term: /payment|checkout|billing|subscription|stripe/i, message: 'Payment/billing was never requested' },
    { term: /cloud formation|AWS|Azure|GCP|deploy|CI\/CD|Docker/i, message: 'Cloud infrastructure was never requested' },
  ];

  const isSimpleRequest = /\b(simple|basic|quick|minimal|just|only|small)\b/i.test(rawLower);

  for (const { term, message } of forbiddenTerms) {
    if (term.test(enrichedLower) && !term.test(rawLower) && !isInProhibitionContext(enrichedPrompt, term)) {
      if (isSimpleRequest || (intent && intent.type === 'simple_edit')) {
        violations.push({ severity: 'critical', message });
      } else {
        violations.push({ severity: 'important', message });
      }
    }
  }

  // 3. Check contract violations
  if (contract && Array.isArray(contract.mustNotInvent)) {
    for (const rule of contract.mustNotInvent) {
      if (typeof rule !== 'string') continue;
      const ruleLower = rule.toLowerCase();
      if (ruleLower.includes('testimonial') && /\b(testimonials?|what our customer|client says|happy customer)\b/i.test(enrichedLower) && !isInProhibitionContext(enrichedPrompt, /testimonials?/i)) {
        violations.push({ severity: 'critical', message: 'Prompt introduces potentially fabricated testimonials' });
      }
      if (ruleLower.includes('pricing') && /\b(price.*\$|pricing.*plan|premium.*plan)\b/i.test(enrichedLower) && !isInProhibitionContext(enrichedPrompt, /pricing/i)) {
        violations.push({ severity: 'important', message: 'Prompt introduces pricing information that was not supplied' });
      }
    }
  }

  // 4. Domain drift: did we change the topic?
  if (intent && intent.domain && intent.domain.length > 0) {
    if (!enrichedLower.includes(intent.domain.toLowerCase())) {
      violations.push({
        severity: 'important',
        message: `Original domain '${intent.domain}' is absent from the enriched prompt`,
      });
    }
  }

  // 5. Over-complication of simple requests
  if (isSimpleRequest) {
    const complexitySignals = [
      /orchestrat/i,
      /multi-agent/i,
      /swarm/i,
      /complex/i,
      /enterprise/i,
      /production-ready/i,
      /high-performance/i,
    ];
    let complexSignalCount = 0;
    for (const sig of complexitySignals) {
      if (sig.test(enrichedLower) && !sig.test(rawLower)) {
        complexSignalCount += 1;
      }
    }
    if (complexSignalCount >= 3) {
      violations.push({
        severity: 'critical',
        message: 'Simple request is being over-complicated with unnecessary enterprise/complexity language',
      });
    }
  }

  const criticalCount = violations.filter((v) => v.severity === 'critical').length;
  const importantCount = violations.filter((v) => v.severity === 'important').length;
  const intentDrift = criticalCount > 0 || importantCount >= 2;

  return {
    intentDrift,
    reason: violations.filter((v) => v.severity === 'critical' || v.severity === 'important').map((v) => v.message).join('; '),
    violations,
  };
}

/**
 * Simplifies an enriched prompt when drift is detected.
 * Strips out the problematic additions while preserving the original intent.
 */
export function deEscalate(enrichedPrompt, guardResult, _intent) {
  if (!guardResult || !guardResult.violations || guardResult.violations.length === 0) {
    return enrichedPrompt;
  }

  let cleaned = enrichedPrompt;
  const allViolations = guardResult.violations;

  // Remove specific problematic phrases rather than entire lines
  const removals = [];
  for (const v of allViolations) {
    if (v.message.includes('WebGL')) removals.push(/\bWebGL\b/gi);
    if (v.message.includes('CMS')) removals.push(/\bCMS\b/gi);
    if (v.message.includes('Analytics')) removals.push(/\banalytics\b/gi);
    if (v.message.includes('Authentication')) removals.push(/\bauthentication\b/gi);
    if (v.message.includes('3D')) removals.push(/\b3D\b|three\.js/gi);
    // Remove trailing commas and "and" connectors after removal
  }

  for (const pattern of removals) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  // Clean up after removals
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s+and/gi, ' and')
    .replace(/\s+,/g, ',')
    .replace(/,\./g, '.')
    .replace(/ with ,/gi, ' with')
    .replace(/,\s*\./g, '.')
    .replace(/\s+and\s+and\s+/gi, ' and ')
    .replace(/, and\./g, '.')
    .replace(/\bwith\s*,/gi, 'with')
    .trim();

  // If everything was stripped, return just the first sentence as a safe fallback
  if (!cleaned || cleaned.length < 10) {
    const firstSentence = enrichedPrompt.split('.')[0] || enrichedPrompt;
    cleaned = firstSentence.replace(/WebGL|CMS|analytics|authentication|three\.js/gi, '').replace(/\s{2,}/g, ' ').trim();
    if (!cleaned || cleaned.length < 5) {
      cleaned = 'Build a portfolio website.';
    }
  }

  return cleaned;
}

/**
 * Checks whether a matched forbidden term appears within a "Do not:",
 * "must not", "avoid", or other prohibition context rather than as a
 * requested feature.
 */
function isInProhibitionContext(prompt, forbiddenTerm) {
  if (typeof prompt !== 'string') return false;

  // Find each occurrence of the forbidden term
  const regex = new RegExp(forbiddenTerm.source, 'gi');
  let match;
  while ((match = regex.exec(prompt)) !== null) {
    const pos = match.index;
    // Check the 120 characters before the match for prohibition language
    const contextBefore = prompt.slice(Math.max(0, pos - 120), pos).toLowerCase();
    if (/\b(do not|must not|cannot|don't|shouldn't|never|avoid|forbid|prohibited|not include)\b/.test(contextBefore)) {
      return true;
    }
  }
  return false;
}
