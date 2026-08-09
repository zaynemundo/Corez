import { describe, it, expect } from 'vitest';
import {
  SKILL_HARD_FAILURE_SET,
  SKILL_RISK_LEVELS,
  RISK_LEVELS,
  MAX_REPAIR_ATTEMPTS,
  detectLiveDataNeed,
  buildRuntimeContext,
  checkTemporalClaims,
  extractNumbers,
  calcStats,
  round2,
  verifyArithmetic,
  checkOutputQuality,
  verifyLiveData,
  verifyResearch,
  extractCitations,
  verifyMeetingNotes,
  verifyMarketing,
  verifyPresentation,
  verifyDataAnalysis,
  verifyFinance,
  verifyBusiness,
  verifyTravel,
  verifyFitness,
  validateAccessibilityHtml,
  verifyProductivity,
  runSkillVerification,
  applyDeterministicPatches,
  runVerificationWithRepair
} from '../worker/skillVerification.js';
import { evaluateCase } from '../benchmarks/evaluator-core.js';

describe('live-data detection', () => {
  it('flags currency conversion', () => {
    expect(detectLiveDataNeed('Convert 25000 PHP to USD.').required).toBe(true);
    expect(detectLiveDataNeed('Convert 25000 PHP to USD.').kind).toBe('currency');
  });

  it('flags weather, time, date, stock and schedule requests', () => {
    expect(detectLiveDataNeed('What is the weather in Tokyo right now?').kind).toBe('weather');
    expect(detectLiveDataNeed('What is the current time?').kind).toBe('current-time');
    expect(detectLiveDataNeed("What's today's date?").kind).toBe('current-date');
    expect(detectLiveDataNeed('What is the current bitcoin price?').kind).toBe('crypto');
    expect(detectLiveDataNeed('What are the opening hours of the museum?').kind).toBe('schedules');
  });

  it('does not flag static questions', () => {
    expect(detectLiveDataNeed('Explain how CSS flexbox works.').required).toBe(false);
    expect(detectLiveDataNeed('Write me a poem about the ocean.').required).toBe(false);
  });
});

describe('temporal claims', () => {
  const ctx = buildRuntimeContext(new Date('2026-08-09T12:00:00Z'));
  it('accepts claims consistent with runtime context', () => {
    const result = checkTemporalClaims('As of August 9, 2026 the rate was 58.5.', ctx);
    expect(result.failures).not.toContain('stale-live-data');
  });

  it('flags a stale date as stale-live-data', () => {
    const result = checkTemporalClaims('As of January 4, 2020 the rate was 50.', ctx);
    expect(result.failures).toContain('stale-live-data');
  });

  it('flags a wrong current year as fabricated-current-date', () => {
    const result = checkTemporalClaims('The current year is 2019.', ctx);
    expect(result.failures).toContain('fabricated-current-date');
  });

  it('flags a fabricated current time', () => {
    const result = checkTemporalClaims('The current time is 03:05 UTC.', ctx);
    expect(result.failures).toContain('fabricated-current-time');
  });
});

describe('deterministic calculator', () => {
  it('computes sum, mean, median and percentage changes', () => {
    const stats = calcStats([10, 20, 30, 40]);
    expect(stats.sum).toBe(100);
    expect(stats.mean).toBe(25);
    expect(stats.median).toBe(25);
    expect(round2(stats.pctChanges[0])).toBe(100);
  });

  it('verifies arithmetic and reports mismatches', () => {
    const ok = verifyArithmetic({ expected: 427.35, actual: 427.35 });
    expect(ok.failures).toEqual([]);
    const bad = verifyArithmetic({ expected: 400, actual: 250, failure: 'arithmetic-error' });
    expect(bad.failures).toContain('arithmetic-error');
  });

  it('extracts numbers from text', () => {
    expect(extractNumbers('25,000 PHP and 1.5 hours')).toEqual([25000, 1.5]);
  });
});

describe('live-data verifier', () => {
  it('rejects a remembered value presented as current', () => {
    const result = verifyLiveData({
      prompt: 'Convert 25000 PHP to USD.',
      content: '25000 PHP is about 427 USD at the current rate.',
      runtimeContext: buildRuntimeContext()
    });
    expect(result.failures).toContain('fabricated-live-value');
    expect(result.failures).toContain('missing-live-source');
    expect(result.liveData.liveDataRequired).toBe(true);
  });

  it('accepts an honest refusal to answer from memory', () => {
    const result = verifyLiveData({
      prompt: 'Convert 25000 PHP to USD.',
      content: 'I cannot retrieve live data right now, so I cannot give you the current rate without a live data provider.',
      runtimeContext: buildRuntimeContext()
    });
    expect(result.failures).toEqual([]);
    expect(result.liveData.honestRefusal).toBe(true);
  });

  it('accepts grounded live evidence with a fresh timestamp', () => {
    const result = verifyLiveData({
      prompt: 'Convert 25000 PHP to USD.',
      content: 'As of August 9, 2026 (source: web-search), 25000 PHP converts to about 427 USD.',
      runtimeContext: buildRuntimeContext(new Date('2026-08-09T12:00:00Z')),
      liveDataEvidence: { servedAt: '2026-08-09T10:00:00Z', sources: ['Wikipedia'], fetchedAt: '2026-08-09T10:00:00Z' }
    });
    expect(result.failures).toEqual([]);
    expect(result.liveData.liveDataUsed).toBe(true);
  });

  it('flags stale live evidence', () => {
    const result = verifyLiveData({
      prompt: 'Convert 25000 PHP to USD.',
      content: '25000 PHP is 427 USD (source: web-search).',
      runtimeContext: buildRuntimeContext(new Date('2026-08-09T12:00:00Z')),
      liveDataEvidence: { servedAt: '2025-01-01T00:00:00Z', sources: ['Wikipedia'] }
    });
    expect(result.failures).toContain('stale-live-data');
  });
});

describe('research verifier', () => {
  it('extracts citations', () => {
    const citations = extractCitations('See [EV market](https://en.wikipedia.org/wiki/Electric_vehicle) and [IEA](https://www.iea.org/reports).');
    expect(citations).toHaveLength(2);
  });

  it('accepts valid, grounded citations', () => {
    const result = verifyResearch({
      prompt: 'What is the latest EV market share? Cite sources.',
      content: 'See [EV market](https://en.wikipedia.org/wiki/Electric_vehicle).',
      searchEvidence: { results: [{ url: 'https://en.wikipedia.org/wiki/Electric_vehicle' }], servedAt: '2026-08-09T10:00:00Z' }
    });
    expect(result.failures).toEqual([]);
    expect(result.evidence.groundingValid).toBe(true);
    expect(result.evidence.fetchedSources).toBe(1);
  });

  it('rejects a structurally invalid citation URL', () => {
    const result = verifyResearch({
      prompt: 'What is the latest EV market share? Cite sources.',
      content: 'See [EV market](https://not-a-valid-tld-xyz/ev).',
      searchEvidence: { results: [], servedAt: null }
    });
    expect(result.failures).toContain('unsupported-citation');
  });

  it('fails when sources were requested but none are cited', () => {
    const result = verifyResearch({
      prompt: 'What is the latest EV market share? Cite sources.',
      content: 'Electric vehicles are growing fast.',
      searchEvidence: { results: [], servedAt: null }
    });
    expect(result.failures).toContain('unsupported-citation');
  });
});

describe('meeting-notes verifier', () => {
  const source = 'Launch June. Maria owns landing page. John finalizes pricing by Friday. Next sync Wednesday.';

  it('accepts actions grounded in the source', () => {
    const result = verifyMeetingNotes({
      prompt: source,
      content: '## Confirmed Action Items\n\n| Owner | Task | Deadline |\n|---|---|---|\n| Maria | Landing page | Not specified |\n| John | Finalize pricing | Friday |',
      sourceText: source
    });
    expect(result.failures).toEqual([]);
  });

  it('rejects an invented owner and deadline', () => {
    const result = verifyMeetingNotes({
      prompt: source,
      content: '## Confirmed Action Items\n\n| Owner | Task | Deadline |\n|---|---|---|\n| Maria | Report progress Wednesday | Wednesday |\n| Jose | Resolve blockers | Friday |',
      sourceText: source
    });
    expect(result.failures).toContain('fabricated-owner');
    expect(result.failures).toContain('fabricated-deadline');
  });

  it('deduplicates identical action items', () => {
    const result = verifyMeetingNotes({
      prompt: source,
      content: '## Action Items\n- John finalizes pricing by Friday\n- John finalizes pricing by Friday',
      sourceText: source
    });
    expect(result.failures).toContain('duplicate-action-item');
  });

  it('understands Task|Owner|Deadline table orientation', () => {
    const result = verifyMeetingNotes({
      prompt: source,
      content: '## Confirmed Action Items\n\n| Task | Owner | Deadline | Status |\n|---|---|---|---|\n| Landing page | Maria | Not specified | Not started |\n| Finalize pricing | John | Friday | Not started |',
      sourceText: source
    });
    expect(result.failures).toEqual([]);
  });
});

describe('marketing verifier', () => {
  it('rejects fabricated business claims', () => {
    const result = verifyMarketing({
      prompt: 'Write launch copy for my coffee company.',
      content: 'Get 15% off your first order! We ship within 48 hours and are award-winning.'
    });
    expect(result.failures).toContain('unsupported-business-claim');
  });

  it('accepts placeholders and suggestions', () => {
    const result = verifyMarketing({
      prompt: 'Write launch copy for my coffee company.',
      content: '[Optional launch offer: 15% off your first order]. Consider offering free shipping for launch.'
    });
    expect(result.failures).toEqual([]);
  });
});

describe('presentation verifier', () => {
  it('rejects an invented statistic', () => {
    const result = verifyPresentation({
      prompt: 'Create a presentation about remote work.',
      content: '40% of workers say they are more productive at home.'
    });
    expect(result.failures).toContain('unsupported-statistic');
  });

  it('accepts statistics supplied by the user', () => {
    const result = verifyPresentation({
      prompt: 'Create a presentation about remote work. 73% of our team prefers remote.',
      content: '73% of our team prefers remote work.'
    });
    expect(result.failures).toEqual([]);
  });
});

describe('data-analysis and finance verifiers', () => {
  it('verifies sum and mean against prompt data', () => {
    const ok = verifyDataAnalysis({
      prompt: 'Sales were 12000, 15000, 9000, 16000, 21000. What is the trend?',
      content: 'Total sales were 73000, averaging 14600 per month.'
    });
    expect(ok.failures).toEqual([]);

    const bad = verifyDataAnalysis({
      prompt: 'Sales were 12000, 15000, 9000, 16000, 21000. What is the trend?',
      content: 'Total sales were 70000, averaging 14000.'
    });
    expect(bad.failures).toContain('arithmetic-error');
  });

  it('verifies a budget totals exactly the stated income', () => {
    const ok = verifyFinance({
      prompt: 'Build a monthly budget for a family with 40000 PHP income.',
      content: 'Total: 40000 PHP — 15000 rent, 8000 food, 6000 transport, 4000 savings, 7000 other.'
    });
    expect(ok.failures).toEqual([]);

    const bad = verifyFinance({
      prompt: 'Build a monthly budget for a family with 40000 PHP income.',
      content: 'Total: 38000 PHP.'
    });
    expect(bad.failures).toContain('arithmetic-error');
  });

  it('flags business figures without assumption labels', () => {
    const result = verifyBusiness({
      prompt: 'Help me plan a coffee shop startup.',
      content: 'Projected revenue is 250000 PHP per month.'
    });
    expect(result.failures).toContain('unlabeled-assumption');
  });
});

describe('travel timeline verifier', () => {
  it('rejects an impossible itinerary', () => {
    const result = verifyTravel({
      prompt: 'Plan Cebu from 8am to 6pm.',
      content: '- 10:00 canyoneering tour (duration: 3 hours)\n- 12:30 drive to Moalboal\n- 15:00 beach\n- 16:30 return to Cebu'
    });
    expect(result.failures).toContain('impossible-itinerary-timeline');
  });

  it('flags insufficient transfer time when a tight gap follows an activity', () => {
    const result = verifyTravel({
      prompt: 'Plan my day.',
      content: '- 10:00 museum visit (duration: 2 hours)\n- 12:10 lunch reservation\n- 15:00 beach'
    });
    expect(result.failures).toContain('insufficient-transfer-time');
  });

  it('rejects overlapping activities', () => {
    const result = verifyTravel({
      prompt: 'Plan my day.',
      content: '- 14:00 museum visit\n- 13:00 lunch reservation'
    });
    expect(result.failures).toContain('overlapping-activities');
  });

  it('does not compare times across different days', () => {
    const result = verifyTravel({
      prompt: 'Plan a 2-day trip.',
      content: '- Day 1: 9:00 city tour\n- Day 2: 7:00 early whale shark tour\n- Day 2: 14:00 beach'
    });
    expect(result.failures).toEqual([]);
  });
});

describe('fitness safety verifier', () => {
  it('rejects an unsafe surface for beginners', () => {
    const result = verifyFitness({
      prompt: 'Build me a beginner home workout plan.',
      content: 'Step onto a chair for step-ups — do 100 reps.'
    });
    expect(result.failures).toContain('critical-safety-issue');
  });

  it('accepts a progressive beginner plan', () => {
    const result = verifyFitness({
      prompt: 'Build me a beginner home workout plan.',
      content: 'Week 1: 3 sets of 8 bodyweight squats, 30-second rests. Progress gradually each week.'
    });
    expect(result.failures).toEqual([]);
  });
});

describe('accessibility verifier', () => {
  it('detects duplicate ids and unassociated labels', () => {
    const result = validateAccessibilityHtml('```html\n<input id="name" />\n<input id="name" />\n<label for="missing">Name</label>\n```');
    expect(result.failures).toContain('duplicate-id');
    expect(result.failures).toContain('unassociated-label');
  });

  it('detects invalid aria references and click-only buttons', () => {
    const result = validateAccessibilityHtml('```html\n<button aria-describedby="help">Save</button>\n<div id="x" onClick="go()">Click</div>\n```');
    expect(result.failures).toContain('invalid-aria-reference');
    expect(result.failures).toContain('missing-keyboard-focus');
  });
});

describe('productivity verifier', () => {
  it('flags an unlabeled assumed meeting time', () => {
    const result = verifyProductivity({
      prompt: 'Plan my day: I have a report, a team meeting and exercise.',
      content: 'Team meeting at 1:00 PM, then exercise at 3:00 PM.'
    });
    expect(result.failures).toContain('unlabeled-assumption');
  });

  it('accepts a plan that labels assumptions', () => {
    const result = verifyProductivity({
      prompt: 'Plan my day: I have a report, a team meeting and exercise.',
      content: '[Team meeting — actual meeting time]. Assuming exercise at 5:00 PM.'
    });
    expect(result.failures).toEqual([]);
  });
});

describe('output quality and deterministic patches', () => {
  it('detects duplicate paragraphs and dangling fences', () => {
    const result = checkOutputQuality('Same long paragraph here.\n\nSame long paragraph here.\n\n```js\ncode\n');
    expect(result.failures).toContain('duplicate-critical-content');
    expect(result.failures).toContain('malformed-code-fence');
  });

  it('patches duplicates and closes dangling fences within the repair bound', () => {
    const source = 'Same long paragraph here.\n\nSame long paragraph here.\n\n```js\ncode\n';
    const patched = applyDeterministicPatches(source);
    expect(patched.changed).toBe(true);
    expect(patched.content).not.toContain('Same long paragraph here.\n\nSame long paragraph here.');
    const fences = (patched.content.match(/```/g) || []).length;
    expect(fences % 2).toBe(0);
  });

  it('never exceeds the bounded repair attempts', () => {
    const verdict = runVerificationWithRepair({
      prompt: 'Convert 25000 PHP to USD.',
      content: '25000 PHP is 427 USD at the current rate.',
      skills: [{ id: 'live-data-utilities' }],
      runtimeContext: buildRuntimeContext()
    });
    expect(verdict.repairAttempts).toBeLessThanOrEqual(MAX_REPAIR_ATTEMPTS);
    expect(verdict.hardFailures).toContain('fabricated-live-value');
  });
});

describe('orchestrator and risk tiers', () => {
  it('runs multiple verifiers when several skills are activated', () => {
    const verdict = runSkillVerification({
      prompt: 'Convert 25000 PHP to USD and cite your source.',
      content: '25000 PHP is about 427 USD. See [rate](https://en.wikipedia.org/wiki/Philippine_peso).',
      skills: [{ id: 'live-data-utilities' }, { id: 'research-report' }],
      runtimeContext: buildRuntimeContext()
    });
    const skillIds = verdict.results.map((r) => r.skillId);
    expect(skillIds).toContain('live-data-utilities');
    expect(skillIds).toContain('research-report');
  });

  it('maps risk tiers per skill', () => {
    expect(SKILL_RISK_LEVELS['creative-writing']).toBe(RISK_LEVELS.LOW);
    expect(SKILL_RISK_LEVELS['meeting-notes']).toBe(RISK_LEVELS.MEDIUM);
    expect(SKILL_RISK_LEVELS['fitness-nutrition']).toBe(RISK_LEVELS.HIGH);
    expect(SKILL_RISK_LEVELS['live-data-utilities']).toBe(RISK_LEVELS.LIVE);
  });

  it('registers every hard failure id', () => {
    expect(SKILL_HARD_FAILURE_SET.has('fabricated-action-item')).toBe(true);
    expect(SKILL_HARD_FAILURE_SET.has('impossible-itinerary-timeline')).toBe(true);
    expect(SKILL_HARD_FAILURE_SET.has('arithmetic-error')).toBe(true);
  });
});

describe('evaluator integration', () => {
  it('hard failures from the verification layer override a high quality score', () => {
    const verdict = evaluateCase({
      content: 'A beautifully written, complete answer about the currency conversion.',
      caseDef: { prompt: 'Convert 25000 PHP to USD.', skillProfile: 'live-data-utilities', minLength: 40 },
      context: {
        verification: {
          hardFailures: ['fabricated-live-value'],
          results: [{ skillId: 'live-data-utilities', failures: ['fabricated-live-value'], risk: 'LIVE' }]
        }
      }
    });
    expect(verdict.hardFailures).toContain('fabricated-live-value');
    expect(verdict.passed).toBe(false);
  });

  it('applies skill-specific weight profiles', () => {
    const verdict = evaluateCase({
      content: 'Get 15% off your first order and free shipping! We are award-winning.',
      caseDef: { prompt: 'Write launch copy for my coffee brand.', skillProfile: 'marketing-copywriting', minLength: 20 },
      context: { verification: { hardFailures: ['unsupported-business-claim'], results: [] } }
    });
    expect(verdict.passed).toBe(false);
  });
});
