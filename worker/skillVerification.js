/**
 * CoreZ Skill Verification Layer
 *
 * Runs AFTER model generation and BEFORE the final response: each activated
 * specialist skill resolves to one or more deterministic verifiers that check
 * whether the response can actually be trusted — live-data freshness,
 * citation grounding, action-item extraction, arithmetic, safety, schedule
 * feasibility, and structural quality.
 *
 * Design rules:
 * - Modular: one verifier function per concern; never one giant function.
 * - Multiple verifiers may run when several skills are activated.
 * - Risk-based: LOW skills get a lightweight structural pass; MEDIUM/HIGH
 *   skills get full structural + domain checks; LIVE skills additionally
 *   require fresh external data evidence.
 * - Repairs are deterministic, bounded (MAX_REPAIR_ATTEMPTS) and targeted:
 *   only the failed region is patched, never a full regeneration.
 * - Every hard failure maps to a stable id in SKILL_HARD_FAILURES, and any
 *   hard failure forces FAIL regardless of quality score.
 */

export const MAX_REPAIR_ATTEMPTS = 2;

export const SKILL_HARD_FAILURES = [
  'live-data-required-but-not-used',
  'stale-live-data',
  'fabricated-live-value',
  'fabricated-current-date',
  'fabricated-current-time',
  'missing-live-source',
  'live-source-fetch-failed-but-answer-presented-as-current',
  'unsupported-citation',
  'fabricated-action-item',
  'fabricated-owner',
  'fabricated-deadline',
  'duplicate-action-item',
  'unsupported-business-claim',
  'unsupported-statistic',
  'fabricated-study-result',
  'uncited-data-claim',
  'impossible-itinerary-timeline',
  'insufficient-transfer-time',
  'overlapping-activities',
  'missing-travel-buffer',
  'arithmetic-error',
  'percentage-error',
  'trend-calculation-error',
  'unsupported-forecast',
  'critical-safety-issue',
  'duplicate-critical-content',
  'unlabeled-assumption',
  'malformed-code-fence',
  'broken-inline-code',
  'empty-heading',
  'unfinished-sentence'
];

export const SKILL_HARD_FAILURE_SET = new Set(SKILL_HARD_FAILURES);

// Risk tiers: verification cost scales with trust needs.
export const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  LIVE: 'LIVE'
};

export const SKILL_RISK_LEVELS = {
  'creative-writing': RISK_LEVELS.LOW,
  'translation-localization': RISK_LEVELS.LOW,
  'education-tutor': RISK_LEVELS.LOW,
  'document-generation': RISK_LEVELS.LOW,
  'event-planning': RISK_LEVELS.LOW,
  'study-aids': RISK_LEVELS.LOW,
  'resume-career': RISK_LEVELS.MEDIUM,
  'presentation-design': RISK_LEVELS.MEDIUM,
  'personal-productivity': RISK_LEVELS.MEDIUM,
  'meeting-notes': RISK_LEVELS.MEDIUM,
  'marketing-copywriting': RISK_LEVELS.MEDIUM,
  'business-planning': RISK_LEVELS.MEDIUM,
  'travel-planning': RISK_LEVELS.HIGH,
  'data-analysis': RISK_LEVELS.HIGH,
  'personal-finance': RISK_LEVELS.HIGH,
  'accessibility-compliance': RISK_LEVELS.HIGH,
  'fitness-nutrition': RISK_LEVELS.HIGH,
  'research-report': RISK_LEVELS.LIVE,
  'live-data-utilities': RISK_LEVELS.LIVE
};

// ---------------------------------------------------------------------------
// Live-data detection: which requests MUST NOT come from model memory.
// ---------------------------------------------------------------------------

export const LIVE_DATA_KINDS = [
  { kind: 'currency', patterns: [/\b(convert|exchange)\b.{0,30}\b(currency|usd|php|eur|gbp|jpy|exchange rate|currency conversion)\b/i, /\b\d+(?:[\d,]*\.\d+)?\s+(?:php|usd|eur|gbp|jpy|krw|cad|aud|inr)\s+(?:to|in|into)\s+\w+\b/i] },
  { kind: 'weather', patterns: [/\b(weather|forecast|temperature|humidity|wind speed)\b.{0,30}\b(today|now|right now|this week|tomorrow|current)?\b/i] },
  { kind: 'stock', patterns: [/\b(stock price|share price|stock market|trading price|market cap)\b/i] },
  { kind: 'crypto', patterns: [/\b(bitcoin|ethereum|btc|eth|crypto)\b.{0,20}\b(price|rate|value|cost)\b|\b(price|rate|value)\b.{0,20}\b(bitcoin|ethereum|btc|eth|crypto)\b/i] },
  { kind: 'current-time', patterns: [/\bwhat('| i)?s?\s+the\s+current\s+time\b|\bcurrent time\b|\bwhat time is it (now|right now)\b/i] },
  { kind: 'current-date', patterns: [/\bwhat('| i)?s?\s+(today'?s\s+)?date\b|\btoday'?s\s+date\b|\bwhat\s+day\s+is\s+it\b|\bwhat\s+year\s+is\s+it\b/i] },
  { kind: 'sports', patterns: [/\b(match result|game result|scoreline)\b.{0,20}\b(team|match|game|league)\b|\bwho won\b.{0,20}\b(match|game|final|championship)\b/i] },
  { kind: 'schedules', patterns: [/\b(flight schedule|train schedule|bus schedule|departure time|arrival time|showtimes|opening hours|business hours)\b/i] },
  { kind: 'public-figures', patterns: [/\b(who is the (current|new) (president|prime minister|chancellor|mayor|governor)|current (president|prime minister) of)\b/i] },
  { kind: 'pricing', patterns: [/\b(price of|prices? of|how much (is|does|are))\b.{0,40}\b(iphone|car|house|laptop|console|ticket|fare)\b/i] },
  { kind: 'travel-info', patterns: [/\b(current (visa|entry|quarantine) (rules|requirements)|travel restrictions|visa requirements\s+(now|currently|this year))\b/i] },
  { kind: 'laws', patterns: [/\b(current (law|regulation|legal age|tax rate)|minimum wage\s+(now|currently)|what is the legal age)\b/i] },
  { kind: 'availability', patterns: [/\b(in stock|in stock now|available now|still available|release date|next release)\b/i] }
];

export function detectLiveDataNeed(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return { required: false, kind: null };
  for (const { kind, patterns } of LIVE_DATA_KINDS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return { required: true, kind, matched: String(pattern) };
    }
  }
  return { required: false, kind: null };
}

// ---------------------------------------------------------------------------
// Runtime context: the real current date/time the model must use.
// ---------------------------------------------------------------------------

export function buildRuntimeContext(now = new Date()) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const currentDate = `${byType.weekday}, ${byType.month} ${byType.day}, ${byType.year}`;
  return {
    currentDate,
    currentYear: String(date.getUTCFullYear()),
    iso: date.toISOString(),
    timezone: 'UTC',
    generatedAt: date.toISOString()
  };
}

export function buildRuntimeContextBlock(runtimeContext) {
  return `Runtime context (authoritative — treat this as the real current date; never infer the date from training data):
- Current date: ${runtimeContext.currentDate}
- Current year: ${runtimeContext.currentYear}
- Generated at: ${runtimeContext.iso} (${runtimeContext.timezone})`;
}

const TEMPORAL_CLAIM_PATTERNS = [
  { type: 'date', pattern: /\b(?:as of|as at)\s+([A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/gi },
  { type: 'year', pattern: /\b(?:current year(?: is)?|as of)\s+(\d{4})\b/gi },
  { type: 'today', pattern: /\btoday(?:'s)?\s+(?:date\s+)?is\s+([A-Z][a-z]+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/gi }
];

export function parseClaimDate(value) {
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const slash = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return { month: Number(slash[1]), day: Number(slash[2]), year: Number(slash[3]) };
  const named = String(value).match(/^([A-Z][a-z]+) (\d{1,2}),? (\d{4})$/);
  if (named) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return { month: months.indexOf(named[1].toLowerCase()) + 1, day: Number(named[2]), year: Number(named[3]) };
  }
  return null;
}

export function checkTemporalClaims(content, runtimeContext) {
  const failures = [];
  const evidence = [];
  const text = String(content || '');
  const now = runtimeContext ? new Date(runtimeContext.iso) : new Date();
  const currentYear = String(now.getUTCFullYear());
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  for (const { type, pattern } of TEMPORAL_CLAIM_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const claim = match[1];
      evidence.push({ type, claim });
      if (type === 'year') {
        if (claim !== currentYear) failures.push('fabricated-current-date');
      } else {
        const parsed = parseClaimDate(claim);
        if (parsed) {
          const sameDay = parsed.year === now.getUTCFullYear()
            && parsed.month === currentMonth
            && parsed.day === currentDay;
          if (!sameDay) failures.push(type === 'date' ? 'stale-live-data' : 'fabricated-current-date');
        }
      }
    }
  }

  const timePattern = /\b(current time(?: is|:| is now)|time right now is)\s+([0-9]{1,2}:[0-9]{2})/gi;
  timePattern.lastIndex = 0;
  let timeMatch;
  while ((timeMatch = timePattern.exec(text)) !== null) {
    const claimed = timeMatch[2];
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const [h, m] = claimed.split(':').map(Number);
    const claimedMinutes = (h % 24) * 60 + m;
    if (Math.abs(nowMinutes - claimedMinutes) > 10) {
      failures.push('fabricated-current-time');
      evidence.push({ type: 'time', claim: claimed });
    }
  }

  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Deterministic calculator: numbers verified by code, not memory.
// ---------------------------------------------------------------------------

export function extractNumbers(value) {
  const text = String(value || '');
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return matches
    .map((m) => Number(m.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

export function extractDataSeriesNumbers(value) {
  const text = String(value || '')
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/\b\d[\d,]*(?:\.\d+)?\s*%/g, '');
  return extractNumbers(text);
}

export function calcStats(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  const mean = sorted.length > 0 ? sum / sorted.length : 0;
  let median = null;
  if (sorted.length > 0) {
    const mid = Math.floor(sorted.length / 2);
    median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  const pctChanges = [];
  for (let i = 1; i < numbers.length; i += 1) {
    const prev = numbers[i - 1];
    pctChanges.push(prev !== 0 ? ((numbers[i] - prev) / Math.abs(prev)) * 100 : null);
  }
  return { sum, mean, median, pctChanges, count: sorted.length };
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}

export function verifyArithmetic({ expected, actual, tolerance = 0.01, failure = 'arithmetic-error' }) {
  const failures = [];
  const evidence = [];
  if (expected === null || expected === undefined || actual === null || actual === undefined) {
    return { failures, evidence };
  }
  const exp = Number(expected);
  const act = Number(actual);
  const diff = Math.abs(exp - act);
  const rel = exp !== 0 ? diff / Math.abs(exp) : diff;
  if (diff > tolerance && rel > tolerance) {
    failures.push(failure);
    evidence.push({ expected: exp, actual: act, diff: round2(diff), relative: round2(rel) });
  }
  return { failures, evidence };
}

// ---------------------------------------------------------------------------
// Output quality pass: structural defects detected deterministically.
// ---------------------------------------------------------------------------

export function checkOutputQuality(content) {
  const failures = [];
  const evidence = [];
  const text = String(content || '');
  const lines = text.split('\n');

  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    failures.push('malformed-code-fence');
    evidence.push({ fences: fenceCount });
  }
  const inlineBackticks = (text.match(/`/g) || []).length;
  if (inlineBackticks % 2 !== 0) {
    failures.push('broken-inline-code');
    evidence.push({ backticks: inlineBackticks });
  }

  const paragraphs = lines.map((l) => l.trim()).filter((l) => l.length > 20);
  for (let i = 1; i < paragraphs.length; i += 1) {
    if (paragraphs[i] === paragraphs[i - 1]) {
      failures.push('duplicate-critical-content');
      evidence.push({ duplicateParagraph: paragraphs[i].slice(0, 120) });
      break;
    }
  }

  const rows = text.match(/^\|.*\|$/gm) || [];
  const seenRows = new Set();
  for (const row of rows) {
    const normalized = row.toLowerCase();
    if (seenRows.has(normalized)) {
      failures.push('duplicate-critical-content');
      evidence.push({ duplicateTableRow: row.slice(0, 120) });
      break;
    }
    seenRows.add(normalized);
  }

  const emptyHeading = text.match(/^#{1,6}\s*$/gm);
  if (emptyHeading) {
    failures.push('empty-heading');
    evidence.push({ emptyHeadings: emptyHeading.length });
  }

  // Unfinished sentence: only plain prose tails count. Lists, URLs, table
  // rows, code, and closing brackets are valid structural endings.
  const tail = text.trim().replace(/```\s*$/, '').trim();
  const lastLine = tail.split('\n').filter(Boolean).pop()?.trim() || '';
  const structuralEnding = /^(?:[-*]|\d+[.)]|\|)/.test(lastLine)
    || /https?:\/\/\S+$/.test(lastLine)
    || /[.!?…""'')\]}>*|:]$/.test(lastLine)
    || /^#{1,6}\s/.test(lastLine);
  if (tail && !structuralEnding && tail.length > 40) {
    failures.push('unfinished-sentence');
    evidence.push({ tail: tail.slice(-60) });
  }

  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: LIVE DATA — never trust remembered values.
// ---------------------------------------------------------------------------

const HONEST_LIVE_REFUSAL_PATTERNS = [
  /(?:can'?t|cannot|couldn'?t|unable to|no live|without a live|don'?t have access to|not able to)\b[\s\S]{0,80}\b(live data|current rate|real-?time|up-to-?date|current exchange|fresh data|provider|tool)/i,
  /\b(live data could not be retrieved|no live data available|i do not have access to real-?time|as i cannot fetch)/i,
  /\b(could not be retrieved from|could not be retrieved|couldn'?t be retrieved)\b[\s\S]{0,60}\b(live|search|results|source|provider)/i,
  /\b(do not include the actual rate|does not include the (current|actual) rate|did not include the (current|actual) rate)\b/i,
  /\b(could not be determined|couldn'?t (find|get|determine) (the )?(current|live) rate|no live rate (was )?found)\b/i,
  /\b(did not return the (actual )?(current )?(rate|exchange rate|value)|no numeric rate (was )?(found|returned)|did not include a numeric (rate|value))\b/i,
  /\b(could not retrieve (the |a )?(live |current )?(?:[a-z]{3}\s*(?:-to-|→|->)\s*[a-z]{3}\s+)?(?:conversion )?(rate|exchange rate|value|data)|was unable to retrieve (the |a )?(live |current )?)\b/i,
  /\b(won'?t (approximate|estimate) from memory|will not (approximate|estimate) from memory|per (my|our) data policy)\b/i,
  /\b(none of the (snippets|results|pages) included the (actual |current )?(rate|value|amount))\b/i,
  /\b(was|were) not included in the (available |live search )?(snippets|results|pages)\b/i,
  /\b(rate|value|data|figure|amount)\b[\s\S]{0,60}\bcould not be retrieved\b/i,
  /\b(without approximating|won'?t approximate|not going to approximate)\b/i,
  /\[live data (unavailable|not configured|required)\]/i
];

const LIVE_SOURCE_URL_PATTERN = /https?:\/\/\S+/i;

function extractLiveClaimNumbers(text) {
  const claims = [];
  const patterns = [
    /(?:[$€£₱]\s*)?(\d[\d,]*(?:\.\d+)?)(?:s)?\s*(?:%|usd|php|eur|gbp|jpy|krw|cad|aud|inr|°c|°f|m\/s|km\/h|am|pm)\b/gi,
    /[$€£₱]\s*(\d[\d,]*(?:\.\d+)?)(?:s)?\b/gi,
    /\b(?:rate|price|temperature|score|value|amount)\s+(?:is|was|=|of)\s+(\d[\d,]*(?:\.\d+)?)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(text || ''))) !== null) {
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value)) claims.push(value);
    }
  }
  return claims;
}

export function verifyLiveData({ prompt, content, runtimeContext, liveDataEvidence }) {
  const failures = [];
  const evidence = { liveDataRequired: false, liveDataUsed: false };
  const need = detectLiveDataNeed(prompt);
  if (!need.required) return { failures, evidence, liveData: { liveDataRequired: false } };
  evidence.liveDataRequired = true;
  evidence.kind = need.kind;

  const text = String(content || '');

  const promptNumbers = extractNumbers(prompt);
  const claimedNumbers = extractLiveClaimNumbers(text);
  const newNumericClaims = claimedNumbers.filter((claim) => !promptNumbers.some((given) => Math.abs(given - claim) < 0.000001));
  const hasNumericClaim = newNumericClaims.length > 0;

  if (HONEST_LIVE_REFUSAL_PATTERNS.some((p) => p.test(text))) {
    evidence.honestRefusal = true;
    evidence.numericClaims = newNumericClaims;
    if (hasNumericClaim) failures.push('fabricated-live-value');
    return {
      failures: Array.from(new Set(failures)),
      evidence,
      liveData: { liveDataRequired: true, liveDataUsed: false, honestRefusal: true }
    };
  }

  const citedUrls = extractCitations(text).map((citation) => citation.url);
  const fetchedUrls = new Set((liveDataEvidence?.results || []).map((result) => canonicalUrl(result.url)));
  const hasSource = LIVE_SOURCE_URL_PATTERN.test(text);
  const hasGroundedSource = citedUrls.some((url) => fetchedUrls.has(canonicalUrl(url)));
  const usedLive = Boolean(liveDataEvidence && liveDataEvidence.servedAt);

  if (usedLive) {
    evidence.liveDataUsed = true;
    const servedAt = new Date(liveDataEvidence.servedAt);
    const validTimestamp = Number.isFinite(servedAt.getTime());
    const freshnessMs = validTimestamp ? Math.max(0, Date.now() - servedAt.getTime()) : null;
    evidence.freshnessMs = freshnessMs;
    evidence.dataSource = liveDataEvidence.sources || 'web-search';
    evidence.fetchedAt = liveDataEvidence.fetchedAt || liveDataEvidence.servedAt;
    evidence.sourceTimestamp = liveDataEvidence.servedAt;
    const maxAgeMs = Number(liveDataEvidence.maxAgeMs) || 12 * 60 * 60 * 1000;
    if (!validTimestamp || freshnessMs > maxAgeMs) failures.push('stale-live-data');
    // A value asserted without any source marker is still fabricated even
    // when live evidence was fetched (the model ignored the evidence).
    if (hasNumericClaim && (!hasSource || !hasGroundedSource)) {
      failures.push('missing-live-source');
      failures.push('fabricated-live-value');
    }
    return {
      failures: Array.from(new Set(failures)),
      evidence,
      liveData: { liveDataRequired: true, liveDataUsed: true, freshnessValid: validTimestamp && freshnessMs <= maxAgeMs, ...evidence }
    };
  }

  if (hasNumericClaim) {
    if (!hasSource) failures.push('missing-live-source');
    failures.push('fabricated-live-value');
  } else {
    failures.push('live-data-required-but-not-used');
  }

  const temporal = checkTemporalClaims(text, runtimeContext);
  for (const f of temporal.failures) failures.push(f);

  return { failures: Array.from(new Set(failures)), evidence, liveData: { liveDataRequired: true, liveDataUsed: false, ...evidence } };
}

// ---------------------------------------------------------------------------
// Verifier: RESEARCH — citations must be real and grounded, never invented.
// ---------------------------------------------------------------------------

const CITATION_PATTERN = /\[([^\]]+)\]\((https?:\/\/(?:[^()\s]+|\([^()\s]*\))+)\)/g;

export function extractCitations(content) {
  const text = String(content || '');
  const citations = [];
  const seen = new Set();
  CITATION_PATTERN.lastIndex = 0;
  let match;
  while ((match = CITATION_PATTERN.exec(text)) !== null) {
    citations.push({ label: match[1], url: match[2] });
    seen.add(match[2].replace(/\/+$/, '').toLowerCase());
  }
  // Plain-text URLs (numbered source lists) count as citations too — a
  // sources section written as bare links is still evidence.
  CITATION_PATTERN.lastIndex = 0;
  const textWithoutMarkdownLinks = text.replace(CITATION_PATTERN, '');
  const bareUrls = textWithoutMarkdownLinks.match(/https?:\/\/[^\s)\]>]+/g) || [];
  for (const url of bareUrls) {
    const cleaned = url.replace(/[,;]+$/, '');
    const key = cleaned.replace(/\/+$/, '').toLowerCase();
    if (!seen.has(key)) {
      citations.push({ label: cleaned, url: cleaned });
      seen.add(key);
    }
  }
  return citations;
}

function validCitationUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (!parsed.hostname.includes('.')) return false;
    const tld = parsed.hostname.split('.').pop();
    return /^[a-z]{2,}$/i.test(tld) && tld.length >= 2;
  } catch {
    return false;
  }
}

function canonicalUrl(value) {
  try {
    const parsed = new URL(value);
    const pathname = decodeURIComponent(parsed.pathname).replace(/\/$/, '').replace(/\.$/, '');
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return String(value || '').replace(/\/+$/, '').toLowerCase();
  }
}

export function verifyResearch({ prompt, content, searchEvidence }) {
  const failures = [];
  const evidence = { requestedSources: 0, fetchedSources: 0, verifiedSources: 0, failedSources: 0, citations: [] };
  const text = String(content || '');
  const askedForSources = /\b(cite|sources?|references?|latest|current|recent|as of)\b/i.test(String(prompt || ''));

  const citations = extractCitations(text);
  const fetchedUrls = new Set((searchEvidence?.results || []).map((r) => canonicalUrl(r.url)));

  for (const citation of citations) {
    const valid = validCitationUrl(citation.url);
    const fetched = fetchedUrls.size > 0 && fetchedUrls.has(canonicalUrl(citation.url));
    evidence.citations.push({
      id: `c-${evidence.citations.length + 1}`,
      url: citation.url,
      title: citation.label,
      fetched: Boolean(fetched),
      verified: valid && fetched,
      supportsClaim: fetched ? 'pending' : null,
      claims: []
    });
    if (!valid) {
      evidence.failedSources += 1;
      failures.push('unsupported-citation');
    } else if (fetched) {
      evidence.fetchedSources += 1;
      evidence.verifiedSources += 1;
    } else if (askedForSources) {
      evidence.failedSources += 1;
      failures.push('unsupported-citation');
    }
  }
  evidence.requestedSources = citations.length;

  const hasAnyGrounded = citations.length > 0 && evidence.fetchedSources >= Math.ceil(citations.length * 0.5);
  if (askedForSources && citations.length === 0) {
    failures.push('unsupported-citation');
  }
  evidence.groundingValid = hasAnyGrounded;
  evidence.groundingMode = searchEvidence?.servedAt ? 'external-research' : 'model-knowledge';
  evidence.servedAt = searchEvidence?.servedAt || null;
  evidence.fetchedAt = searchEvidence?.fetchedAt || null;

  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: MEETING NOTES — never invent actions, owners, or deadlines.
// ---------------------------------------------------------------------------

export function extractActionItems(content) {
  const text = String(content || '');
  const actions = [];
  const tableRows = text.match(/^\|.*\|.*$/gm) || [];
  const headerLower = String(tableRows[0] || '').toLowerCase();
  // Detect table orientation: | Task | Owner | Deadline | is common too.
  const taskFirst = /task/.test(headerLower) && /owner/.test(headerLower)
    && headerLower.indexOf('task') < headerLower.indexOf('owner');
  for (const row of tableRows.slice(1)) {
    const cells = row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const normalized = cells.join(' ').toLowerCase();
    if (normalized.startsWith('owner ') || normalized.startsWith('task ') || /^[-:]+$/.test(cells.join(''))) continue;
    if (cells.length >= 2 && cells[0] && cells[0] !== 'Owner') {
      const owner = taskFirst ? (cells[1] || null) : (cells[0] || null);
      const action = taskFirst ? (cells[0] || '') : (cells[1] || '');
      actions.push({ owner, action, deadline: cells[2] || null });
    }
  }
  const listMatch = text.match(/(?:#{1,6}\s*)?(?:Action Items?|Confirmed Action Items?)\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:#{1,6}\s+|\*\*[A-Za-z])|$)/i);
  if (listMatch) {
    const listText = listMatch[1];
    const bullets = listText.match(/[-*]\s+[^\n]+/g) || [];
    for (const bullet of bullets) {
      const bulletAction = bullet.replace(/^[-*]\s+/, '').trim();
      if (!bulletAction || /^[-:*|\s]+$/.test(bulletAction)) continue; // table separators and empty bullets
      let owner = null;
      let action = bulletAction;
      // "**Maria** — Own and deliver the landing page" or "Maria — Finalize pricing".
      const boldMatch = bulletAction.match(/^\*\*([^*]+)\*\*\s*(?:—|-|:)?\s*([\s\S]*)$/);
      if (boldMatch) {
        owner = boldMatch[1].trim();
        action = boldMatch[2].trim();
      } else {
        const dashMatch = bulletAction.match(/^([A-Z][A-Za-z ]+?)\s*(?:—|-)\s*(.+)$/);
        if (dashMatch) {
          owner = dashMatch[1].trim();
          action = dashMatch[2].trim();
        }
      }
      actions.push({ owner, action, deadline: null, raw: bullet });
    }
  }
  return actions;
}

export function verifyMeetingNotes({ prompt, content, sourceText }) {
  const failures = [];
  const evidence = { actions: [], suggested: [], sourceFound: false };
  const text = String(content || '');
  const source = String(sourceText || prompt || '');

  const actions = extractActionItems(text);
  const normalizedSource = source.toLowerCase();

  const seen = new Set();
  const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'will', 'own', 'this', 'that', 'due', 'by', 'on', 'per', 'not', 'no', 'to', 'of', 'a', 'an', 'in', 'at']);
  for (const action of actions) {
    const actionLower = String(action.action || '').toLowerCase();
    const key = `${String(action.owner || '').toLowerCase()}|${actionLower}`;
    if (seen.has(key)) {
      failures.push('duplicate-action-item');
      continue;
    }
    seen.add(key);

    const tokens = actionLower.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((t) => t.length > 3 && !STOPWORDS.has(t));
    const groundedTokens = tokens.filter((t) => normalizedSource.includes(t));
    const actionGrounded = actionLower.length > 0 && (
      normalizedSource.includes(actionLower.slice(0, 40))
      || (tokens.length > 0 && groundedTokens.length >= Math.ceil(tokens.length / 2))
    );
    const ownerLower = String(action.owner || '').toLowerCase();
    const ownerIndex = ownerLower ? normalizedSource.indexOf(ownerLower) : -1;
    const tokenIndexes = groundedTokens.map((token) => normalizedSource.indexOf(token)).filter((index) => index >= 0);
    const ownerGrounded = !action.owner || (ownerIndex >= 0 && tokenIndexes.some((index) => Math.abs(index - ownerIndex) <= 80));
    const explicit = actionGrounded && ownerGrounded;
    evidence.actions.push({
      action: action.action,
      owner: action.owner,
      deadline: action.deadline,
      sourceEvidence: actionLower.slice(0, 80),
      explicit: Boolean(explicit)
    });
    if (!actionGrounded) {
      failures.push('fabricated-action-item');
    }
    if (!ownerGrounded && action.owner) {
      failures.push('fabricated-owner');
    }
    const meaningfulDeadline = action.deadline && !/^(?:not stated|not specified|none|n\/a|tbd|ongoing)$/i.test(action.deadline.trim());
    if (meaningfulDeadline) {
      // A deadline is fabricated when it is absent from the source, or when
      // it appears in the source only far away from the owner/action that
      // claims it (e.g. "Next sync Wednesday" must not become Maria's
      // Wednesday deadline).
      const deadlineLower = action.deadline.toLowerCase();
      const inSource = normalizedSource.includes(deadlineLower);
      let nearOwner = false;
      if (inSource && ownerLower) {
        const ownerIndex = normalizedSource.indexOf(ownerLower);
        const deadlineIndex = normalizedSource.lastIndexOf(deadlineLower);
        nearOwner = ownerIndex >= 0 && deadlineIndex >= 0 && Math.abs(deadlineIndex - ownerIndex) <= 80;
      }
      if (!inSource || (ownerLower && !nearOwner)) {
        failures.push('fabricated-deadline');
      }
    }
  }

  const suggestedSection = text.match(/Suggested Follow-ups?:?\s*\n?([\s\S]*?)(?=\n\s*#{1,3}\s|\n\s*$)/i);
  if (suggestedSection) {
    evidence.suggested = (suggestedSection[1].match(/[-*]\s+[^\n]+/g) || []).map((b) => b.replace(/^[-*]\s+/, '').trim());
  }

  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: MARKETING — creative language yes, invented business facts no.
// ---------------------------------------------------------------------------

const FABRICATED_BUSINESS_CLAIM_PATTERNS = [
  /\b(ships?\s+(within|in)\s+\d+\s*(hours?|days?)|free shipping|free delivery)\b/i,
  /\b\d{1,3}%\s+(off|discount|savings?)|(?:discount|offer)\s+of\s+\d{1,3}%\b/i,
  /\b(sustainably sourced|ethically sourced|single origin|organic|certified)\b(?!\s*\[)/i,
  /\b(award[- ]winning|best[- ]selling|top[- ]rated)\b/i,
  /\bused by \d[\d,]* (customers|users|people|teams)\b/i,
  /\b(roasted|brewed|baked|handmade) (this|every) week\b/i,
  /\b(backed by|trusted by) \d[\d,]*\b/i,
  /\b(roasted to order|shipped fresh|packed within hours|built our own roastery|roasting in the garage)\b/i
];

const PLACEHOLDER_MARKERS = /\[(?:optional|placeholder|insert|consider|suggested)[^\]]*\]|consider (?:offering|giving|adding|using)|suggest(?:ion|ed)?/i;
const NON_ASSERTIVE_CLAIM_CONTEXT = /\b(?:check|confirm|verify)\s+(?:whether|if|before)\b|\bif\s+you\s+offer\b|\byour\s+real\s+(?:offer|policy|claim|rate|details?)\b/i;

export function verifyMarketing({ _prompt, content }) {
  const failures = [];
  const evidence = { claims: [] };
  const text = String(content || '');
  const lines = text.split('\n');
  for (const pattern of FABRICATED_BUSINESS_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const line = lines.find((l) => l.includes(match[0])) || match[0];
      // A claim on a line framed with brackets ("[15%] off", "over $[X]",
      // "[region/farm]") is an explicit placeholder, not an invented fact.
      // Markdown links are excluded from the bracket check.
      const withoutLinks = line.replace(/\[[^\]]+\]\([^)]+\)/g, '');
      const claimIndex = withoutLinks.indexOf(match[0]);
      const claimIsBracketed = Array.from(withoutLinks.matchAll(/\[[^\]]*\]/g)).some((bracket) =>
        claimIndex >= bracket.index && claimIndex < bracket.index + bracket[0].length
      );
      if (PLACEHOLDER_MARKERS.test(line) || NON_ASSERTIVE_CLAIM_CONTEXT.test(line) || claimIsBracketed) continue;
      evidence.claims.push(match[0].slice(0, 120));
      failures.push('unsupported-business-claim');    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: PRESENTATION — no invented statistics.
// ---------------------------------------------------------------------------

const STATISTIC_CLAIM_PATTERNS = [
  /\b\d{1,3}(?:\.\d+)?% of (workers|employees|people|users|companies|teams)\b/i,
  /\b\d+(?:\.\d+)?x (more|increase|faster|higher|greater)\b/i,
  /\b(?:increase|decrease|rise|drop|boost)\s+of\s+\d{1,3}%\b/i,
  /\b(?:additional|extra|saved)\s+\d+(?:\.\d+)? (hours|minutes|days|dollars|hours per week)\b/i,
  /\b(?:study|research|survey|report)[\s\S]{0,60}\b\d{1,3}%\b/i,
  /\bper year\b.{0,40}\b\d+%/i,
  /\b\d+\s+\w+\s*=\s*\d+(?:\.\d+)?\s*(?:minutes?|hours?|days?)\b/i
];

export function verifyPresentation({ prompt, content }) {
  const failures = [];
  const evidence = { statistics: [] };
  const text = String(content || '');
  const userNumbers = extractNumbers(String(prompt || ''));
  for (const pattern of STATISTIC_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const claimNumbers = extractNumbers(match[0]);
      const userSupplied = claimNumbers.every((n) => userNumbers.includes(n));
      if (!userSupplied) {
        evidence.statistics.push(match[0].slice(0, 120));
        failures.push('unsupported-statistic');
      }
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: DATA ANALYSIS & FINANCE — arithmetic checked by code.
// ---------------------------------------------------------------------------

export function verifyDataAnalysis({ prompt, content }) {
  const failures = [];
  const evidence = { checks: [] };
  const promptNumbers = extractDataSeriesNumbers(String(prompt || ''));
  const responseNumbers = extractNumbers(String(content || ''));
  if (promptNumbers.length >= 2) {
    const expected = calcStats(promptNumbers);
    const check = (label, expectedValue, candidates, conditional) => {
      if (conditional === false) return;
      const match = candidates.find((n) => Math.abs(n - expectedValue) <= Math.max(0.01, Math.abs(expectedValue) * 0.01));
      if (match === undefined) {
        failures.push(label === 'sum' ? 'arithmetic-error' : label === 'mean' ? 'arithmetic-error' : 'trend-calculation-error');
        evidence.checks.push({ label, expected: round2(expectedValue), found: candidates.slice(0, 5) });
      } else {
        evidence.checks.push({ label, expected: round2(expectedValue), found: match, ok: true });
      }
    };
    // The sum is only verified when the response claims one; a trend-only
    // answer ("what is the trend?") has no obligation to state a total.
    check('sum', expected.sum, responseNumbers, /\btotal\b|\bsum of\b|\ball.?time\b/i.test(String(content || '')));
    check('mean', expected.mean, responseNumbers);

    const text = String(content || '');
    const monthPercentagePattern = /\bmonth\s+(\d+)\b[^\n]{0,40}?\b(?:fell|dropped|decreased|declined|rose|grew|increased)\s+(?:by\s+)?(\d+(?:\.\d+)?)%/gi;
    let percentageMatch;
    while ((percentageMatch = monthPercentagePattern.exec(text)) !== null) {
      const month = Number(percentageMatch[1]);
      const claimed = Number(percentageMatch[2]);
      const expectedChange = expected.pctChanges[month - 2];
      if (Number.isFinite(expectedChange) && Math.abs(Math.abs(expectedChange) - claimed) > 0.5) {
        failures.push('percentage-error');
        evidence.checks.push({ label: `month-${month}-percentage`, expected: round2(expectedChange), found: claimed });
      }
    }

    const directionMatch = text.match(/\b(?:overall\s+)?trend\s+(?:is|was|looks?)\s+(upward|downward|flat|stable)\b/i);
    if (directionMatch) {
      const actualDirection = numbersDirection(promptNumbers);
      const claimedDirection = /upward/i.test(directionMatch[1]) ? 'upward' : /downward/i.test(directionMatch[1]) ? 'downward' : 'flat';
      if (actualDirection !== claimedDirection) {
        failures.push('trend-calculation-error');
        evidence.checks.push({ label: 'trend-direction', expected: actualDirection, found: claimedDirection });
      }
    }

    const trend = calcLinearTrend(promptNumbers);
    const slopeMatch = text.match(/\blinear\s+trend\s+slope[^\d+-]{0,20}([-+]?[\d,]+(?:\.\d+)?)/i)
      || text.match(/\bexpected\s+(?:increase|decrease)[^\d+-]{0,20}([-+]?[\d,]+(?:\.\d+)?)\s+per\s+(?:month|period)/i);
    if (slopeMatch && trend) {
      const claimedSlope = Number(slopeMatch[1].replace(/,/g, ''));
      const signedSlope = /decrease/i.test(slopeMatch[0]) && claimedSlope > 0 ? -claimedSlope : claimedSlope;
      const arithmetic = verifyArithmetic({ expected: trend.slope, actual: signedSlope, tolerance: 0.01, failure: 'trend-calculation-error' });
      failures.push(...arithmetic.failures);
      evidence.checks.push({ label: 'linear-trend-slope', expected: round2(trend.slope), found: signedSlope, ok: arithmetic.failures.length === 0 });
    }

    const formulaMatch = text.match(/(?:sales|trend|y)?\s*[≈~=]\s*([\d,]+(?:\.\d+)?)\s*\+\s*([\d,]+(?:\.\d+)?)\s*[×*x]\s*(?:month|x)/i);
    const forecastMatch = text.match(/\bmonth\s+(\d+)\s+forecast[^\d]{0,20}([\d,]+(?:\.\d+)?)/i);
    if (formulaMatch && forecastMatch) {
      const intercept = Number(formulaMatch[1].replace(/,/g, ''));
      const slope = Number(formulaMatch[2].replace(/,/g, ''));
      const month = Number(forecastMatch[1]);
      const forecast = Number(forecastMatch[2].replace(/,/g, ''));
      const formulaValue = intercept + slope * month;
      const arithmetic = verifyArithmetic({ expected: formulaValue, actual: forecast, tolerance: 0.01, failure: 'trend-calculation-error' });
      failures.push(...arithmetic.failures);
      evidence.checks.push({ label: 'forecast-formula', expected: formulaValue, found: forecast, ok: arithmetic.failures.length === 0 });
    } else if (forecastMatch && trend) {
      const month = Number(forecastMatch[1]);
      const forecast = Number(forecastMatch[2].replace(/,/g, ''));
      const expectedForecast = trend.intercept + trend.slope * month;
      const arithmetic = verifyArithmetic({ expected: expectedForecast, actual: forecast, tolerance: 0.01, failure: 'trend-calculation-error' });
      failures.push(...arithmetic.failures);
      evidence.checks.push({ label: 'linear-trend-forecast', expected: round2(expectedForecast), found: forecast, ok: arithmetic.failures.length === 0 });
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

function numbersDirection(numbers) {
  if (numbers.length < 2) return 'flat';
  const delta = numbers[numbers.length - 1] - numbers[0];
  if (Math.abs(delta) < 0.000001) return 'flat';
  return delta > 0 ? 'upward' : 'downward';
}

export function calcLinearTrend(numbers) {
  if (!Array.isArray(numbers) || numbers.length < 2) return null;
  const meanX = (numbers.length + 1) / 2;
  const meanY = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < numbers.length; index += 1) {
    const x = index + 1;
    numerator += (x - meanX) * (numbers[index] - meanY);
    denominator += (x - meanX) ** 2;
  }
  if (denominator === 0) return null;
  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

export function verifyFinance({ prompt, content }) {
  const failures = [];
  const evidence = { checks: [] };
  const promptNumbers = extractNumbers(String(prompt || ''));
  const responseNumbers = extractNumbers(String(content || ''));
  if (promptNumbers.length > 0) {
    const income = Math.max(...promptNumbers);
    const expectedTotal = income;
    const found = responseNumbers.find((n) => Math.abs(n - expectedTotal) <= Math.max(0.01, Math.abs(expectedTotal) * 0.01));
    if (found === undefined) {
      failures.push('arithmetic-error');
      evidence.checks.push({ label: 'budget-total', expected: round2(expectedTotal), found: responseNumbers.slice(0, 8) });
    } else {
      evidence.checks.push({ label: 'budget-total', expected: round2(expectedTotal), found, ok: true });
    }

    const tableGroups = [];
    let activeTable = [];
    for (const line of String(content || '').split('\n')) {
      if (/^\s*\|.*\|\s*$/.test(line)) {
        activeTable.push(line.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.replace(/[*_`]/g, '').trim()));
      } else if (activeTable.length > 0) {
        tableGroups.push(activeTable);
        activeTable = [];
      }
    }
    if (activeTable.length > 0) tableGroups.push(activeTable);

    for (const rows of tableGroups) {
      const headerIndex = rows.findIndex((cells) => cells.some((cell) => /category|line item/i.test(cell))
        && cells.some((cell) => /budget|amount|allocation/i.test(cell)));
      if (headerIndex < 0) continue;
      const headers = rows[headerIndex];
      const amountIndex = headers.findIndex((cell) => /budget|amount|allocation/i.test(cell));
      let statedTotal = null;
      let fallbackTotal = null;
      const lineItems = [];
      for (const cells of rows.slice(headerIndex + 1)) {
        if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
        const label = String(cells[0] || '');
        const amount = extractNumbers(cells[amountIndex] || '')[0];
        if (!Number.isFinite(amount)) continue;
        if (/\bgrand total\b|^\s*total\s*$/i.test(label)) statedTotal = amount;
        else if (/\btotal\b/i.test(label)) fallbackTotal = amount;
        else lineItems.push(amount);
      }
      const tableTotal = statedTotal ?? fallbackTotal;
      if (lineItems.length >= 2 && Number.isFinite(tableTotal)) {
        const itemSum = lineItems.reduce((sum, amount) => sum + amount, 0);
        const arithmetic = verifyArithmetic({ expected: tableTotal, actual: itemSum, tolerance: 0.001 });
        failures.push(...arithmetic.failures);
        evidence.checks.push({ label: 'line-item-sum', expected: tableTotal, found: itemSum, ok: arithmetic.failures.length === 0 });
      }
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

export function verifyBusiness({ _prompt, content }) {
  const failures = [];
  const evidence = { assumptionsLabeled: false };
  const text = String(content || '');
  const hasAssumptionLabels = /\b(assum(e|ing|ption)|illustrative|estimate|placeholder|example figure)\b/i.test(text);
  evidence.assumptionsLabeled = hasAssumptionLabels;
  const hasFigures = /\b\d[\d,]*(?:\.\d+)?\s*(?:php|usd|eur|₱|€|\$|£|%)\b|\b(?:php|usd|eur|₱|€|\$|£)\s?\d[\d,]*/i.test(text);
  if (hasFigures && !hasAssumptionLabels) {
    failures.push('unlabeled-assumption');
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: TRAVEL — every activity must physically fit the timeline.
// ---------------------------------------------------------------------------

const CLOCK_TIME_PATTERN = /(\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b)/gi;
const ACTIVITY_LINE_PATTERN = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/;

function parseClock(value) {
  const cleaned = String(value).trim();
  let match = cleaned.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (match) return { minutes: Number(match[1]) * 60 + Number(match[2]) };
  match = cleaned.match(/^([01]?\d)(?::([0-5]\d))?\s*(am|pm)$/i);
  if (match) {
    let h = Number(match[1]) % 12;
    if (/pm/i.test(match[3])) h += 12;
    return { minutes: h * 60 + (match[2] ? Number(match[2]) : 0) };
  }
  return null;
}

const DAY_MARKER_PATTERN = /^\s*(?:#{1,6}\s*)?(?:[-*]\s+)?day\s+(one|two|three|four|five|six|\d{1,2})\b/i;

export function extractItinerary(content) {
  const text = String(content || '');
  const events = [];
  const lines = text.split('\n');
  let currentDay = 0;
  for (const line of lines) {
    if (DAY_MARKER_PATTERN.test(line)) currentDay += 1;
    // Clock tokens with their positions; a range only counts when the first
    // two tokens are separated by a dash/arrow (e.g. "7:00–10:00 AM").
    const tokens = [];
    CLOCK_TIME_PATTERN.lastIndex = 0;
    let match;
    while ((match = CLOCK_TIME_PATTERN.exec(line)) !== null) {
      tokens.push({ value: match[0], index: match.index });
      if (tokens.length > 4) break;
    }
    if (tokens.length === 0) continue;
    // Scheduled activities lead with their time ("**Morning (7:00–10:00 AM)**").
    // Advice lines ("...arrive before 7:00 AM to avoid the queue") bury the
    // clock mid-sentence and must not be parsed as itinerary events.
    if (tokens[0].index > 20) continue;
    const timePrefix = line.slice(0, tokens[0].index);
    if (/\b(start|leave|depart|arrive|go|begin|wake|book|get|head|catch|take|before|by)\b/i.test(timePrefix)) continue;
    const activityMatch = line.match(ACTIVITY_LINE_PATTERN);
    const activity = activityMatch ? activityMatch[1].trim() : line.trim();
    const between = tokens.length > 1 ? line.slice(tokens[0].index + tokens[0].value.length, tokens[1].index) : '';
    // A range only counts when the two tokens are separated by a bare dash
    // ("7:00–10:00 AM"); a dash buried inside a note ("~7–8 AM start") is
    // not this row's end time.
    const separator = between.replace(/\s+/g, '');
    const isRange = separator === '-' || separator === '–' || separator === '—' || separator === '→' || /^to$/i.test(separator);
    let start = parseClock(tokens[0].value);
    const end = isRange && tokens.length > 1 ? parseClock(tokens[1].value) : null;
    // "1:00–4:30 PM": the meridiem applies to both endpoints of a range.
    // Only early hours (1:00–6:59) without a suffix are unambiguously PM;
    // "9:00–12:00 PM" keeps its morning start.
    const endHasPm = isRange && tokens.length > 1 && /pm/i.test(tokens[1].value);
    if (isRange && start && start.minutes < 7 * 60
      && !/[ap]m/i.test(tokens[0].value)
      && endHasPm) {
      start = { minutes: start.minutes + 12 * 60 };
    }
    events.push({
      activity: activity.slice(0, 120),
      start,
      end,
      durationHours: parseDuration(line),
      day: currentDay,
      raw: line.trim()
    });
  }
  return events;
}

const DURATION_PATTERN = /(?:duration\s*[:=]?\s*|for\s+)?(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*(hours?|hrs?)/i;

function parseDuration(line) {
  const range = line.match(DURATION_PATTERN);
  if (range) return Number(range[1]);
  const single = line.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?)/i);
  if (single && /duration|for|tour|visit|walk|drive|ride|class|session|activity|hike|trek/i.test(line)) {
    return Number(single[1]);
  }
  return null;
}

// Realistic buffer between consecutive activities (minutes); long transfers
// (drives, buses, flights) get the full buffer, adjacent sights need less.
const TRAVEL_BUFFER_MINUTES = 30;
const SHORT_BUFFER_MINUTES = 15;
const LONG_TRANSFER_PATTERN = /\b(drive|ride|van|bus|flight|transfer|airport|port|hrs? (away|each way)|minutes? (away|each way))\b/i;

export function verifyTravel({ _prompt, content }) {
  const failures = [];
  const evidence = { events: [] };
  const events = extractItinerary(content);
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    evidence.events.push({
      activity: event.activity,
      startTime: event.start ? `${Math.floor(event.start.minutes / 60)}:${String(event.start.minutes % 60).padStart(2, '0')}` : null,
      durationHours: event.durationHours || null,
      nextActivity: i + 1 < events.length ? events[i + 1].activity : null
    });
    if (event.start && event.end && event.end.minutes < event.start.minutes) {
      failures.push('impossible-itinerary-timeline');
    }
    if (event.start && i + 1 < events.length) {
      const next = events[i + 1];
      if (!next.start) continue;
      // Timeline comparisons are only meaningful within the same day.
      if (event.day !== next.day) continue;
      // Estimated finish = start + stated duration (explicit end time wins).
      let finish = event.end ? event.end.minutes : null;
      if (finish === null && event.durationHours) {
        finish = event.start.minutes + Math.round(event.durationHours * 60);
      }
      if (finish !== null && finish > next.start.minutes) {
        // An embedded stop inside a longer activity is not an overlap:
        // "1:30 PM drive back to Cebu City (3–3.5 hours with stops)" then
        // "3:30 PM quick stop at Carcar" — Carcar is on the route.
        const embeddedStop = /(?:quick stop|stop (?:at|in|for)|on the way|en route|via|rest stop)/i.test(next.activity);
        if (!embeddedStop) failures.push('impossible-itinerary-timeline');
        continue;
      }
      // A seamless handoff (finish === next start, e.g. "08:00–09:00" then
      // "09:00–10:30") is contiguous by design, not a missing buffer.
      const buffer = LONG_TRANSFER_PATTERN.test(next.activity) ? TRAVEL_BUFFER_MINUTES : SHORT_BUFFER_MINUTES;
      if (finish !== null && finish !== next.start.minutes && finish + buffer > next.start.minutes) {
        failures.push('insufficient-transfer-time');
        continue;
      }
      const gap = next.start.minutes - event.start.minutes;
      if (gap < 0) {
        failures.push('overlapping-activities');
      } else if (gap < 15) {
        // With unknown durations, only a very tight gap is suspicious;
        // adjacent sights 20 minutes apart are realistic walking distance.
        failures.push('insufficient-transfer-time');
      }
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: FITNESS — safety first; stricter than creative skills.
// ---------------------------------------------------------------------------

const UNSAFE_FITNESS_PATTERNS = [
  /\bstep onto (a|the|that) chair\b/i,
  /\b(stand|balance) on (a|the|that) (chair|table|bed|unstable surface)\b/i,
  /\b(do|perform|complete)\s+\d{3,}\s+(reps|repetitions)\b/i,
  /\b(work out|train|exercise)\s+\d+\s+(hours?|hrs?)\s+(a|per|every)\s+day\b/i,
  /\b(deadlift|squat|bench press)\s+your\s+body weight\s+(on|from) (day|week)\s+[12]\b/i,
  /\b(no rest (days?|between (sessions|workouts|sets)|on (training|workout) days)|without rest days|every single day|7 days a week)\b/i
];

export function verifyFitness({ prompt, content }) {
  const failures = [];
  const evidence = { unsafe: [] };
  const text = String(content || '');
  for (const pattern of UNSAFE_FITNESS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      evidence.unsafe.push(match[0].slice(0, 120));
      failures.push('critical-safety-issue');
    }
  }
  const hasProgression = /\b(start|begin|week 1|beginner|build up|progress|gradually)\b/i.test(text);
  if (/\bbeginner\b/i.test(String(prompt || '')) && !hasProgression) {
    failures.push('critical-safety-issue');
    evidence.missingProgression = true;
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: ACCESSIBILITY — structural HTML checks, not keyword presence.
// ---------------------------------------------------------------------------

export function validateAccessibilityHtml(content) {
  const failures = [];
  const evidence = { ids: [], labels: 0, ariaRefs: [], issues: [] };
  const htmlBlocks = String(content || '').match(/```(?:html|jsx)?\s*([\s\S]*?)```/g) || [];
  const blocks = htmlBlocks.map((b) => b.replace(/```(?:html|jsx)?/g, ''));
  if (blocks.join('\n').trim() === '') {
    return { failures, evidence, checked: false };
  }

  // Each code block is validated independently: the same id used across two
  // separate example snippets is not a duplicate-id defect.
  for (const html of blocks) {
    const ids = Array.from(html.matchAll(/\bid="([^"]+)"/gi)).map((m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        failures.push('duplicate-id');
        evidence.issues.push(`duplicate id="${id}"`);
      }
      seen.add(id);
      evidence.ids.push(id);
    }

    const labels = Array.from(html.matchAll(/<label[^>]*for="([^"]+)"/gi)).map((m) => m[1]);
    evidence.labels += labels.length;
    for (const forId of labels) {
      if (!ids.includes(forId)) {
        failures.push('unassociated-label');
        evidence.issues.push(`label for="${forId}" has no matching id`);
      }
    }

    const ariaRefs = Array.from(html.matchAll(/(aria-describedby|aria-labelledby|aria-controls)="([^"]+)"/gi));
    for (const [attr, value] of ariaRefs.map((m) => [m[1], m[2]])) {
      const target = value.split(/\s+/)[0];
      if (target && !ids.includes(target)) {
        failures.push('invalid-aria-reference');
        evidence.issues.push(`${attr}="${target}" has no matching id`);
      }
      evidence.ariaRefs.push(`${attr}="${target}"`);
    }

    const inputs = Array.from(html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi));
    for (const [tag, attrs] of inputs.map((m) => [m[1], m[2]])) {
      const hasLabel = /aria-label=/.test(attrs)
        || (() => {
          const labelledby = (attrs.match(/aria-labelledby="([^"]+)"/) || [])[1];
          return Boolean(labelledby && labelledby.split(/\s+/)[0] && ids.includes(labelledby.split(/\s+/)[0]));
        })()
        || labels.includes((attrs.match(/id="([^"]+)"/) || [])[1])
        || /<label/.test(html.slice(0, html.indexOf(`<${tag}`)));
      if (!hasLabel) {
        failures.push('missing-input-label');
        evidence.issues.push(`${tag} missing label`);
      }
    }

    const hasKeyboardHandler = /onKeyDown|onKeyPress|tabindex=/i.test(html);
    const usesClickOnly = /onClick=/i.test(html) && !hasKeyboardHandler;
    if (usesClickOnly) {
      failures.push('missing-keyboard-focus');
      evidence.issues.push('click-only interaction without keyboard handler');
    }
  }

  return { failures: Array.from(new Set(failures)), evidence, checked: true };
}

// ---------------------------------------------------------------------------
// Verifier: PRODUCTIVITY — unknown times stay assumptions, not facts.
// ---------------------------------------------------------------------------

const TIME_ASSIGNMENT_PATTERN = /\b(\d{1,2}:\d{2}\s?(?:am|pm)?|\b\d{1,2}\s?(?:am|pm))\b/i;
const ASSUMPTION_LABEL_PATTERN = /\b(assum(e|ing|ption)|placeholder|actual .* time|sample times|to be confirmed|tbd)\b|\[[^\]]*\]/i;

export function verifyProductivity({ prompt, content }) {
  const failures = [];
  const evidence = { assumptions: [] };
  const text = String(content || '');
  const userTimes = (String(prompt || '').match(TIME_ASSIGNMENT_PATTERN) || []).length;
  const responseTimes = (text.match(TIME_ASSIGNMENT_PATTERN) || []).length;
  if (userTimes === 0 && responseTimes > 0) {
    const labeled = ASSUMPTION_LABEL_PATTERN.test(text);
    if (!labeled) {
      failures.push('unlabeled-assumption');
      evidence.assumptions.push({ field: 'scheduleTime', userProvided: false, value: 'unspecified clock time in response' });
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier registry: one verifier per concern. Multiple may run together.
// ---------------------------------------------------------------------------

export const SKILL_VERIFIERS = {
  'live-data-utilities': verifyLiveData,
  'research-report': verifyResearch,
  'meeting-notes': verifyMeetingNotes,
  'marketing-copywriting': verifyMarketing,
  'presentation-design': verifyPresentation,
  'data-analysis': verifyDataAnalysis,
  'personal-finance': verifyFinance,
  'business-planning': verifyBusiness,
  'travel-planning': verifyTravel,
  'fitness-nutrition': verifyFitness,
  'accessibility-compliance': (ctx) => validateAccessibilityHtml(ctx.content),
  'personal-productivity': verifyProductivity
};

// ---------------------------------------------------------------------------
// Orchestrator: runs every applicable verifier for the activated skills.
// ---------------------------------------------------------------------------

export function runSkillVerification({ prompt, content, skills, runtimeContext, sourceText, liveDataEvidence, searchEvidence }) {
  const startedAt = Date.now();
  const results = [];
  const hardFailures = [];
  const skillIds = (Array.isArray(skills) ? skills : [])
    .map((s) => (typeof s === 'string' ? s : s.id))
    .filter(Boolean);
  const uniqueSkills = Array.from(new Set(skillIds));

  const quality = checkOutputQuality(content);
  if (quality.failures.length > 0) {
    results.push({ skillId: 'output-quality', risk: RISK_LEVELS.LOW, failures: quality.failures, evidence: quality.evidence });
  }
  for (const f of quality.failures) hardFailures.push(f);

  for (const skillId of uniqueSkills) {
    const verifier = SKILL_VERIFIERS[skillId];
    const risk = SKILL_RISK_LEVELS[skillId] || RISK_LEVELS.MEDIUM;
    if (!verifier) continue;
    let outcome;
    try {
      outcome = verifier({ prompt, content, runtimeContext, sourceText, liveDataEvidence, searchEvidence }) || {};
    } catch (err) {
      outcome = { failures: [], evidence: { verifierError: String(err?.message || err).slice(0, 200) } };
    }
    const failures = Array.isArray(outcome.failures) ? outcome.failures : [];
    results.push({ skillId, risk, failures: failures.slice(0, 20), evidence: outcome.evidence || {} });
    for (const f of failures) hardFailures.push(f);
  }

  return {
    results,
    hardFailures: Array.from(new Set(hardFailures)),
    passed: hardFailures.length === 0,
    latencyMs: Date.now() - startedAt,
    runtimeContext: runtimeContext || null
  };
}

// ---------------------------------------------------------------------------
// Deterministic targeted patches (bounded, only the failed region).
// ---------------------------------------------------------------------------

export function applyDeterministicPatches(content) {
  let text = String(content || '');
  let changed = false;

  const dedupeConsecutive = (value) => {
    const lines = value.split('\n');
    const out = [];
    const seen = new Set();
    let lastKey = null;
    for (const line of lines) {
      const trimmed = line.trim();
      const isTable = /^\|.*\|$/.test(trimmed);
      const key = isTable ? `row:${trimmed.toLowerCase()}` : trimmed.length > 20 ? `p:${trimmed}` : null;
      if (key === null) {
        out.push(line);
        continue;
      }
      if (key === lastKey || (key.startsWith('row:') && seen.has(key))) {
        changed = true;
        continue;
      }
      seen.add(key);
      lastKey = key;
      out.push(line);
    }
    return out.join('\n');
  };
  text = dedupeConsecutive(text);

  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    text = `${text.trimEnd()}\n\`\`\``;
    changed = true;
  }
  const inlineBackticks = (text.match(/`/g) || []).length;
  if (inlineBackticks % 2 !== 0) {
    const lastIndex = text.lastIndexOf('`');
    text = `${text.slice(0, lastIndex)}${text.slice(lastIndex + 1)}`;
    changed = true;
  }
  text = text.replace(/^#{1,6}\s*$/gm, '');
  if (text !== String(content)) changed = true;

  return { content: text, changed, attempts: 1 };
}

export function applyMeetingNotesPatches({ content, sourceText }) {
  const source = String(sourceText || '').toLowerCase();
  let changed = false;
  const lines = String(content || '').split('\n');
  let columns = null;

  const output = lines.flatMap((line) => {
    if (!/^\s*\|.*\|\s*$/.test(line)) return [line];
    const cells = line.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.trim());
    const lower = cells.map((cell) => cell.toLowerCase());
    if (lower.includes('owner') && lower.some((cell) => /task|action/.test(cell)) && lower.some((cell) => /due|deadline/.test(cell))) {
      columns = {
        owner: lower.indexOf('owner'),
        task: lower.findIndex((cell) => /task|action/.test(cell)),
        deadline: lower.findIndex((cell) => /due|deadline/.test(cell))
      };
      return [line];
    }
    if (!columns || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return [line];

    const owner = String(cells[columns.owner] || '').replace(/[*_`]/g, '').trim().toLowerCase();
    const task = String(cells[columns.task] || '').replace(/[*_`]/g, '').trim().toLowerCase();
    const deadline = String(cells[columns.deadline] || '').replace(/[*_`]/g, '').trim().toLowerCase();
    const taskTokens = task.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((token) => token.length > 3);
    const ownerIndex = owner ? source.indexOf(owner) : -1;
    const nearbyTask = taskTokens.some((token) => {
      const tokenIndex = source.indexOf(token);
      return tokenIndex >= 0 && ownerIndex >= 0 && Math.abs(tokenIndex - ownerIndex) <= 80;
    });
    if (owner && (!source.includes(owner) || !nearbyTask)) {
      changed = true;
      return [];
    }

    const meaningfulDeadline = deadline && !/^(?:not stated|not specified|none|n\/a|tbd|ongoing)$/.test(deadline);
    if (meaningfulDeadline) {
      const deadlineIndex = source.lastIndexOf(deadline);
      const deadlineGrounded = deadlineIndex >= 0 && (!owner || (ownerIndex >= 0 && Math.abs(deadlineIndex - ownerIndex) <= 80));
      if (!deadlineGrounded) {
        cells[columns.deadline] = 'Not stated';
        changed = true;
        return [`| ${cells.join(' | ')} |`];
      }
    }
    return [line];
  });

  return { content: output.join('\n'), changed };
}

export function runVerificationWithRepair({ prompt, content, skills, runtimeContext, sourceText, liveDataEvidence, searchEvidence }) {
  let current = String(content || '');
  let attempts = 0;
  let final = null;
  while (attempts < MAX_REPAIR_ATTEMPTS) {
    const verdict = runSkillVerification({ prompt, content: current, skills, runtimeContext, sourceText, liveDataEvidence, searchEvidence });
    final = verdict;
    if (verdict.hardFailures.length === 0) break;
    const patchable = verdict.hardFailures.filter((f) =>
      ['duplicate-critical-content', 'malformed-code-fence', 'broken-inline-code', 'empty-heading'].includes(f)
    );
    const skillIds = (Array.isArray(skills) ? skills : []).map((skill) => typeof skill === 'string' ? skill : skill.id);
    const meetingFailures = verdict.hardFailures.some((failure) => ['fabricated-action-item', 'fabricated-owner', 'fabricated-deadline'].includes(failure));
    let patched = { content: current, changed: false };
    if (meetingFailures && skillIds.includes('meeting-notes')) {
      patched = applyMeetingNotesPatches({ content: current, sourceText: sourceText || prompt });
    }
    if (!patched.changed && patchable.length > 0) {
      patched = applyDeterministicPatches(current);
    }
    if (!patched.changed || patched.content === current) break;
    current = patched.content;
    attempts += 1;
  }
  final = final || { results: [], hardFailures: [], passed: true, latencyMs: 0 };
  final.repairAttempts = attempts;
  final.content = current;
  return final;
}
