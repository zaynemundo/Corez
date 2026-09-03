// Creation Harness Verifier — deterministic, pure-JS checks for artifacts
// produced by the build loop. Runs inside the Worker (no jsdom, no DOM):
// every check is static so a full HTML document can be validated without
// executing untrusted code.

const MAX_PAGES = 12;

// Sequential <script>/<style> tag balance scan. Returns issue codes:
// - 'stray-closing-tag': a </script>/</style> with no preceding open (the
//   model omitted the opening tag; the browser renders the block as text).
// - 'malformed-block-open': an opening tag that swallowed lines (no ">" on
//   the tag's own line) — same visible-text failure.
// - 'truncated-block': opens without closes (output cut off mid-block).
function scanBlockBalance(content) {
  const pattern = /<\/?(script|style)\b[^>]*>/gi;
  let depth = 0;
  let match;
  const issues = [];
  while ((match = pattern.exec(content)) !== null) {
    const token = match[0];
    if (/^<\//i.test(token)) {
      depth -= 1;
      if (depth < 0) {
        issues.push("stray-closing-tag");
        depth = 0;
      }
    } else if (!/\/>/.test(token)) {
      depth += 1;
      if (/[\r\n]/.test(token)) issues.push("malformed-block-open");
    }
  }
  if (depth > 0) issues.push("truncated-block");
  return issues;
}

const GAME_LOOP_PATTERNS = /\b(requestAnimationFrame|setInterval)\b/i;
const GAME_UPDATE_PATTERNS = /\b(gameLoop|update|render|loop)\b/i;
const INPUT_PATTERNS =
  /\b(addEventListener\s*\(\s*['"](keydown|keyup|mousedown|mouseup|mousemove|click|touchstart)['"])/i;
// A game is not functional without a visible way to begin play: a Play/Start/
// Deploy/Begin/Retry button (matched by label or by id/class), or a canvas
// that starts on click. Presence of input listeners alone is not enough —
// pointer-lock FPS builds have listeners yet leave the player stranded on a
// menu with no working start control.
function hasStartControl(content) {
  const btnRe = /<(button|a)\b([^>]*)>([\s\S]{0,80}?)<\/\1>/gi;
  let m;
  while ((m = btnRe.exec(content)) !== null) {
    const attrs = m[2] || "";
    const text = (m[3] || "").replace(/<[^>]*>/g, " ");
    if (/\b(play|start|deploy|begin|retry)\b/i.test(text)) return true;
    if (
      /\b(id|class)\s*=\s*["'][^"']*\b(start|play|deploy|begin|retry)\b[^"']*["']/i.test(
        attrs,
      )
    )
      return true;
  }
  if (
    /<canvas\b[^>]*(id|class)=["'][^"']*\b(start|play)\b[^"']*["']/i.test(content)
  )
    return true;
  return false;
}
// A complete game must be winnable or losable (ideally both). Endless builds
// with no terminal state can never be finished, verified, or reviewed.
const TERMINAL_STATE_PATTERNS =
  /\b(victory|you win|win screen|level clear|stage clear|mission complete|mission failed|game complete|game-complete|gameover|game over|you lose|you lost|you died|out of (lives|hearts)|no lives left)\b/i;
export const DEFAULT_APPROVED_CDNS = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdn.tailwindcss.com",
  "esm.sh",
  "cdn.skypack.dev",
  "cdn.babylonjs.com",
  "threejs.org",
  "fonts.googleapis.com",
];

export function verifyCreation(html, options = {}) {
  const { intentType = "app", allowedExternalScripts = DEFAULT_APPROVED_CDNS } =
    options;
  const content = String(html || "");
  const failures = [];

  if (!content.trim()) {
    return {
      passed: false,
      failures: [{ code: "empty-output", detail: "The artifact is empty." }],
    };
  }

  if (!/<html[\s>]/i.test(content) || !/<\/html>/i.test(content)) {
    failures.push({
      code: "incomplete-html",
      detail: "The artifact is missing a complete <html>...</html> document.",
    });
  }

  // Structural block balance: <script>/<style> opens and closes must match in
  // order. A stray closing tag (a close with no preceding open) means the
  // model omitted the opening tag — the browser then renders the whole block
  // as visible page text. An unclosed block means the output was cut off. An
  // opening tag whose span up to its first ">" contains a newline means the
  // tag swallowed the first lines of its block (also renders as page text).
  const balanceIssues = scanBlockBalance(content);
  for (const issue of balanceIssues) {
    if (issue === "stray-closing-tag") {
      failures.push({
        code: "stray-closing-tag",
        detail:
          "The artifact has a </script> or </style> closing tag with no matching opening tag — the browser renders the block as visible page text.",
      });
    } else if (issue === "malformed-block-open") {
      failures.push({
        code: "malformed-script-tag",
        detail:
          "A <script> or <style> opening tag is malformed and swallows the first lines of its block, so the browser renders the block as visible page text.",
      });
    } else {
      failures.push({
        code: "truncated-block",
        detail:
          "The artifact has an unclosed <script> or <style> block — output was likely cut off.",
      });
    }
  }

  const scriptTags =
    content.match(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi) || [];
  const allowedList =
    Array.isArray(allowedExternalScripts) && allowedExternalScripts.length > 0
      ? allowedExternalScripts
      : DEFAULT_APPROVED_CDNS;

  for (const tag of scriptTags) {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = srcMatch[1].trim();
    if (/^https?:\/\//i.test(src)) {
      const isAllowed = allowedList.some((domain) =>
        src.toLowerCase().includes(domain.toLowerCase()),
      );
      if (!isAllowed) {
        failures.push({
          code: "external-script",
          detail: `The artifact loads an untrusted external script (${src}), which is blocked in the preview sandbox.`,
        });
        break;
      }
    }
  }

  const braceOpen = (content.match(/\{/g) || []).length;
  const braceClose = (content.match(/\}/g) || []).length;
  if (Math.abs(braceOpen - braceClose) > 10) {
    failures.push({
      code: "unbalanced-braces",
      detail: `Braces are badly unbalanced (${braceOpen} open vs ${braceClose} close).`,
    });
  }

  const isGame =
    /game_creation/.test(intentType) || /\bgame\b/i.test(intentType);
  if (isGame) {
    if (!/<canvas[\s>]/i.test(content)) {
      failures.push({
        code: "missing-canvas",
        detail: "The game has no <canvas> element to render into.",
      });
    }
    if (
      !GAME_LOOP_PATTERNS.test(content) ||
      !GAME_UPDATE_PATTERNS.test(content)
    ) {
      failures.push({
        code: "missing-loop",
        detail:
          "The game has no animation loop (requestAnimationFrame/setInterval + update/render).",
      });
    }
    if (!INPUT_PATTERNS.test(content)) {
      failures.push({
        code: "missing-input",
        detail: "The game registers no keyboard/mouse/touch input listeners.",
      });
    }
    if (!hasStartControl(content)) {
      failures.push({
        code: "missing-start",
        detail:
          "The game has no visible start/play control (Play/Start/Deploy/Begin/Retry button) — the player lands with no working way to begin play.",
      });
    }
    if (!TERMINAL_STATE_PATTERNS.test(content)) {
      failures.push({
        code: "missing-terminal-state",
        detail:
          "The game defines no win/victory or lose/game-over end state — a game that can never be won or lost is not a complete, verifiable deliverable.",
      });
    }
  }

  const isWebsite = /website_creation|design_task/.test(intentType);
  if (isWebsite) {
    const links =
      content.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi) || [];
    const pages = new Set(["index.html"]);
    const hrefs = [];
    for (const link of links) {
      const match = link.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!match) continue;
      const href = match[1].trim();
      if (
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("/")
      )
        continue;
      hrefs.push(href);
      pages.add(href);
    }
    if (pages.size > MAX_PAGES) {
      failures.push({
        code: "too-many-pages",
        detail: `The site references ${pages.size} pages; the limit is ${MAX_PAGES}.`,
      });
    }
    if (hrefs.length > 0) {
      for (const href of hrefs) {
        if (!/<html[\s>]/i.test(content) && href.endsWith(".html")) {
          // A multi-page site missing its index is caught by the incomplete check.
          break;
        }
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

export function isTruncated(html) {
  return verifyCreation(html).failures.some(
    (f) => f.code === "truncated-block" || f.code === "incomplete-html",
  );
}

// Deterministic spec-coverage check: distinctive content words from the
// planning spec must mostly appear in the finished artifact. The spec is a
// short model-written brief, so only content words (>= 4 chars, not generic
// build vocabulary) count; synonyms and paraphrases are tolerated via a
// lenient ratio, and tiny specs are never failed.
const SPEC_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "have",
  "will",
  "would",
  "should",
  "could",
  "their",
  "they",
  "them",
  "there",
  "were",
  "been",
  "being",
  "into",
  "over",
  "under",
  "about",
  "after",
  "before",
  "between",
  "during",
  "while",
  "when",
  "where",
  "which",
  "what",
  "then",
  "than",
  "also",
  "only",
  "just",
  "very",
  "more",
  "most",
  "some",
  "such",
  "each",
  "both",
  "other",
  "make",
  "made",
  "build",
  "built",
  "create",
  "created",
  "design",
  "designed",
  "using",
  "used",
  "use",
  "game",
  "app",
  "site",
  "website",
  "page",
  "screen",
  "canvas",
  "html",
  "css",
  "js",
  "code",
  "user",
  "player",
  "single",
  "file",
  "simple",
  "basic",
  "need",
  "want",
  "like",
  "include",
  "includes",
  "including",
  "feature",
  "features",
  "support",
  "supports",
  "must",
  "may",
  "might",
  "within",
  "across",
  "through",
  "together",
  "however",
  "although",
  "because",
  "since",
  "until",
  "unless",
  "without",
  "version",
  "style",
  "styles",
  "color",
  "colors",
  "colour",
  "colours",
  "control",
  "controls",
  "button",
  "buttons",
  "keyboard",
  "mouse",
  "touch",
  "display",
  "window",
]);

export function verifySpecCoverage(spec, artifact, options = {}) {
  const minRatio = options.minRatio ?? 0.5;
  const specText = String(spec || "");
  const artifactText = String(artifact || "").toLowerCase();
  const tokens = [
    ...new Set(specText.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []),
  ].filter((t) => t.length >= 4 && !SPEC_STOPWORDS.has(t));
  if (tokens.length < 3) {
    return {
      passed: true,
      covered: tokens.length,
      total: tokens.length,
      ratio: 1,
      missing: [],
    };
  }
  const missing = tokens.filter((t) => !artifactText.includes(t));
  const ratio = (tokens.length - missing.length) / tokens.length;
  // Lenient: fewer than 3 absent spec words is treated as covered (models
  // legitimately paraphrase), and a small spec is never a hard fail.
  const passed = ratio >= minRatio || missing.length < 3;
  return {
    passed,
    covered: tokens.length - missing.length,
    total: tokens.length,
    ratio,
    missing,
  };
}

export function buildRepairPrompt(
  originalPrompt,
  currentArtifact,
  failures,
  attempt,
  maxAttempts,
) {
  const lines = [
    `Your previous build did not pass functional verification (attempt ${attempt}/${maxAttempts}).`,
    "",
    "Fix ALL of the following problems in your new output. Keep every working feature intact.",
    "Output the complete, finished artifact again as a single self-contained HTML document.",
    "",
    "Verification failures:",
  ];
  for (const failure of failures) {
    lines.push(`- [${failure.code}] ${failure.detail}`);
  }
  lines.push("", "User request:", originalPrompt);
  return lines.join("\n");
}
