/**
 * Domain-specific skill verifiers and deterministic numeric calculators
 * extracted from worker/skillVerification.js.
 */

// ---------------------------------------------------------------------------
// Deterministic calculator: numbers verified by code, not memory.
// ---------------------------------------------------------------------------

export function extractNumbers(value) {
  const text = String(value || "");
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  return matches
    .map((m) => Number(m.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

export function extractDataSeriesNumbers(value) {
  const text = String(value || "")
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/\b\d[\d,]*(?:\.\d+)?\s*%/g, "");
  return extractNumbers(text);
}

export function calcStats(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  const mean = sorted.length > 0 ? sum / sorted.length : 0;
  let median = null;
  if (sorted.length > 0) {
    const mid = Math.floor(sorted.length / 2);
    median =
      sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  const pctChanges = [];
  for (let i = 1; i < numbers.length; i += 1) {
    const prev = numbers[i - 1];
    pctChanges.push(
      prev !== 0 ? ((numbers[i] - prev) / Math.abs(prev)) * 100 : null,
    );
  }
  return { sum, mean, median, pctChanges, count: sorted.length };
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}

export function verifyArithmetic({
  expected,
  actual,
  tolerance = 0.01,
  failure = "arithmetic-error",
}) {
  const failures = [];
  const evidence = [];
  if (
    expected === null ||
    expected === undefined ||
    actual === null ||
    actual === undefined
  ) {
    return { failures, evidence };
  }
  const exp = Number(expected);
  const act = Number(actual);
  const diff = Math.abs(exp - act);
  const rel = exp !== 0 ? diff / Math.abs(exp) : diff;
  if (diff > tolerance && rel > tolerance) {
    failures.push(failure);
    evidence.push({
      expected: exp,
      actual: act,
      diff: round2(diff),
      relative: round2(rel),
    });
  }
  return { failures, evidence };
}

// ---------------------------------------------------------------------------
// Verifier: MEETING NOTES — never invent actions, owners, or deadlines.
// ---------------------------------------------------------------------------

export function extractActionItems(content) {
  const text = String(content || "");
  const actions = [];
  const tableRows = text.match(/^\|.*\|.*$/gm) || [];
  const headerLower = String(tableRows[0] || "").toLowerCase();
  // Detect table orientation: | Task | Owner | Deadline | is common too.
  const taskFirst =
    /task/.test(headerLower) &&
    /owner/.test(headerLower) &&
    headerLower.indexOf("task") < headerLower.indexOf("owner");
  for (const row of tableRows.slice(1)) {
    const cells = row
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
    const normalized = cells.join(" ").toLowerCase();
    if (
      normalized.startsWith("owner ") ||
      normalized.startsWith("task ") ||
      /^[-:]+$/.test(cells.join(""))
    )
      continue;
    if (cells.length >= 2 && cells[0] && cells[0] !== "Owner") {
      const owner = taskFirst ? cells[1] || null : cells[0] || null;
      const action = taskFirst ? cells[0] || "" : cells[1] || "";
      actions.push({ owner, action, deadline: cells[2] || null });
    }
  }
  const listMatch = text.match(
    /(?:#{1,6}\s*)?(?:Action Items?|Confirmed Action Items?)\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:#{1,6}\s+|\*\*[A-Za-z])|$)/i,
  );
  if (listMatch) {
    const listText = listMatch[1];
    const bullets = listText.match(/[-*]\s+[^\n]+/g) || [];
    for (const bullet of bullets) {
      const bulletAction = bullet.replace(/^[-*]\s+/, "").trim();
      if (!bulletAction || /^[-:*|\s]+$/.test(bulletAction)) continue; // table separators and empty bullets
      let owner = null;
      let action = bulletAction;
      // "**Maria** — Own and deliver the landing page" or "Maria — Finalize pricing".
      const boldMatch = bulletAction.match(
        /^\*\*([^*]+)\*\*\s*(?:—|-|:)?\s*([\s\S]*)$/,
      );
      if (boldMatch) {
        owner = boldMatch[1].trim();
        action = boldMatch[2].trim();
      } else {
        const dashMatch = bulletAction.match(
          /^([A-Z][A-Za-z ]+?)\s*(?:—|-)\s*(.+)$/,
        );
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
  const text = String(content || "");
  const source = String(sourceText || prompt || "");

  const actions = extractActionItems(text);
  const normalizedSource = source.toLowerCase();

  const seen = new Set();
  const STOPWORDS = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "will",
    "own",
    "this",
    "that",
    "due",
    "by",
    "on",
    "per",
    "not",
    "no",
    "to",
    "of",
    "a",
    "an",
    "in",
    "at",
  ]);
  for (const action of actions) {
    const actionLower = String(action.action || "").toLowerCase();
    const key = `${String(action.owner || "").toLowerCase()}|${actionLower}`;
    if (seen.has(key)) {
      failures.push("duplicate-action-item");
      continue;
    }
    seen.add(key);

    const tokens = actionLower
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3 && !STOPWORDS.has(t));
    const groundedTokens = tokens.filter((t) => normalizedSource.includes(t));
    const actionGrounded =
      actionLower.length > 0 &&
      (normalizedSource.includes(actionLower.slice(0, 40)) ||
        (tokens.length > 0 &&
          groundedTokens.length >= Math.ceil(tokens.length / 2)));
    const ownerLower = String(action.owner || "").toLowerCase();
    const ownerIndex = ownerLower ? normalizedSource.indexOf(ownerLower) : -1;
    const tokenIndexes = groundedTokens
      .map((token) => normalizedSource.indexOf(token))
      .filter((index) => index >= 0);
    const ownerGrounded =
      !action.owner ||
      (ownerIndex >= 0 &&
        tokenIndexes.some((index) => Math.abs(index - ownerIndex) <= 80));
    const explicit = actionGrounded && ownerGrounded;
    evidence.actions.push({
      action: action.action,
      owner: action.owner,
      deadline: action.deadline,
      sourceEvidence: actionLower.slice(0, 80),
      explicit: Boolean(explicit),
    });
    if (!actionGrounded) {
      failures.push("fabricated-action-item");
    }
    if (!ownerGrounded && action.owner) {
      failures.push("fabricated-owner");
    }
    const meaningfulDeadline =
      action.deadline &&
      !/^(?:not stated|not specified|none|n\/a|tbd|ongoing)$/i.test(
        action.deadline.trim(),
      );
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
        nearOwner =
          ownerIndex >= 0 &&
          deadlineIndex >= 0 &&
          Math.abs(deadlineIndex - ownerIndex) <= 80;
      }
      if (!inSource || (ownerLower && !nearOwner)) {
        failures.push("fabricated-deadline");
      }
    }
  }

  const suggestedSection = text.match(
    /Suggested Follow-ups?:?\s*\n?([\s\S]*?)(?=\n\s*#{1,3}\s|\n\s*$)/i,
  );
  if (suggestedSection) {
    evidence.suggested = (
      suggestedSection[1].match(/[-*]\s+[^\n]+/g) || []
    ).map((b) => b.replace(/^[-*]\s+/, "").trim());
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
  /\b(roasted to order|shipped fresh|packed within hours|built our own roastery|roasting in the garage)\b/i,
];

const PLACEHOLDER_MARKERS =
  /\[(?:optional|placeholder|insert|consider|suggested)[^\]]*\]|consider (?:offering|giving|adding|using)|suggest(?:ion|ed)?/i;
const NON_ASSERTIVE_CLAIM_CONTEXT =
  /\b(?:check|confirm|verify)\s+(?:whether|if|before)\b|\bif\s+you\s+offer\b|\byour\s+real\s+(?:offer|policy|claim|rate|details?)\b/i;

export function verifyMarketing({ _prompt, content }) {
  const failures = [];
  const evidence = { claims: [] };
  const text = String(content || "");
  const lines = text.split("\n");
  for (const pattern of FABRICATED_BUSINESS_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const line = lines.find((l) => l.includes(match[0])) || match[0];
      // A claim on a line framed with brackets ("[15%] off", "over $[X]",
      // "[region/farm]") is an explicit placeholder, not an invented fact.
      // Markdown links are excluded from the bracket check.
      const withoutLinks = line.replace(/\[[^\]]+\]\([^)]+\)/g, "");
      const claimIndex = withoutLinks.indexOf(match[0]);
      const claimIsBracketed = Array.from(
        withoutLinks.matchAll(/\[[^\]]*\]/g),
      ).some(
        (bracket) =>
          claimIndex >= bracket.index &&
          claimIndex < bracket.index + bracket[0].length,
      );
      if (
        PLACEHOLDER_MARKERS.test(line) ||
        NON_ASSERTIVE_CLAIM_CONTEXT.test(line) ||
        claimIsBracketed
      )
        continue;
      evidence.claims.push(match[0].slice(0, 120));
      failures.push("unsupported-business-claim");
    }
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
  /\b\d+\s+\w+\s*=\s*\d+(?:\.\d+)?\s*(?:minutes?|hours?|days?)\b/i,
];

export function verifyPresentation({ prompt, content }) {
  const failures = [];
  const evidence = { statistics: [] };
  const text = String(content || "");
  const userNumbers = extractNumbers(String(prompt || ""));
  for (const pattern of STATISTIC_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const claimNumbers = extractNumbers(match[0]);
      const userSupplied = claimNumbers.every((n) => userNumbers.includes(n));
      if (!userSupplied) {
        evidence.statistics.push(match[0].slice(0, 120));
        failures.push("unsupported-statistic");
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
  const promptNumbers = extractDataSeriesNumbers(String(prompt || ""));
  const responseNumbers = extractNumbers(String(content || ""));
  if (promptNumbers.length >= 2) {
    const expected = calcStats(promptNumbers);
    const check = (label, expectedValue, candidates, conditional) => {
      if (conditional === false) return;
      const match = candidates.find(
        (n) =>
          Math.abs(n - expectedValue) <=
          Math.max(0.01, Math.abs(expectedValue) * 0.01),
      );
      if (match === undefined) {
        failures.push(
          label === "sum"
            ? "arithmetic-error"
            : label === "mean"
              ? "arithmetic-error"
              : "trend-calculation-error",
        );
        evidence.checks.push({
          label,
          expected: round2(expectedValue),
          found: candidates.slice(0, 5),
        });
      } else {
        evidence.checks.push({
          label,
          expected: round2(expectedValue),
          found: match,
          ok: true,
        });
      }
    };
    // The sum is only verified when the response claims one; a trend-only
    // answer ("what is the trend?") has no obligation to state a total.
    check(
      "sum",
      expected.sum,
      responseNumbers,
      /\btotal\b|\bsum of\b|\ball.?time\b/i.test(String(content || "")),
    );
    check("mean", expected.mean, responseNumbers);

    const text = String(content || "");
    const monthPercentagePattern =
      /\bmonth\s+(\d+)\b[^\n]{0,40}?\b(?:fell|dropped|decreased|declined|rose|grew|increased)\s+(?:by\s+)?(\d+(?:\.\d+)?)%/gi;
    let percentageMatch;
    while ((percentageMatch = monthPercentagePattern.exec(text)) !== null) {
      const month = Number(percentageMatch[1]);
      const claimed = Number(percentageMatch[2]);
      const expectedChange = expected.pctChanges[month - 2];
      if (
        Number.isFinite(expectedChange) &&
        Math.abs(Math.abs(expectedChange) - claimed) > 0.5
      ) {
        failures.push("percentage-error");
        evidence.checks.push({
          label: `month-${month}-percentage`,
          expected: round2(expectedChange),
          found: claimed,
        });
      }
    }

    const directionMatch = text.match(
      /\b(?:overall\s+)?trend\s+(?:is|was|looks?)\s+(upward|downward|flat|stable)\b/i,
    );
    if (directionMatch) {
      const actualDirection = numbersDirection(promptNumbers);
      const claimedDirection = /upward/i.test(directionMatch[1])
        ? "upward"
        : /downward/i.test(directionMatch[1])
          ? "downward"
          : "flat";
      if (actualDirection !== claimedDirection) {
        failures.push("trend-calculation-error");
        evidence.checks.push({
          label: "trend-direction",
          expected: actualDirection,
          found: claimedDirection,
        });
      }
    }

    const trend = calcLinearTrend(promptNumbers);
    const slopeMatch =
      text.match(
        /\blinear\s+trend\s+slope[^\d+-]{0,20}([-+]?[\d,]+(?:\.\d+)?)/i,
      ) ||
      text.match(
        /\bexpected\s+(?:increase|decrease)[^\d+-]{0,20}([-+]?[\d,]+(?:\.\d+)?)\s+per\s+(?:month|period)/i,
      );
    if (slopeMatch && trend) {
      const claimedSlope = Number(slopeMatch[1].replace(/,/g, ""));
      const signedSlope =
        /decrease/i.test(slopeMatch[0]) && claimedSlope > 0
          ? -claimedSlope
          : claimedSlope;
      const arithmetic = verifyArithmetic({
        expected: trend.slope,
        actual: signedSlope,
        tolerance: 0.01,
        failure: "trend-calculation-error",
      });
      failures.push(...arithmetic.failures);
      evidence.checks.push({
        label: "linear-trend-slope",
        expected: round2(trend.slope),
        found: signedSlope,
        ok: arithmetic.failures.length === 0,
      });
    }

    const formulaMatch = text.match(
      /(?:sales|trend|y)?\s*[≈~=]\s*([\d,]+(?:\.\d+)?)\s*\+\s*([\d,]+(?:\.\d+)?)\s*[×*x]\s*(?:month|x)/i,
    );
    const forecastMatch = text.match(
      /\bmonth\s+(\d+)\s+forecast[^\d]{0,20}([\d,]+(?:\.\d+)?)/i,
    );
    if (formulaMatch && forecastMatch) {
      const intercept = Number(formulaMatch[1].replace(/,/g, ""));
      const slope = Number(formulaMatch[2].replace(/,/g, ""));
      const month = Number(forecastMatch[1]);
      const forecast = Number(forecastMatch[2].replace(/,/g, ""));
      const formulaValue = intercept + slope * month;
      const arithmetic = verifyArithmetic({
        expected: formulaValue,
        actual: forecast,
        tolerance: 0.01,
        failure: "trend-calculation-error",
      });
      failures.push(...arithmetic.failures);
      evidence.checks.push({
        label: "forecast-formula",
        expected: formulaValue,
        found: forecast,
        ok: arithmetic.failures.length === 0,
      });
    } else if (forecastMatch && trend) {
      const month = Number(forecastMatch[1]);
      const forecast = Number(forecastMatch[2].replace(/,/g, ""));
      const expectedForecast = trend.intercept + trend.slope * month;
      const arithmetic = verifyArithmetic({
        expected: expectedForecast,
        actual: forecast,
        tolerance: 0.01,
        failure: "trend-calculation-error",
      });
      failures.push(...arithmetic.failures);
      evidence.checks.push({
        label: "linear-trend-forecast",
        expected: round2(expectedForecast),
        found: forecast,
        ok: arithmetic.failures.length === 0,
      });
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

function numbersDirection(numbers) {
  if (numbers.length < 2) return "flat";
  const delta = numbers[numbers.length - 1] - numbers[0];
  if (Math.abs(delta) < 0.000001) return "flat";
  return delta > 0 ? "upward" : "downward";
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
  const promptNumbers = extractNumbers(String(prompt || ""));
  const responseNumbers = extractNumbers(String(content || ""));
  if (promptNumbers.length > 0) {
    const income = Math.max(...promptNumbers);
    const expectedTotal = income;
    const found = responseNumbers.find(
      (n) =>
        Math.abs(n - expectedTotal) <=
        Math.max(0.01, Math.abs(expectedTotal) * 0.01),
    );
    if (found === undefined) {
      failures.push("arithmetic-error");
      evidence.checks.push({
        label: "budget-total",
        expected: round2(expectedTotal),
        found: responseNumbers.slice(0, 8),
      });
    } else {
      evidence.checks.push({
        label: "budget-total",
        expected: round2(expectedTotal),
        found,
        ok: true,
      });
    }

    const tableGroups = [];
    let activeTable = [];
    for (const line of String(content || "").split("\n")) {
      if (/^\s*\|.*\|\s*$/.test(line)) {
        activeTable.push(
          line
            .replace(/^\s*\||\|\s*$/g, "")
            .split("|")
            .map((cell) => cell.replace(/[*_`]/g, "").trim()),
        );
      } else if (activeTable.length > 0) {
        tableGroups.push(activeTable);
        activeTable = [];
      }
    }
    if (activeTable.length > 0) tableGroups.push(activeTable);

    for (const rows of tableGroups) {
      const headerIndex = rows.findIndex(
        (cells) =>
          cells.some((cell) => /category|line item/i.test(cell)) &&
          cells.some((cell) => /budget|amount|allocation/i.test(cell)),
      );
      if (headerIndex < 0) continue;
      const headers = rows[headerIndex];
      const amountIndex = headers.findIndex((cell) =>
        /budget|amount|allocation/i.test(cell),
      );
      let statedTotal = null;
      let fallbackTotal = null;
      const lineItems = [];
      for (const cells of rows.slice(headerIndex + 1)) {
        if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
        const label = String(cells[0] || "");
        const amount = extractNumbers(cells[amountIndex] || "")[0];
        if (!Number.isFinite(amount)) continue;
        if (/\bgrand total\b|^\s*total\s*$/i.test(label)) statedTotal = amount;
        else if (/\btotal\b/i.test(label)) fallbackTotal = amount;
        else lineItems.push(amount);
      }
      const tableTotal = statedTotal ?? fallbackTotal;
      if (lineItems.length >= 2 && Number.isFinite(tableTotal)) {
        const itemSum = lineItems.reduce((sum, amount) => sum + amount, 0);
        const arithmetic = verifyArithmetic({
          expected: tableTotal,
          actual: itemSum,
          tolerance: 0.001,
        });
        failures.push(...arithmetic.failures);
        evidence.checks.push({
          label: "line-item-sum",
          expected: tableTotal,
          found: itemSum,
          ok: arithmetic.failures.length === 0,
        });
      }
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

export function verifyBusiness({ _prompt, content }) {
  const failures = [];
  const evidence = { assumptionsLabeled: false };
  const text = String(content || "");
  const hasAssumptionLabels =
    /\b(assum(e|ing|ption)|illustrative|estimate|placeholder|example figure)\b/i.test(
      text,
    );
  evidence.assumptionsLabeled = hasAssumptionLabels;
  const hasFigures =
    /\b\d[\d,]*(?:\.\d+)?\s*(?:php|usd|eur|₱|€|\$|£|%)\b|\b(?:php|usd|eur|₱|€|\$|£)\s?\d[\d,]*/i.test(
      text,
    );
  if (hasFigures && !hasAssumptionLabels) {
    failures.push("unlabeled-assumption");
  }
  return { failures: Array.from(new Set(failures)), evidence };
}

// ---------------------------------------------------------------------------
// Verifier: TRAVEL — every activity must physically fit the timeline.
// ---------------------------------------------------------------------------

const CLOCK_TIME_PATTERN =
  /(\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b)/gi;
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

const DAY_MARKER_PATTERN =
  /^\s*(?:#{1,6}\s*)?(?:[-*]\s+)?day\s+(one|two|three|four|five|six|\d{1,2})\b/i;

export function extractItinerary(content) {
  const text = String(content || "");
  const events = [];
  const lines = text.split("\n");
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
    if (
      /\b(start|leave|depart|arrive|go|begin|wake|book|get|head|catch|take|before|by)\b/i.test(
        timePrefix,
      )
    )
      continue;
    const activityMatch = line.match(ACTIVITY_LINE_PATTERN);
    const activity = activityMatch ? activityMatch[1].trim() : line.trim();
    const between =
      tokens.length > 1
        ? line.slice(tokens[0].index + tokens[0].value.length, tokens[1].index)
        : "";
    // A range only counts when the two tokens are separated by a bare dash
    // ("7:00–10:00 AM"); a dash buried inside a note ("~7–8 AM start") is
    // not this row's end time.
    const separator = between.replace(/\s+/g, "");
    const isRange =
      separator === "-" ||
      separator === "–" ||
      separator === "—" ||
      separator === "→" ||
      /^to$/i.test(separator);
    let start = parseClock(tokens[0].value);
    const end =
      isRange && tokens.length > 1 ? parseClock(tokens[1].value) : null;
    // "1:00–4:30 PM": the meridiem applies to both endpoints of a range.
    // Only early hours (1:00–6:59) without a suffix are unambiguously PM;
    // "9:00–12:00 PM" keeps its morning start.
    const endHasPm =
      isRange && tokens.length > 1 && /pm/i.test(tokens[1].value);
    if (
      isRange &&
      start &&
      start.minutes < 7 * 60 &&
      !/[ap]m/i.test(tokens[0].value) &&
      endHasPm
    ) {
      start = { minutes: start.minutes + 12 * 60 };
    }
    events.push({
      activity: activity.slice(0, 120),
      start,
      end,
      durationHours: parseDuration(line),
      day: currentDay,
      raw: line.trim(),
    });
  }
  return events;
}

const DURATION_PATTERN =
  /(?:duration\s*[:=]?\s*|for\s+)?(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*(hours?|hrs?)/i;

function parseDuration(line) {
  const range = line.match(DURATION_PATTERN);
  if (range) return Number(range[1]);
  const single = line.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?)/i);
  if (
    single &&
    /duration|for|tour|visit|walk|drive|ride|class|session|activity|hike|trek/i.test(
      line,
    )
  ) {
    return Number(single[1]);
  }
  return null;
}

// Realistic buffer between consecutive activities (minutes); long transfers
// (drives, buses, flights) get the full buffer, adjacent sights need less.
const TRAVEL_BUFFER_MINUTES = 30;
const SHORT_BUFFER_MINUTES = 15;
const LONG_TRANSFER_PATTERN =
  /\b(drive|ride|van|bus|flight|transfer|airport|port|hrs? (away|each way)|minutes? (away|each way))\b/i;

export function verifyTravel({ _prompt, content }) {
  const failures = [];
  const evidence = { events: [] };
  const events = extractItinerary(content);
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    evidence.events.push({
      activity: event.activity,
      startTime: event.start
        ? `${Math.floor(event.start.minutes / 60)}:${String(event.start.minutes % 60).padStart(2, "0")}`
        : null,
      durationHours: event.durationHours || null,
      nextActivity: i + 1 < events.length ? events[i + 1].activity : null,
    });
    if (event.start && event.end && event.end.minutes < event.start.minutes) {
      failures.push("impossible-itinerary-timeline");
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
        const embeddedStop =
          /(?:quick stop|stop (?:at|in|for)|on the way|en route|via|rest stop)/i.test(
            next.activity,
          );
        if (!embeddedStop) failures.push("impossible-itinerary-timeline");
        continue;
      }
      // A seamless handoff (finish === next start, e.g. "08:00–09:00" then
      // "09:00–10:30") is contiguous by design, not a missing buffer.
      const buffer = LONG_TRANSFER_PATTERN.test(next.activity)
        ? TRAVEL_BUFFER_MINUTES
        : SHORT_BUFFER_MINUTES;
      if (
        finish !== null &&
        finish !== next.start.minutes &&
        finish + buffer > next.start.minutes
      ) {
        failures.push("insufficient-transfer-time");
        continue;
      }
      const gap = next.start.minutes - event.start.minutes;
      if (gap < 0) {
        failures.push("overlapping-activities");
      } else if (gap < 15) {
        // With unknown durations, only a very tight gap is suspicious;
        // adjacent sights 20 minutes apart are realistic walking distance.
        failures.push("insufficient-transfer-time");
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
  /\b(no rest (days?|between (sessions|workouts|sets)|on (training|workout) days)|without rest days|every single day|7 days a week)\b/i,
];

export function verifyFitness({ prompt, content }) {
  const failures = [];
  const evidence = { unsafe: [] };
  const text = String(content || "");
  for (const pattern of UNSAFE_FITNESS_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      evidence.unsafe.push(match[0].slice(0, 120));
      failures.push("critical-safety-issue");
    }
  }
  const hasProgression =
    /\b(start|begin|week 1|beginner|build up|progress|gradually)\b/i.test(text);
  if (/\bbeginner\b/i.test(String(prompt || "")) && !hasProgression) {
    failures.push("critical-safety-issue");
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
  const htmlBlocks =
    String(content || "").match(/```(?:html|jsx)?\s*([\s\S]*?)```/g) || [];
  const blocks = htmlBlocks.map((b) => b.replace(/```(?:html|jsx)?/g, ""));
  if (blocks.join("\n").trim() === "") {
    return { failures, evidence, checked: false };
  }

  // Each code block is validated independently: the same id used across two
  // separate example snippets is not a duplicate-id defect.
  for (const html of blocks) {
    const ids = Array.from(html.matchAll(/\bid="([^"]+)"/gi)).map((m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        failures.push("duplicate-id");
        evidence.issues.push(`duplicate id="${id}"`);
      }
      seen.add(id);
      evidence.ids.push(id);
    }

    const labels = Array.from(html.matchAll(/<label[^>]*for="([^"]+)"/gi)).map(
      (m) => m[1],
    );
    evidence.labels += labels.length;
    for (const forId of labels) {
      if (!ids.includes(forId)) {
        failures.push("unassociated-label");
        evidence.issues.push(`label for="${forId}" has no matching id`);
      }
    }

    const ariaRefs = Array.from(
      html.matchAll(
        /(aria-describedby|aria-labelledby|aria-controls)="([^"]+)"/gi,
      ),
    );
    for (const [attr, value] of ariaRefs.map((m) => [m[1], m[2]])) {
      const target = value.split(/\s+/)[0];
      if (target && !ids.includes(target)) {
        failures.push("invalid-aria-reference");
        evidence.issues.push(`${attr}="${target}" has no matching id`);
      }
      evidence.ariaRefs.push(`${attr}="${target}"`);
    }

    const inputs = Array.from(
      html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi),
    );
    for (const [tag, attrs] of inputs.map((m) => [m[1], m[2]])) {
      const hasLabel =
        /aria-label=/.test(attrs) ||
        (() => {
          const labelledby = (attrs.match(/aria-labelledby="([^"]+)"/) ||
            [])[1];
          return Boolean(
            labelledby &&
            labelledby.split(/\s+/)[0] &&
            ids.includes(labelledby.split(/\s+/)[0]),
          );
        })() ||
        labels.includes((attrs.match(/id="([^"]+)"/) || [])[1]) ||
        /<label/.test(html.slice(0, html.indexOf(`<${tag}`)));
      if (!hasLabel) {
        failures.push("missing-input-label");
        evidence.issues.push(`${tag} missing label`);
      }
    }

    const hasKeyboardHandler = /onKeyDown|onKeyPress|tabindex=/i.test(html);
    const usesClickOnly = /onClick=/i.test(html) && !hasKeyboardHandler;
    if (usesClickOnly) {
      failures.push("missing-keyboard-focus");
      evidence.issues.push("click-only interaction without keyboard handler");
    }
  }

  return { failures: Array.from(new Set(failures)), evidence, checked: true };
}

// ---------------------------------------------------------------------------
// Verifier: PRODUCTIVITY — unknown times stay assumptions, not facts.
// ---------------------------------------------------------------------------

const TIME_ASSIGNMENT_PATTERN =
  /\b(\d{1,2}:\d{2}\s?(?:am|pm)?|\b\d{1,2}\s?(?:am|pm))\b/i;
const ASSUMPTION_LABEL_PATTERN =
  /\b(assum(e|ing|ption)|placeholder|actual .* time|sample times|to be confirmed|tbd)\b|\[[^\]]*\]/i;

export function verifyProductivity({ prompt, content }) {
  const failures = [];
  const evidence = { assumptions: [] };
  const text = String(content || "");
  const userTimes = (String(prompt || "").match(TIME_ASSIGNMENT_PATTERN) || [])
    .length;
  const responseTimes = (text.match(TIME_ASSIGNMENT_PATTERN) || []).length;
  if (userTimes === 0 && responseTimes > 0) {
    const labeled = ASSUMPTION_LABEL_PATTERN.test(text);
    if (!labeled) {
      failures.push("unlabeled-assumption");
      evidence.assumptions.push({
        field: "scheduleTime",
        userProvided: false,
        value: "unspecified clock time in response",
      });
    }
  }
  return { failures: Array.from(new Set(failures)), evidence };
}
