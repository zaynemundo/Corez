/**
 * Pure identity-fact detection, shared by the web memory service and the
 * native client. Extraction only: callers must offer to remember a candidate,
 * never persist it silently. Pasted code, questions and likely secrets are
 * skipped, and at most three candidates are returned.
 */
const SENSITIVE_PATTERNS =
  /\b(password|passwd|api[_-]?key|secret|token|ssn|credit\s*card|bank\s*account)\b/i;

// Volunteered identity-fact patterns: first-person or business-identity
// statements that are worth OFFERING to remember (never silent-stored).
// Each entry maps a match to a stable storage key + category + human text.
// An entry may add `validate(match)` for checks a regex cannot express
// (e.g. case-sensitive capitalisation); a false return skips the candidate.
const IDENTITY_CANDIDATE_PATTERNS = [
  {
    key: "identity.name",
    category: "identity",
    pattern: /\bmy\s+name\s+is\s+([^.,;!?]{2,60})/i,
    format: (m) => `User's name is ${m[1].trim()}`,
  },
  {
    // "You can call me Zed" — the name must be capitalised, otherwise this
    // fires on "call me when the build is done".
    key: "identity.nickname",
    category: "identity",
    pattern: /\bcall\s+me\s+([A-Za-z'’-]{1,30})\b/i,
    validate: (m) => /^[A-Z]/.test(m[1]),
    format: (m) => `User asked to be called ${m[1].trim()}`,
  },
  {
    key: "identity.role",
    category: "identity",
    pattern: /\bi(?:\s+am|\s*['’]m)\s+a(n)?\s+([^.,;!?]{2,80})/i,
    format: (m) => `User is a ${m[2].trim()}`,
  },
  {
    key: "work.employer",
    category: "work",
    pattern: /\bi\s+work\s+(with|at|for)\s+([^.,;!?]{2,80})/i,
    format: (m) => `User works ${m[1].trim()} ${m[2].trim()}`,
  },
  {
    key: "work.company",
    category: "work",
    pattern:
      /\bmy\s+(company|team|business|organisation|organization|role|job)\s+(is\s+)?([^.,;!?]{2,80})/i,
    format: (m) => `User's ${m[1].trim().toLowerCase()}: ${m[3].trim()}`,
  },
  {
    key: "identity.location",
    category: "identity",
    pattern: /\b((i\s+live\s+in)|((based|located)\s+in))\s+([^.,;!?]{2,60})/i,
    format: (m) => `User is based in ${m[5].trim()}`,
  },
  {
    key: "work.business",
    category: "work",
    pattern: /\bwe\s+(represent|provide|specialise|specialize)\s+([^.,;!?]{2,120})/i,
    format: (m) => `User's business: we ${m[1].trim().toLowerCase()} ${m[2].trim()}`,
  },
  {
    key: "work.project",
    category: "work",
    // "I'm building an online store" — the capture floor skips bare
    // pronouns ("I'm working on it").
    pattern: /\bi(?:\s+am|\s*['’]m)\s+(working\s+on|building|creating)\s+([^.,;!?]{6,80})/i,
    format: (m) => `User is ${m[1].trim().toLowerCase().replace(/\s+/g, " ")} ${m[2].trim()}`,
  },
  {
    key: "preferences.general",
    category: "preferences",
    pattern: /\bi\s+prefer\s+([^.,;!?]{2,80})/i,
    format: (m) => `User prefers ${m[1].trim()}`,
  },
  {
    key: "preferences.dislikes",
    category: "preferences",
    pattern: /\bi\s+(?:don'?t\s+like|dislike|hate)\s+([^.,;!?]{2,80})/i,
    format: (m) => `User dislikes ${m[1].trim()}`,
  },
  {
    key: "preferences.language",
    category: "preferences",
    pattern: /\b(?:my\s+(?:main\s+)?language\s+is|i\s+speak)\s+([^.,;!?]{2,40})/i,
    format: (m) => `User speaks ${m[1].trim()}`,
  },
  {
    // Closed language list: "reply in detail" must never match.
    key: "preferences.replyLanguage",
    category: "preferences",
    pattern: /\b(?:reply|respond|answer|write|speak|talk)(?:\s+to\s+me)?\s+in\s+(arabic|english|french|spanish|hindi|urdu|german)(?![a-z])/i,
    format: (m) => `User wants replies in ${m[1].trim().toLowerCase()}`,
  },
  {
    key: "preferences.style",
    category: "preferences",
    pattern: /\b(?:keep\s+(?:your\s+|the\s+)?answers?\s+short|keep\s+it\s+short|be\s+concise)\b/i,
    format: () => `User prefers short, concise answers`,
  },
  {
    key: "preferences.noEmojis",
    category: "preferences",
    pattern: /\b(?:don'?t\s+use|no)\s+emojis?\b/i,
    format: () => `User prefers no emojis`,
  },
  {
    key: "tech.stack",
    category: "tech",
    pattern: /\bmy\s+tech\s+stack\s+(is\s+)?([^.,;!?]{2,80})/i,
    format: (m) => `User's tech stack: ${m[2].trim()}`,
  },
  // Arabic volunteered facts: the interface is bilingual and the extractor
  // was English-only, so Arabic users were never offered remembers. Values
  // stay verbatim; templates stay English like every other entry.
  {
    key: "identity.name",
    category: "identity",
    pattern: /اسمي\s+([^\s.,;!?؟]{2,40})/,
    format: (m) => `User's name is ${m[1].trim()}`,
  },
  {
    key: "identity.location",
    category: "identity",
    pattern: /(?:أنا\s+من|أعيش\s+في|مقيم\s+في|ساكن\s+في)\s+([^.,;!?؟]{2,60})/,
    format: (m) => `User is based in ${m[1].trim()}`,
  },
  {
    // "أنا أفضل" only: bare أفضل also means "better/best" ("هذا أفضل").
    key: "preferences.general",
    category: "preferences",
    pattern: /أنا\s+(?:أفضل|افضل)\s+([^.,;!?؟]{2,80})/,
    format: (m) => `User prefers ${m[1].trim()}`,
  },
  {
    key: "preferences.language",
    category: "preferences",
    pattern: /(?:لغتي\s+(?:هي\s+)?|أتحدث\s+)([^\s.,;!?؟]{2,30})/,
    format: (m) => `User speaks ${m[1].trim()}`,
  },
];

const MAX_IDENTITY_CANDIDATES = 3;

function sentenceContaining(text, index) {
  const sentences = String(text).split(/(?<=[.!?\n])\s*/);
  let offset = 0;
  for (const sentence of sentences) {
    const start = String(text).indexOf(sentence, offset);
    const end = start + sentence.length;
    if (index >= start && index < end) return sentence.trim();
    offset = end;
  }
  return String(text).trim();
}

/**
 * Detect volunteered durable identity facts in a user prompt.
 * Pure function — extraction only, never stores anything.
 * Offer-first: callers must ask the user before persisting any candidate.
 * Skips interrogative sentences, fenced code blocks, secrets, and caps at 3.
 *
 * @param {string} text — raw user prompt
 * @returns {Array<{key:string, category:string, text:string}>}
 */
export function detectUserFactCandidates(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  // Pasted code is task material, never identity evidence.
  const scrubbed = text.replace(/```[\s\S]*?```/g, " ");
  const candidates = [];
  const seenKeys = new Set();
  for (const entry of IDENTITY_CANDIDATE_PATTERNS) {
    if (seenKeys.has(entry.key)) continue;
    const match = entry.pattern.exec(scrubbed);
    if (!match || match.index == null) continue;
    if (typeof entry.validate === "function") {
      let valid;
      try {
        valid = entry.validate(match) === true;
      } catch {
        valid = false;
      }
      if (!valid) continue;
    }
    const sentence = sentenceContaining(scrubbed, match.index);
    // Questions (English ? and Arabic ؟) state nothing to remember.
    if (/[?؟]\s*$/.test(sentence)) continue;
    let candidateText;
    try {
      candidateText = entry.format(match).replace(/\s+/g, " ").trim();
    } catch {
      continue;
    }
    if (!candidateText || candidateText.length > 200) continue;
    if (SENSITIVE_PATTERNS.test(candidateText)) continue;
    seenKeys.add(entry.key);
    candidates.push({
      key: entry.key,
      category: entry.category,
      text: candidateText,
    });
    if (candidates.length >= MAX_IDENTITY_CANDIDATES) break;
  }
  return candidates;
}
/** True when text looks like a secret or credential and must never be stored. */
export function isSensitiveText(text) {
  return SENSITIVE_PATTERNS.test(String(text || ""));
}
