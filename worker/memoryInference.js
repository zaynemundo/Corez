// ---------------------------------------------------------------------
// User memory command patterns (remember / recall / forget / who-am-I)
// and behavioral interest inference profiler.
// ---------------------------------------------------------------------

export const MEMORY_RECALL_PATTERN =
  /\b(what do you know about me|who am i|what do you remember about me|do you remember me|list (?:what|everything) you (?:know|remember) about me|show (?:what|everything) you (?:know|remember) about me|what have you remembered about me)\b/i;
export const MEMORY_REMEMBER_PATTERN =
  /^\s*(?:please\s+)?remember\s+(?:that\s+|this\s+|my\s+|me\s+|for\s+me\s+)?([\s\S]+?)\s*$/i;
export const MEMORY_FORGET_PATTERN =
  /^\s*(?:please\s+)?forget\s+(.+?)\s*$/i;
export const MEMORY_SECRET_PATTERN =
  /\b(password|passwd|api[_-]?key|secret|token|ssn|credit\s*card|bank\s*account)\b/i;
export const MEMORY_NAME_PATTERN = /\bmy\s+name\s+is\s+([^.,;!?]{2,60})/i;

const INFERENCE_TOPIC_PATTERNS = [
  {
    topic: "marketing",
    key: "interest.marketing",
    text: "User appears to work in marketing",
    pattern:
      /\b(caption|hashtags?|campaign|brand(ing)?|social\s+post|social\s+media\s+(post|content|manager|marketing)|ad\s+copy|seo\b|flyer|brochure|newsletter|press\s+release|influencer|content\s+calendar)\b/i,
  },
  {
    topic: "coding",
    key: "interest.coding",
    text: "User appears to work on software tasks",
    pattern:
      /\b(api|endpoint|debug|deploy|refactor|pull\s+request|merge\s+conflict|code\s+review|unit\s+test|database\s+migration)\b/i,
  },
  {
    topic: "design",
    key: "interest.design",
    text: "User appears to work in design",
    pattern:
      /\b(logo|wireframe|mockup|palette|typography|ux\b|ui\s+design|figma|brand\s+identity)\b/i,
  },
  {
    topic: "writing",
    key: "interest.writing",
    text: "User appears to do writing work",
    pattern:
      /\b(essay|blog\s+post|article|thesis|novel|short\s+story|poem|manuscript|cover\s+letter)\b/i,
  },
  {
    topic: "data",
    key: "interest.data",
    text: "User appears to work with data",
    pattern:
      /\b(spreadsheet|dashboard|dataset|pivot\s*table|data\s+analysis|kpi\s+report)\b/i,
  },
  {
    topic: "business",
    key: "interest.business",
    text: "User appears to work in business",
    pattern:
      /\b(pitch\s+deck|invoice|business\s+plan|meeting\s+agenda|revenue|sales\s+report|startup)\b/i,
  },
  {
    topic: "education",
    key: "interest.education",
    text: "User appears to work in education",
    pattern:
      /\b(lesson\s+plan|curriculum|syllabus|classroom|assignment|report\s+card)\b/i,
  },
];

const INFERENCE_STACKS = [
  "react",
  "vue",
  "angular",
  "svelte",
  "next",
  "python",
  "javascript",
  "typescript",
  "node",
  "php",
  "laravel",
  "django",
  "flutter",
  "swift",
  "kotlin",
  "java",
  "wordpress",
  "shopify",
];
const INFERENCE_STACK_PATTERN = new RegExp(
  `(?:using|with|built (?:with|in)|coded? in|written in)\\s+(${INFERENCE_STACKS.join("|")})\\b`,
  "i",
);
const INFERENCE_ORG_PATTERN =
  /(?:for|at)\s+([A-Z][A-Za-z&.'-]{1,30}(?:\s+[A-Z][A-Za-z&.'-]{1,30}){0,3})/;
const INFERENCE_ORG_STOPLIST = new Set([
  "free",
  "you",
  "me",
  "corez",
  "please",
  "sale",
  "marketing",
  "sales",
  "school",
  "office",
  "work",
  "home",
  "team",
  "christmas",
  "halloween",
  "easter",
  "ramadan",
  "diwali",
]);
const INFERENCE_SENSITIVE_PATTERN =
  /\b(diagnos(is|ed)|symptom|treatment|doctor|hospital|loan|mortgage|debt|bankrupt|prayer|church|mosque|vote|election|therapy|insurance\s+claim|lawsuit|lawyer)\b/i;

export function detectInferenceSignals(prompt) {
  const signals = [];
  if (typeof prompt !== "string" || !prompt.trim()) return signals;
  const scrubbed = prompt.replace(/```[\s\S]*?```/g, " ");
  if (INFERENCE_SENSITIVE_PATTERN.test(scrubbed)) return signals;
  if (MEMORY_SECRET_PATTERN.test(scrubbed)) return signals;
  const sentences = String(scrubbed).split(/(?<=[.!?\n])\s*/);
  const statements = sentences.filter((s) => {
    const t = s.trim();
    if (!/[?]\s*$/.test(t)) return true;
    return /\b(i|me|my|mine|we|our|us)\b/i.test(t);
  });
  const text = statements.join(" ");
  if (!text.trim()) return signals;
  const seen = new Set();
  for (const entry of INFERENCE_TOPIC_PATTERNS) {
    if (entry.pattern.test(text)) {
      signals.push({ key: entry.key, text: entry.text, topic: entry.topic });
      seen.add(entry.key);
    }
  }
  const stackMatch = text.match(INFERENCE_STACK_PATTERN);
  if (stackMatch) {
    const stack = stackMatch[1].toLowerCase();
    const label = stack === "next" ? "Next.js" : stackMatch[1];
    signals.push({
      key: `tech.${stack}`,
      text: `User appears to work with ${label}`,
      topic: "tech",
    });
  }
  const orgMatch = text.match(INFERENCE_ORG_PATTERN);
  if (orgMatch) {
    const org = orgMatch[1].trim();
    const slug = org
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (slug && !INFERENCE_ORG_STOPLIST.has(slug) && !seen.has(`org.${slug}`)) {
      signals.push({
        key: `org.${slug}`,
        text: `User may be associated with ${org}`,
        topic: "org",
      });
    }
  }
  return signals.slice(0, 4);
}

export function inferencePercent(fact) {
  const c = fact?.metadata?.confidence;
  return Number.isFinite(c) ? Math.round(c * 100) : 40;
}

export function inferredVerb(text) {
  return String(text || "")
    .replace(/^User appears to work in /i, "work in ")
    .replace(/^User appears to work (on|with) /i, "work $1 ")
    .replace(/^User may be associated with /i, "be connected to ");
}

export function buildMemoryRecallAnswer(account, facts) {
  const who = account?.email
    ? `You're logged in as ${account.email}`
    : `You're logged in`;
  const plan = account?.plan ? ` on the ${account.plan} plan` : "";
  const lines = [`${who}${plan}.`];
  const explicit = (Array.isArray(facts) ? facts : []).filter(
    (f) => f?.category !== "inference",
  );
  const inferred = (Array.isArray(facts) ? facts : []).filter(
    (f) => f?.category === "inference",
  );
  if (explicit.length > 0) {
    lines.push(
      "Here's what I remember about you:",
      ...explicit.map((f) => `- ${f.text}`),
    );
  } else {
    lines.push(
      "I don't have anything memorized about you yet — tell me things like " +
        `"remember that my name is..." and I'll keep them here.`,
    );
  }
  if (inferred.length > 0) {
    lines.push(
      "What I've inferred (guesses from your requests — say 'forget everything' to clear these):",
      ...inferred
        .slice(0, 8)
        .map(
          (f) =>
            `- You seem to ${inferredVerb(f.text)} (~${inferencePercent(f)}% confidence)`,
        ),
    );
  }
  return lines.join("\n");
}
