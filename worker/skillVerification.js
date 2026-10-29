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

import {
  extractNumbers,
  extractDataSeriesNumbers,
  calcStats,
  round2,
  verifyArithmetic,
  extractActionItems,
  verifyMeetingNotes,
  verifyMarketing,
  verifyPresentation,
  verifyDataAnalysis,
  calcLinearTrend,
  verifyFinance,
  verifyBusiness,
  extractItinerary,
  verifyTravel,
  verifyFitness,
  validateAccessibilityHtml,
  verifyProductivity,
} from "./skillVerifiers.js";

export {
  extractNumbers,
  extractDataSeriesNumbers,
  calcStats,
  round2,
  verifyArithmetic,
  extractActionItems,
  verifyMeetingNotes,
  verifyMarketing,
  verifyPresentation,
  verifyDataAnalysis,
  calcLinearTrend,
  verifyFinance,
  verifyBusiness,
  extractItinerary,
  verifyTravel,
  verifyFitness,
  validateAccessibilityHtml,
  verifyProductivity,
};

export const MAX_REPAIR_ATTEMPTS = 2;

export const SKILL_HARD_FAILURES = [
  "live-data-required-but-not-used",
  "stale-live-data",
  "fabricated-live-value",
  "fabricated-current-date",
  "fabricated-current-time",
  "missing-live-source",
  "live-source-fetch-failed-but-answer-presented-as-current",
  "unsupported-citation",
  "fabricated-action-item",
  "fabricated-owner",
  "fabricated-deadline",
  "duplicate-action-item",
  "unsupported-business-claim",
  "unsupported-statistic",
  "fabricated-study-result",
  "uncited-data-claim",
  "impossible-itinerary-timeline",
  "insufficient-transfer-time",
  "overlapping-activities",
  "missing-travel-buffer",
  "arithmetic-error",
  "percentage-error",
  "trend-calculation-error",
  "unsupported-forecast",
  "critical-safety-issue",
  "duplicate-critical-content",
  "unlabeled-assumption",
  "malformed-code-fence",
  "broken-inline-code",
  "empty-heading",
  "unfinished-sentence",
];

export const SKILL_HARD_FAILURE_SET = new Set(SKILL_HARD_FAILURES);

// Risk tiers: verification cost scales with trust needs.
export const RISK_LEVELS = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  LIVE: "LIVE",
};

export const SKILL_RISK_LEVELS = {
  "creative-writing": RISK_LEVELS.LOW,
  "translation-localization": RISK_LEVELS.LOW,
  "education-tutor": RISK_LEVELS.LOW,
  "document-generation": RISK_LEVELS.LOW,
  "event-planning": RISK_LEVELS.LOW,
  "study-aids": RISK_LEVELS.LOW,
  "resume-career": RISK_LEVELS.MEDIUM,
  "presentation-design": RISK_LEVELS.MEDIUM,
  "personal-productivity": RISK_LEVELS.MEDIUM,
  "meeting-notes": RISK_LEVELS.MEDIUM,
  "marketing-copywriting": RISK_LEVELS.MEDIUM,
  "business-planning": RISK_LEVELS.MEDIUM,
  "travel-planning": RISK_LEVELS.HIGH,
  "data-analysis": RISK_LEVELS.HIGH,
  "personal-finance": RISK_LEVELS.HIGH,
  "accessibility-compliance": RISK_LEVELS.HIGH,
  "fitness-nutrition": RISK_LEVELS.HIGH,
  "research-report": RISK_LEVELS.LIVE,
  "live-data-utilities": RISK_LEVELS.LIVE,
};

// ---------------------------------------------------------------------------
// Live-data detection: which requests MUST NOT come from model memory.
// ---------------------------------------------------------------------------

export const LIVE_DATA_KINDS = [
  {
    kind: "currency",
    patterns: [
      /\b(convert|exchange)\b.{0,30}\b(currency|usd|php|eur|gbp|jpy|exchange rate|currency conversion)\b/i,
      /\b\d+(?:[\d,]*\.\d+)?\s+(?:php|usd|eur|gbp|jpy|krw|cad|aud|inr)\s+(?:to|in|into)\s+\w+\b/i,
    ],
  },
  {
    kind: "weather",
    patterns: [
      /\b(weather|forecast|temperature|humidity|wind speed)\b.{0,30}\b(today|now|right now|this week|tomorrow|current)?\b/i,
    ],
  },
  {
    kind: "stock",
    patterns: [
      /\b(stock price|share price|stock market|trading price|market cap)\b/i,
    ],
  },
  {
    kind: "crypto",
    patterns: [
      /\b(bitcoin|ethereum|btc|eth|crypto)\b.{0,20}\b(price|rate|value|cost)\b|\b(price|rate|value)\b.{0,20}\b(bitcoin|ethereum|btc|eth|crypto)\b/i,
    ],
  },
  {
    kind: "current-time",
    patterns: [
      /\bwhat('| i)?s?\s+the\s+current\s+time\b|\bcurrent time\b|\bwhat time is it (now|right now)\b/i,
    ],
  },
  {
    kind: "current-date",
    patterns: [
      /\bwhat('| i)?s?\s+(today'?s\s+)?date\b|\btoday'?s\s+date\b|\bwhat\s+day\s+is\s+it\b|\bwhat\s+year\s+is\s+it\b/i,
    ],
  },
  {
    kind: "sports",
    patterns: [
      /\b(match result|game result|scoreline)\b.{0,20}\b(team|match|game|league)\b|\bwho won\b.{0,20}\b(match|game|final|championship)\b/i,
    ],
  },
  {
    kind: "schedules",
    patterns: [
      /\b(flight schedule|train schedule|bus schedule|departure time|arrival time|showtimes|opening hours|business hours)\b/i,
    ],
  },
  {
    kind: "public-figures",
    patterns: [
      /\b(who is the (current|new) (president|prime minister|chancellor|mayor|governor)|current (president|prime minister) of)\b/i,
    ],
  },
  {
    kind: "pricing",
    patterns: [
      /\b(price of|prices? of|how much (is|does|are))\b.{0,40}\b(iphone|car|house|laptop|console|ticket|fare)\b/i,
    ],
  },
  {
    kind: "travel-info",
    patterns: [
      /\b(current (visa|entry|quarantine) (rules|requirements)|travel restrictions|visa requirements\s+(now|currently|this year))\b/i,
    ],
  },
  {
    kind: "laws",
    patterns: [
      /\b(current (law|regulation|legal age|tax rate)|minimum wage\s+(now|currently)|what is the legal age)\b/i,
    ],
  },
  {
    kind: "availability",
    patterns: [
      /\b(in stock|in stock now|available now|still available|release date|next release)\b/i,
    ],
  },
  // Music / entertainment releases: "LOOM's latest singles", "the latest
  // music Imagine Dragons created", "did they drop anything new?" must be
  // answered from search, never from model memory. The first pattern allows
  // an entity between the adjective and the noun ("newest Imagine Dragons
  // song") and includes bare "music"; writing requests ("write me a new
  // song") never match because "new" is not an adjective here and the noun
  // list excludes bare "song" when unqualified. "next" is intentionally
  // absent ("next song in my playlist" is local context; "next release" is
  // already covered by the availability kind).
  {
    kind: "media-releases",
    patterns: [
      /\b(latest|newest|recent|upcoming)\s+(?:[A-Za-z][\w'-]*\s+){0,3}(?:singles?|albums?|tracks?|ep|mixtapes?|music|music videos?|releases?|songs?)\b/i,
      /\b(?:any|what|which|have|has|did|is|are)\b.{0,30}\bnew\s+(?:songs?|singles?|albums?|music)\b/i,
      /\b(?:released?|dropped?|put\s+out)\b.{0,35}\b(?:anything|something|new|recently|lately|yet)\b/i,
    ],
  },
  // Generic freshness / status questions that no enumerated kind covers:
  // "what's new in AI?", "anything new from Vite?", "the latest iPhone",
  // "is LOOM still active?". This kind uses a SOFT grounding instruction
  // (see worker/index.js): search results are used when they answer the
  // question, otherwise the model answers from knowledge — a miss degrades
  // gracefully instead of forcing a refusal. Local-context questions
  // ("what's new in my game?", "are you still making games?") are excluded.
  {
    kind: "freshness",
    patterns: [
      /\bwhat('s| is| are)\s+new\s+(?:in|with|from|about)\s+(?!(?:my|our|your|the)\s+(?:app|game|site|code|website|project)\b)\b[A-Za-z0-9][\w .'-]{0,30}\b/i,
      /\b(?:anything|something)\s+new\b.{0,40}\b(?:from|with|about)\b/i,
      /\b(latest|newest|current)\s+(?:model|version|iphone|smartphone|console|device|software|update|release|album|single|song)\b/i,
      /\b(?:is|are|has|have)\s+(?!(?:you|your|we|our|i)\b)[A-Za-z][\w']*(?:\s+[A-Za-z][\w']*)?\s+still\s+(?:active|around|together|releasing|making|performing|touring)\b/i,
    ],
  },
];

export function detectLiveDataNeed(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return { required: false, kind: null };
  for (const { kind, patterns } of LIVE_DATA_KINDS) {
    for (const pattern of patterns) {
      if (pattern.test(text))
        return { required: true, kind, matched: String(pattern) };
    }
  }
  return { required: false, kind: null };
}

// ---------------------------------------------------------------------------
// Runtime context: the real current date/time the model must use.
// ---------------------------------------------------------------------------

export function buildRuntimeContext(now = new Date()) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const currentDate = `${byType.weekday}, ${byType.month} ${byType.day}, ${byType.year}`;
  return {
    currentDate,
    currentYear: String(date.getUTCFullYear()),
    iso: date.toISOString(),
    timezone: "UTC",
    generatedAt: date.toISOString(),
  };
}

export function buildRuntimeContextBlock(runtimeContext) {
  return `Runtime context (authoritative — treat this as the real current date; never infer the date from training data):
- Current date: ${runtimeContext.currentDate}
- Current year: ${runtimeContext.currentYear}
- Generated at: ${runtimeContext.iso} (${runtimeContext.timezone})`;
}

const TEMPORAL_CLAIM_PATTERNS = [
  {
    type: "date",
    pattern:
      /\b(?:as of|as at)\s+([A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/gi,
  },
  { type: "year", pattern: /\b(?:current year(?: is)?|as of)\s+(\d{4})\b/gi },
  {
    type: "today",
    pattern:
      /\btoday(?:'s)?\s+(?:date\s+)?is\s+([A-Z][a-z]+ \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4})/gi,
  },
];

export function parseClaimDate(value) {
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso)
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const slash = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash)
    return {
      month: Number(slash[1]),
      day: Number(slash[2]),
      year: Number(slash[3]),
    };
  const named = String(value).match(/^([A-Z][a-z]+) (\d{1,2}),? (\d{4})$/);
  if (named) {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    return {
      month: months.indexOf(named[1].toLowerCase()) + 1,
      day: Number(named[2]),
      year: Number(named[3]),
    };
  }
  return null;
}

export function checkTemporalClaims(content, runtimeContext) {
  const failures = [];
  const evidence = [];
  const text = String(content || "");
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
      if (type === "year") {
        if (claim !== currentYear) failures.push("fabricated-current-date");
      } else {
        const parsed = parseClaimDate(claim);
        if (parsed) {
          const sameDay =
            parsed.year === now.getUTCFullYear() &&
            parsed.month === currentMonth &&
            parsed.day === currentDay;
          if (!sameDay)
            failures.push(
              type === "date" ? "stale-live-data" : "fabricated-current-date",
            );
        }
      }
    }
  }

  const timePattern =
    /\b(current time(?: is|:| is now)|time right now is)\s+([0-9]{1,2}:[0-9]{2})/gi;
  timePattern.lastIndex = 0;
  let timeMatch;
  while ((timeMatch = timePattern.exec(text)) !== null) {
    const claimed = timeMatch[2];
    const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const [h, m] = claimed.split(":").map(Number);
    const claimedMinutes = (h % 24) * 60 + m;
    if (Math.abs(nowMinutes - claimedMinutes) > 10) {
      failures.push("fabricated-current-time");
      evidence.push({ type: "time", claim: claimed });
    }
  }

  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Output quality pass: structural defects detected deterministically.
// ---------------------------------------------------------------------------

export function checkOutputQuality(content) {
  const failures = [];
  const evidence = [];
  const text = String(content || "");
  const lines = text.split("\n");

  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    failures.push("malformed-code-fence");
    evidence.push({ fences: fenceCount });
  }
  const inlineBackticks = (text.match(/`/g) || []).length;
  if (inlineBackticks % 2 !== 0) {
    failures.push("broken-inline-code");
    evidence.push({ backticks: inlineBackticks });
  }

  const paragraphs = lines.map((l) => l.trim()).filter((l) => l.length > 20);
  for (let i = 1; i < paragraphs.length; i += 1) {
    if (paragraphs[i] === paragraphs[i - 1]) {
      failures.push("duplicate-critical-content");
      evidence.push({ duplicateParagraph: paragraphs[i].slice(0, 120) });
      break;
    }
  }

  const rows = text.match(/^\|.*\|$/gm) || [];
  const seenRows = new Set();
  for (const row of rows) {
    const normalized = row.toLowerCase();
    if (seenRows.has(normalized)) {
      failures.push("duplicate-critical-content");
      evidence.push({ duplicateTableRow: row.slice(0, 120) });
      break;
    }
    seenRows.add(normalized);
  }

  const emptyHeading = text.match(/^#{1,6}\s*$/gm);
  if (emptyHeading) {
    failures.push("empty-heading");
    evidence.push({ emptyHeadings: emptyHeading.length });
  }

  // Unfinished sentence: only plain prose tails count. Lists, URLs, table
  // rows, code, and closing brackets are valid structural endings.
  const tail = text
    .trim()
    .replace(/```\s*$/, "")
    .trim();
  const lastLine = tail.split("\n").filter(Boolean).pop()?.trim() || "";
  const structuralEnding =
    /^(?:[-*]|\d+[.)]|\|)/.test(lastLine) ||
    /https?:\/\/\S+$/.test(lastLine) ||
    /[.!?…""'')\]}>*|:]$/.test(lastLine) ||
    /^#{1,6}\s/.test(lastLine);
  if (tail && !structuralEnding && tail.length > 40) {
    failures.push("unfinished-sentence");
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
  /\[live data (unavailable|not configured|required)\]/i,
];

const LIVE_SOURCE_URL_PATTERN = /https?:\/\/\S+/i;

function extractLiveClaimNumbers(text) {
  const claims = [];
  const patterns = [
    /(?:[$€£₱]\s*)?(\d[\d,]*(?:\.\d+)?)(?:s)?\s*(?:%|usd|php|eur|gbp|jpy|krw|cad|aud|inr|°c|°f|m\/s|km\/h|am|pm)\b/gi,
    /[$€£₱]\s*(\d[\d,]*(?:\.\d+)?)(?:s)?\b/gi,
    /\b(?:rate|price|temperature|score|value|amount)\s+(?:is|was|=|of)\s+(\d[\d,]*(?:\.\d+)?)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(text || ""))) !== null) {
      const value = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(value)) claims.push(value);
    }
  }
  return claims;
}

export function verifyLiveData({
  prompt,
  content,
  runtimeContext,
  liveDataEvidence,
}) {
  const failures = [];
  const evidence = { liveDataRequired: false, liveDataUsed: false };
  const need = detectLiveDataNeed(prompt);
  if (!need.required)
    return { failures, evidence, liveData: { liveDataRequired: false } };
  evidence.liveDataRequired = true;
  evidence.kind = need.kind;

  const text = String(content || "");

  const promptNumbers = extractNumbers(prompt);
  const claimedNumbers = extractLiveClaimNumbers(text);
  const newNumericClaims = claimedNumbers.filter(
    (claim) =>
      !promptNumbers.some((given) => Math.abs(given - claim) < 0.000001),
  );
  const hasNumericClaim = newNumericClaims.length > 0;

  if (HONEST_LIVE_REFUSAL_PATTERNS.some((p) => p.test(text))) {
    evidence.honestRefusal = true;
    evidence.numericClaims = newNumericClaims;
    if (hasNumericClaim) failures.push("fabricated-live-value");
    return {
      failures: Array.from(new Set(failures)),
      evidence,
      liveData: {
        liveDataRequired: true,
        liveDataUsed: false,
        honestRefusal: true,
      },
    };
  }

  const citedUrls = extractCitations(text).map((citation) => citation.url);
  const fetchedUrls = new Set(
    (liveDataEvidence?.results || []).map((result) => canonicalUrl(result.url)),
  );
  const hasSource = LIVE_SOURCE_URL_PATTERN.test(text);
  const hasGroundedSource = citedUrls.some((url) =>
    fetchedUrls.has(canonicalUrl(url)),
  );
  const usedLive = Boolean(liveDataEvidence && liveDataEvidence.servedAt);

  if (usedLive) {
    evidence.liveDataUsed = true;
    const servedAt = new Date(liveDataEvidence.servedAt);
    const validTimestamp = Number.isFinite(servedAt.getTime());
    const freshnessMs = validTimestamp
      ? Math.max(0, Date.now() - servedAt.getTime())
      : null;
    evidence.freshnessMs = freshnessMs;
    evidence.dataSource = liveDataEvidence.sources || "web-search";
    evidence.fetchedAt =
      liveDataEvidence.fetchedAt || liveDataEvidence.servedAt;
    evidence.sourceTimestamp = liveDataEvidence.servedAt;
    const maxAgeMs = Number(liveDataEvidence.maxAgeMs) || 12 * 60 * 60 * 1000;
    if (!validTimestamp || freshnessMs > maxAgeMs)
      failures.push("stale-live-data");
    // A value asserted without any source marker is still fabricated even
    // when live evidence was fetched (the model ignored the evidence).
    if (hasNumericClaim && (!hasSource || !hasGroundedSource)) {
      failures.push("missing-live-source");
      failures.push("fabricated-live-value");
    }
    return {
      failures: Array.from(new Set(failures)),
      evidence,
      liveData: {
        liveDataRequired: true,
        liveDataUsed: true,
        freshnessValid: validTimestamp && freshnessMs <= maxAgeMs,
        ...evidence,
      },
    };
  }

  if (hasNumericClaim) {
    if (!hasSource) failures.push("missing-live-source");
    failures.push("fabricated-live-value");
  } else {
    failures.push("live-data-required-but-not-used");
  }

  const temporal = checkTemporalClaims(text, runtimeContext);
  for (const f of temporal.failures) failures.push(f);

  return {
    failures: Array.from(new Set(failures)),
    evidence,
    liveData: { liveDataRequired: true, liveDataUsed: false, ...evidence },
  };
}

// ---------------------------------------------------------------------------
// Verifier: RESEARCH — citations must be real and grounded, never invented.
// ---------------------------------------------------------------------------

const CITATION_PATTERN =
  /\[([^\]]+)\]\((https?:\/\/(?:[^()\s]+|\([^()\s]*\))+)\)/g;

export function extractCitations(content) {
  const text = String(content || "");
  const citations = [];
  const seen = new Set();
  CITATION_PATTERN.lastIndex = 0;
  let match;
  while ((match = CITATION_PATTERN.exec(text)) !== null) {
    citations.push({ label: match[1], url: match[2] });
    seen.add(match[2].replace(/\/+$/, "").toLowerCase());
  }
  // Plain-text URLs (numbered source lists) count as citations too — a
  // sources section written as bare links is still evidence.
  CITATION_PATTERN.lastIndex = 0;
  const textWithoutMarkdownLinks = text.replace(CITATION_PATTERN, "");
  const bareUrls =
    textWithoutMarkdownLinks.match(/https?:\/\/[^\s)\]>]+/g) || [];
  for (const url of bareUrls) {
    const cleaned = url.replace(/[,;]+$/, "");
    const key = cleaned.replace(/\/+$/, "").toLowerCase();
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
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
    if (!parsed.hostname.includes(".")) return false;
    const tld = parsed.hostname.split(".").pop();
    return /^[a-z]{2,}$/i.test(tld) && tld.length >= 2;
  } catch {
    return false;
  }
}

function canonicalUrl(value) {
  try {
    const parsed = new URL(value);
    const pathname = decodeURIComponent(parsed.pathname)
      .replace(/\/$/, "")
      .replace(/\.$/, "");
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return String(value || "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

export function verifyResearch({ prompt, content, searchEvidence }) {
  const failures = [];
  const evidence = {
    requestedSources: 0,
    fetchedSources: 0,
    verifiedSources: 0,
    failedSources: 0,
    citations: [],
  };
  const text = String(content || "");
  const askedForSources =
    /\b(cite|sources?|references?|latest|current|recent|as of)\b/i.test(
      String(prompt || ""),
    );

  const citations = extractCitations(text);
  const fetchedUrls = new Set(
    (searchEvidence?.results || []).map((r) => canonicalUrl(r.url)),
  );

  for (const citation of citations) {
    const valid = validCitationUrl(citation.url);
    const fetched =
      fetchedUrls.size > 0 && fetchedUrls.has(canonicalUrl(citation.url));
    evidence.citations.push({
      id: `c-${evidence.citations.length + 1}`,
      url: citation.url,
      title: citation.label,
      fetched: Boolean(fetched),
      verified: valid && fetched,
      supportsClaim: fetched ? "pending" : null,
      claims: [],
    });
    if (!valid) {
      evidence.failedSources += 1;
      failures.push("unsupported-citation");
    } else if (fetched) {
      evidence.fetchedSources += 1;
      evidence.verifiedSources += 1;
    } else if (askedForSources) {
      evidence.failedSources += 1;
      failures.push("unsupported-citation");
    }
  }
  evidence.requestedSources = citations.length;

  const hasAnyGrounded =
    citations.length > 0 &&
    evidence.fetchedSources >= Math.ceil(citations.length * 0.5);
  if (askedForSources && citations.length === 0) {
    failures.push("unsupported-citation");
  }
  evidence.groundingValid = hasAnyGrounded;
  evidence.groundingMode = searchEvidence?.servedAt
    ? "external-research"
    : "model-knowledge";
  evidence.servedAt = searchEvidence?.servedAt || null;
  evidence.fetchedAt = searchEvidence?.fetchedAt || null;

  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier registry: one verifier per concern. Multiple may run together.
// ---------------------------------------------------------------------------

export const SKILL_VERIFIERS = {
  "live-data-utilities": verifyLiveData,
  "research-report": verifyResearch,
  "meeting-notes": verifyMeetingNotes,
  "marketing-copywriting": verifyMarketing,
  "presentation-design": verifyPresentation,
  "data-analysis": verifyDataAnalysis,
  "personal-finance": verifyFinance,
  "business-planning": verifyBusiness,
  "travel-planning": verifyTravel,
  "fitness-nutrition": verifyFitness,
  "accessibility-compliance": (ctx) => validateAccessibilityHtml(ctx.content),
  "personal-productivity": verifyProductivity,
};

// ---------------------------------------------------------------------------
// Orchestrator: runs every applicable verifier for the activated skills.
// ---------------------------------------------------------------------------

export function runSkillVerification({
  prompt,
  content,
  skills,
  runtimeContext,
  sourceText,
  liveDataEvidence,
  searchEvidence,
}) {
  const startedAt = Date.now();
  const results = [];
  const hardFailures = [];
  const skillIds = (Array.isArray(skills) ? skills : [])
    .map((s) => (typeof s === "string" ? s : s.id))
    .filter(Boolean);
  const uniqueSkills = Array.from(new Set(skillIds));

  const quality = checkOutputQuality(content);
  if (quality.failures.length > 0) {
    results.push({
      skillId: "output-quality",
      risk: RISK_LEVELS.LOW,
      failures: quality.failures,
      evidence: quality.evidence,
    });
  }
  for (const f of quality.failures) hardFailures.push(f);

  for (const skillId of uniqueSkills) {
    const verifier = SKILL_VERIFIERS[skillId];
    const risk = SKILL_RISK_LEVELS[skillId] || RISK_LEVELS.MEDIUM;
    if (!verifier) continue;
    let outcome;
    try {
      outcome =
        verifier({
          prompt,
          content,
          runtimeContext,
          sourceText,
          liveDataEvidence,
          searchEvidence,
        }) || {};
    } catch (err) {
      outcome = {
        failures: [],
        evidence: { verifierError: String(err?.message || err).slice(0, 200) },
      };
    }
    const failures = Array.isArray(outcome.failures) ? outcome.failures : [];
    results.push({
      skillId,
      risk,
      failures: failures.slice(0, 20),
      evidence: outcome.evidence || {},
    });
    for (const f of failures) hardFailures.push(f);
  }

  return {
    results,
    hardFailures: Array.from(new Set(hardFailures)),
    passed: hardFailures.length === 0,
    latencyMs: Date.now() - startedAt,
    runtimeContext: runtimeContext || null,
  };
}

// ---------------------------------------------------------------------------
// Deterministic targeted patches (bounded, only the failed region).
// ---------------------------------------------------------------------------

export function applyDeterministicPatches(content) {
  let text = String(content || "");
  let changed = false;

  const dedupeConsecutive = (value) => {
    const lines = value.split("\n");
    const out = [];
    const seen = new Set();
    let lastKey = null;
    for (const line of lines) {
      const trimmed = line.trim();
      const isTable = /^\|.*\|$/.test(trimmed);
      const key = isTable
        ? `row:${trimmed.toLowerCase()}`
        : trimmed.length > 20
          ? `p:${trimmed}`
          : null;
      if (key === null) {
        out.push(line);
        continue;
      }
      if (key === lastKey || (key.startsWith("row:") && seen.has(key))) {
        changed = true;
        continue;
      }
      seen.add(key);
      lastKey = key;
      out.push(line);
    }
    return out.join("\n");
  };
  text = dedupeConsecutive(text);

  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 !== 0) {
    text = `${text.trimEnd()}\n\`\`\``;
    changed = true;
  }
  const inlineBackticks = (text.match(/`/g) || []).length;
  if (inlineBackticks % 2 !== 0) {
    const lastIndex = text.lastIndexOf("`");
    text = `${text.slice(0, lastIndex)}${text.slice(lastIndex + 1)}`;
    changed = true;
  }
  text = text.replace(/^#{1,6}\s*$/gm, "");
  if (text !== String(content)) changed = true;

  return { content: text, changed, attempts: 1 };
}

export function applyMeetingNotesPatches({ content, sourceText }) {
  const source = String(sourceText || "").toLowerCase();
  let changed = false;
  const lines = String(content || "").split("\n");
  let columns = null;

  const output = lines.flatMap((line) => {
    if (!/^\s*\|.*\|\s*$/.test(line)) return [line];
    const cells = line
      .replace(/^\s*\||\|\s*$/g, "")
      .split("|")
      .map((cell) => cell.trim());
    const lower = cells.map((cell) => cell.toLowerCase());
    if (
      lower.includes("owner") &&
      lower.some((cell) => /task|action/.test(cell)) &&
      lower.some((cell) => /due|deadline/.test(cell))
    ) {
      columns = {
        owner: lower.indexOf("owner"),
        task: lower.findIndex((cell) => /task|action/.test(cell)),
        deadline: lower.findIndex((cell) => /due|deadline/.test(cell)),
      };
      return [line];
    }
    if (!columns || cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
      return [line];

    const owner = String(cells[columns.owner] || "")
      .replace(/[*_`]/g, "")
      .trim()
      .toLowerCase();
    const task = String(cells[columns.task] || "")
      .replace(/[*_`]/g, "")
      .trim()
      .toLowerCase();
    const deadline = String(cells[columns.deadline] || "")
      .replace(/[*_`]/g, "")
      .trim()
      .toLowerCase();
    const taskTokens = task
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3);
    const ownerIndex = owner ? source.indexOf(owner) : -1;
    const nearbyTask = taskTokens.some((token) => {
      const tokenIndex = source.indexOf(token);
      return (
        tokenIndex >= 0 &&
        ownerIndex >= 0 &&
        Math.abs(tokenIndex - ownerIndex) <= 80
      );
    });
    if (owner && (!source.includes(owner) || !nearbyTask)) {
      changed = true;
      return [];
    }

    const meaningfulDeadline =
      deadline &&
      !/^(?:not stated|not specified|none|n\/a|tbd|ongoing)$/.test(deadline);
    if (meaningfulDeadline) {
      const deadlineIndex = source.lastIndexOf(deadline);
      const deadlineGrounded =
        deadlineIndex >= 0 &&
        (!owner ||
          (ownerIndex >= 0 && Math.abs(deadlineIndex - ownerIndex) <= 80));
      if (!deadlineGrounded) {
        cells[columns.deadline] = "Not stated";
        changed = true;
        return [`| ${cells.join(" | ")} |`];
      }
    }
    return [line];
  });

  return { content: output.join("\n"), changed };
}

export function runVerificationWithRepair({
  prompt,
  content,
  skills,
  runtimeContext,
  sourceText,
  liveDataEvidence,
  searchEvidence,
}) {
  let current = String(content || "");
  let attempts = 0;
  let final = null;
  while (attempts < MAX_REPAIR_ATTEMPTS) {
    const verdict = runSkillVerification({
      prompt,
      content: current,
      skills,
      runtimeContext,
      sourceText,
      liveDataEvidence,
      searchEvidence,
    });
    final = verdict;
    if (verdict.hardFailures.length === 0) break;
    const patchable = verdict.hardFailures.filter((f) =>
      [
        "duplicate-critical-content",
        "malformed-code-fence",
        "broken-inline-code",
        "empty-heading",
      ].includes(f),
    );
    const skillIds = (Array.isArray(skills) ? skills : []).map((skill) =>
      typeof skill === "string" ? skill : skill.id,
    );
    const meetingFailures = verdict.hardFailures.some((failure) =>
      [
        "fabricated-action-item",
        "fabricated-owner",
        "fabricated-deadline",
      ].includes(failure),
    );
    let patched = { content: current, changed: false };
    if (meetingFailures && skillIds.includes("meeting-notes")) {
      patched = applyMeetingNotesPatches({
        content: current,
        sourceText: sourceText || prompt,
      });
    }
    if (!patched.changed && patchable.length > 0) {
      patched = applyDeterministicPatches(current);
    }
    if (!patched.changed || patched.content === current) break;
    current = patched.content;
    attempts += 1;
  }
  final = final || {
    results: [],
    hardFailures: [],
    passed: true,
    latencyMs: 0,
  };
  final.repairAttempts = attempts;
  final.content = current;
  return final;
}
