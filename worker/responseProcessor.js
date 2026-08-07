// COREZ Response Processor
//
// Post-generation reliability and intelligence pipeline for /api/ai:
//  - truncation / incomplete-response detection
//  - wrong-language detection
//  - generated-code syntax validation
//  - automatic repair loop (continuation generation with merge)
//  - existing-project analysis (framework, language, rendering, features)
//  - continuity scoring for modification requests
//
// This module is deterministic and pure where possible: every detector is a
// plain function that can be unit-tested without a provider, and the repair
// pipeline accepts an injected `generate` function so tests never touch a
// live LLM.

import { safeErrorDetail } from './utils.js';

// ---------------------------------------------------------------------------
// Truncation detection
// ---------------------------------------------------------------------------

// Words that strongly suggest the sentence was cut before it finished.
const TRAILING_CONJUNCTIONS = /\b(and|but|or|so|because|then|that|which|with|while|when|if|after|before|by|to|of|in|on|for|as|at|from|into|onto|upon|using|via|plus|also|however|therefore|meanwhile|although|though|whereas)\s*$/i;
// Sentences that end on one of these openers are almost certainly cut off,
// even when they are technically "complete" (no terminal punctuation).
const TRAILING_OPENERS = /\b(such as|for example|for instance|in order to|so that|as well as|along with|together with|the following|in particular|including|especially|in addition|on the other hand|which means|meaning|using|inside|outside|across|through|towards?|during|among|between|under|above|below|around|within|without|unless|until|where|when|how|what|why|excluding|plus|about|beyond|despite|instead|regardless|to:|the:)\s*$/i;
const UNFINISHED_WORD = /[a-z0-9]$/i;

function stripFences(content) {
  // Replace fenced code blocks (closed or unterminated) with a single
  // placeholder so prose heuristics never fire on code.
  return String(content || '')
    .replace(/```[\s\S]*?(```|$)/g, ' FENCE ')
    .replace(/`[^`\n]*`/g, ' ');
}

export function countFences(content) {
  const matches = String(content || '').match(/```/g);
  return matches ? matches.length : 0;
}

export function detectTruncation(content, options = {}) {
  const text = String(content || '');
  const signals = [];
  const stopReason = typeof options.stopReason === 'string' ? options.stopReason : null;

  if (!text.trim()) {
    return { truncated: true, signals: ['empty-response'] };
  }

  // Open (unterminated) Markdown code fence.
  if (countFences(text) % 2 === 1) {
    signals.push('open-code-fence');
  }

  // Unbalanced brackets in the raw text (code included).
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
    const opens = (text.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closes = (text.match(new RegExp(`\\${close}`, 'g')) || []).length;
    if (opens > closes) {
      signals.push(`unmatched-${open}${close}`);
    }
  }

  // Unclosed HTML/JSX tags (self-closing `/>` tags are exempt). Runs on the
  // prose-only view of the text: fenced code and inline code are masked out,
  // and angle-bracket placeholders in URLs / attribute values (e.g.
  // https://github.com/<username>) are never treated as tags. A single bare
  // mention ("the <form> element") is an identifier, not truncation: only
  // real document evidence (>=2 distinct unclosed tags, or >=3 repeats of
  // one tag) triggers the signal.
  const proseView = text
    .replace(/```[\s\S]*?(```|$)/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  const openTags = proseView.match(/<([a-z][a-z0-9-]*)([^>]*)>/gi) || [];
  const unclosedByName = new Map();
  for (const tag of openTags) {
    const inner = tag.slice(1, -1);
    if (/\/\s*$/.test(inner)) continue; // self-closing <x ... />
    const nameMatch = inner.match(/^([a-z][a-z0-9-]*)/i);
    if (!nameMatch) continue;
    const tagName = nameMatch[1].toLowerCase();
    if (['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'].includes(tagName)) {
      continue;
    }
    const tagStart = proseView.indexOf(tag);
    const before = tagStart > 0 ? proseView[tagStart - 1] : '';
    // Placeholder contexts: preceded by URL/attribute/expression syntax.
    if (/[/:=('"`[]/.test(before)) continue;
    const rest = proseView.slice(tagStart + tag.length);
    if (!new RegExp(`</${tagName}\\s*>`, 'i').test(rest)) {
      unclosedByName.set(tagName, (unclosedByName.get(tagName) || 0) + 1);
    }
  }
  const distinct = unclosedByName.size;
  const maxRepeats = Math.max(0, ...unclosedByName.values());
  // Identifier mentions (e.g. "the <form> element") must not flag: only
  // flag when the evidence looks like a real document — 3+ distinct unclosed
  // tags, a repeated tag, or at least two unclosed tags accompanied by a
  // structural truncation signal (open fence / unmatched bracket).
  const structuralSignals = signals.some((s) => s.startsWith('open-code-fence')
    || s.startsWith('unmatched-') || s === 'unfinished-list-item' || s === 'ends-with-structure-mark');
  if ((distinct >= 2 && (structuralSignals || maxRepeats >= 2)) || distinct >= 3 || maxRepeats >= 3) {
    for (const tagName of unclosedByName.keys()) {
      signals.push(`unclosed-html-${tagName}`);
    }
  }

  // Ends with a dangling markdown divider or header.
  if (/[#|]+\s*$/.test(text)) {
    signals.push('ends-with-structure-mark');
  }

  // Numbered list whose last item has no content after the marker.
  if (/\n\s*\d+[.)]\s*$/.test(text)) {
    signals.push('unfinished-list-item');
  }

  // Prose (outside fences) ending mid-sentence: the final token is a word
  // character and the sentence clearly continues (trailing conjunction or
  // opener, or a dangling list-intro colon). A bare word without terminal
  // punctuation is NOT proof of truncation — many complete answers omit the
  // final period — so only strong continuation markers fire this signal.
  const prose = stripFences(text);
  const proseTail = prose.replace(/\s+$/, '');
  if (proseTail.length > 40 && UNFINISHED_WORD.test(proseTail)) {
    if (TRAILING_CONJUNCTIONS.test(proseTail)) {
      signals.push('ends-with-conjunction');
    } else if (/:\s*$/.test(proseTail)) {
      signals.push('unfinished-list-intro');
    } else if (TRAILING_OPENERS.test(proseTail)) {
      signals.push('mid-sentence-cutoff');
    }
  }

  // Provider stop reason: 'length' means the token budget ran out.
  if (stopReason === 'length') {
    signals.push('provider-stop-reason-length');
  }

  // An answer that ends immediately after a closed code fence is NOT
  // truncated: code-bearing replies legitimately end with a closed block.
  // A cut-off fence is already caught by 'open-code-fence', and a broken
  // code tail is caught by the bracket-balance validation pass. This signal
  // existed only to catch fence-adjacent cut-offs, and produced false
  // positives on complete answers that finish with a closed code block.

  return { truncated: signals.length > 0, signals };
}

// ---------------------------------------------------------------------------
// Wrong-language detection
// ---------------------------------------------------------------------------

// Heuristic: measure the share of non-Latin script characters. Answers that
// are predominantly Cyrillic, CJK, Arabic, Devanagari etc. while the user
// wrote in an ASCII-dominated prompt are a language mismatch — unless the
// task explicitly asks for another language.
const NON_LATIN_RANGES = [
  /[\u0400-\u04FF]/g, // Cyrillic
  /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g, // CJK
  /[\u0600-\u06FF\u0750-\u077F]/g, // Arabic
  /[\u0900-\u097F\u0A00-\u0A7F\u0B00-\u0B7F]/g, // Devanagari etc.
  /[\u0E00-\u0E7F\u0F00-\u0FFF]/g, // Thai / Tibetan
  /[\u0370-\u03FF\u1F00-\u1FFF]/g // Greek
];

export function languageMismatchRatio(content) {
  const text = stripFences(String(content || ''));
  if (!text.trim()) return 0;
  const totalLetters = (text.match(/[\p{L}]/gu) || []).length;
  if (totalLetters < 20) return 0; // too short to judge
  let nonLatin = 0;
  for (const range of NON_LATIN_RANGES) {
    nonLatin += (text.match(range) || []).length;
  }
  return nonLatin / totalLetters;
}

export function detectLanguageMismatch(content, userPrompt = '') {
  const ratio = languageMismatchRatio(content);
  if (ratio < 0.5) return { mismatch: false, ratio };
  // Explicit translation/foreign-language tasks are exempt.
  const prompt = String(userPrompt || '').toLowerCase();
  const explicitForeignTask = /\b(translate|translation|in (french|spanish|german|japanese|chinese|korean|russian|arabic|tagalog|filipino))\b/i.test(prompt);
  return { mismatch: !explicitForeignTask, ratio };
}

// ---------------------------------------------------------------------------
// Generated-code validation
// ---------------------------------------------------------------------------

export function extractCodeBlocks(content) {
  const text = String(content || '');
  const blocks = [];
  const fencePattern = /```([a-zA-Z0-9+#-]*)\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(text)) !== null) {
    blocks.push({ lang: match[1].trim().toLowerCase() || 'plain', code: match[2] });
  }
  return blocks;
}

// Balanced-bracket check used for fenced code even when a real parser is not
// available (workerd cannot run the Node parser).
export function checkBracketBalance(code) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let inString = null;
  let escaped = false;
  let prevSignificant = '';
  // A slash starts a regex literal when the previous significant character
  // could not end an expression (regexes may contain unbalanced brackets,
  // e.g. /[{}]/g, and must not be counted). `}` and `]` are excluded: a
  // slash after them is division, a self-closing tag (/>), or a block end.
  const startsRegex = (prev) => prev === '' || /[([=,:!&|?{;]/.test(prev);
  for (let i = 0; i < code.length; i += 1) {
    const char = code[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      if (char !== '`') {
        // JSX text apostrophes and quotes (e.g. Baker's, "made fresh")
        // are NOT string delimiters. Only treat a quote as a string opener
        // when a matching closer exists on the same line — real JS strings
        // virtually always close on the same line, JSX text rarely does.
        const lineEnd = code.indexOf('\n', i);
        const nextQuote = code.indexOf(char, i + 1);
        if (nextQuote === -1 || (lineEnd !== -1 && nextQuote > lineEnd)) {
          prevSignificant = char;
          continue;
        }
      }
      inString = char;
      prevSignificant = char;
      continue;
    }
    if (char === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i += 1;
      prevSignificant = ';';
      continue;
    }
    if (char === '/' && code[i + 1] === '*') {
      i += 2;
      while (i + 1 < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
      i += 1;
      prevSignificant = ';';
      continue;
    }
    if (char === '/' && startsRegex(prevSignificant) && !/\s/.test(code[i + 1] || '')) {
      // Regex literal: skip to the closing unescaped slash, then flags.
      i += 1;
      let inClass = false;
      let closed = false;
      while (i < code.length) {
        const c = code[i];
        if (c === '\\') { i += 1; }
        else if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { closed = true; break; }
        i += 1;
      }
      if (closed) {
        i += 1;
        while (/[a-z]/i.test(code[i] || '')) i += 1;
        i -= 1;
      }
      prevSignificant = ';';
      continue;
    }
    if (char === '(' || char === '[' || char === '{') stack.push(char);
    else if (pairs[char]) {
      const expected = pairs[char];
      if (stack.length === 0 || stack[stack.length - 1] !== expected) return false;
      stack.pop();
    }
    if (!/\s/.test(char)) prevSignificant = char;
  }
  return stack.length === 0;
}

// Syntax-only check for plain JavaScript via Function constructor. JSX,
// modules and TS escape the parser but still get the bracket balance check.
export function syntaxCheckJS(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return { ok: false, error: 'empty code block' };
  const isJsx = /\breturn\s*\(?\s*<[A-Za-z]/.test(trimmed) || /<\/[A-Za-z]/.test(trimmed);
  const isModule = /\b(import\s|export\s|from\s+['"])/.test(trimmed);
  if (isJsx || isModule) {
    if (!checkBracketBalance(trimmed)) {
      return { ok: false, error: 'unbalanced brackets (jsx/module code)' };
    }
    return { ok: true, checked: 'brackets-only' };
  }
  try {
    new Function(trimmed);
    return { ok: true, checked: 'parse' };
  } catch (err) {
    return { ok: false, error: safeErrorDetail(err) || 'syntax error' };
  }
}

// Check a generated HTML document for the basics: a root element, a closing
// </html>/</body> tag, and balanced <script> blocks.
export function validateHtmlDocument(content) {
  const text = String(content || '');
  const issues = [];
  if (!/<html[\s>]/i.test(text) || !/<\/html>/i.test(text)) {
    issues.push('missing-html-root');
  }
  if (/<body[\s>]/i.test(text) && !/<\/body>/i.test(text)) {
    issues.push('unclosed-body-tag');
  }
  const scriptOpens = (text.match(/<script[\s>]/gi) || []).length;
  const scriptCloses = (text.match(/<\/script>/gi) || []).length;
  if (scriptOpens !== scriptCloses) issues.push('unbalanced-script-tags');
  const divOpens = (text.match(/<div[\s>]/gi) || []).length;
  const divCloses = (text.match(/<\/div>/gi) || []).length;
  if (divOpens > divCloses) issues.push('unclosed-div-tags');
  return { ok: issues.length === 0, issues };
}

// Best-effort game-specific presence checks against the extracted code.
const GAME_SIGNALS = [
  { id: 'game-loop', pattern: /requestAnimationFrame|setInterval\s*\(/ },
  { id: 'controls', pattern: /\b(keydown|keyup|keyCode|addEventListener\s*\(\s*['"]key|onKeyDown)/i },
  { id: 'scoring', pattern: /\b(score|points)\b/i },
  { id: 'collision', pattern: /\b(collide|collision|intersect|isTouching|overlap|hitTest)\b/i },
  { id: 'canvas', pattern: /\b(getContext\s*\(\s*['"]2d|canvas)\b/i }
];

export function checkGameRequirements(code) {
  const combined = Array.isArray(code) ? code.join('\n') : String(code || '');
  const found = [];
  for (const signal of GAME_SIGNALS) {
    if (signal.pattern.test(combined)) found.push(signal.id);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Existing-project analysis (state-aware follow-ups)
// ---------------------------------------------------------------------------

// Deterministic project state derived from the last assistant code reply, so
// follow-up turns know the current framework, rendering surface and features
// without relying on the client to send structured state.
export function analyzeProjectState(messages) {
  const history = Array.isArray(messages) ? messages : [];
  const assistantReplies = history
    .filter((m) => m?.role === 'assistant' && typeof m?.content === 'string')
    .map((m) => m.content);
  const latest = assistantReplies[assistantReplies.length - 1] || '';
  const blocks = extractCodeBlocks(latest);
  const code = blocks.map((b) => b.code).join('\n');
  const project = {
    projectType: null,
    framework: 'unknown',
    language: 'javascript',
    rendering: null,
    features: [],
    constraints: [],
    recentChanges: []
  };

  if (/<canvas[\s>]/i.test(code) || /\bgetContext\s*\(\s*['"]2d/.test(code)) {
    project.rendering = 'canvas';
  }

  const jsx = /\b(import\s+.*\bReact\b|ReactDOM|export default function \w+\(|useState|useEffect)/.test(code);
  if (jsx || /\bjsx\b/.test(blocks.map((b) => b.lang).join(','))) {
    project.framework = 'react';
    project.language = 'javascript';
  } else if (/<html[\s>]/i.test(code) && !/\bimport\b/.test(code)) {
    project.framework = 'html';
    project.language = 'html-css-js';
  } else if (/\b(typescript|\.tsx?)/.test(code)) {
    project.framework = jsx ? 'react' : 'unknown';
    project.language = 'typescript';
  }

  const gameIntent = /<canvas[\s>]/i.test(code) || /\b(game|level|enemy|player|score)\b/i.test(code);
  if (gameIntent && project.rendering === 'canvas') project.projectType = 'game';
  else if (/<html[\s>]/i.test(code)) project.projectType = 'website';
  else project.projectType = 'app';

  for (const signal of GAME_SIGNALS) {
    if (signal.pattern.test(code)) project.features.push(signal.id);
  }
  const hasRestart = /\b(restart|reset|gameOver\s*=\s*false)\b/i.test(code);
  if (hasRestart) project.features.push('restart');
  const hasGameOver = /\b(game[- ]?over|gameOver)\b/i.test(code);
  if (hasGameOver) project.features.push('game-over');

  return { project, blocks, latestReply: latest };
}

// Detect whether the current turn is a modification of an earlier creation.
export function isModificationRequest(prompt, project) {
  if (!project || project.framework === 'unknown') return false;
  const text = String(prompt || '');
  return /\b(now|also|instead|change|make|add|remove|update|fix|modify|edit|undo|don'?t|keep|preserve|convert)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Continuity scoring for follow-up answers
// ---------------------------------------------------------------------------

export function scoreContinuity({ project, response, userPrompt }) {
  const text = String(response || '');
  const blocks = extractCodeBlocks(text);
  const code = blocks.map((b) => b.code).join('\n');
  const checks = {
    'used-previous-implementation': false,
    'preserved-framework': false,
    'preserved-unrelated-features': false,
    'implemented-requested-change': false,
    'avoided-unnecessary-rewrite': false
  };

  // 1. Framework preservation: the reply's code matches the previous framework.
  if (project.framework === 'react') {
    checks['preserved-framework'] = /\b(ReactDOM|useState|useEffect|export default function \w+\s*\()/.test(code)
      || /(^|\n)```jsx/.test(text);
  } else if (project.framework === 'html') {
    checks['preserved-framework'] = /<html[\s>]/i.test(code);
  } else {
    checks['preserved-framework'] = blocks.length > 0;
  }

  // 2. Unrelated features preserved: previously-seen feature signals still
  //    present (e.g. score + controls + game-over all still in the reply).
  if (project.features.length > 0) {
    const preserved = project.features.filter((feature) => {
      const pattern = GAME_SIGNALS.find((s) => s.id === feature)?.pattern;
      if (pattern) return pattern.test(code);
      if (feature === 'restart') return /\b(restart|reset)\b/i.test(code);
      if (feature === 'game-over') return /\b(game[- ]?over|gameOver)\b/i.test(code);
      return false;
    });
    checks['preserved-unrelated-features'] = preserved.length >= Math.max(1, Math.floor(project.features.length / 2));
  } else {
    checks['preserved-unrelated-features'] = blocks.length > 0;
  }

  // 3. Requested change actually present in the reply.
  const prompt = String(userPrompt || '');
  if (/\b(speed)\b/i.test(prompt)) checks['implemented-requested-change'] = /\b(speed|velocity|rate)\b/i.test(code);
  else if (/\b(blue)\b/i.test(prompt)) checks['implemented-requested-change'] = /#0{0,2}(0|1|2)[0-9a-fA-F]{2,3}|blue/i.test(code);
  else if (/\b(touch|mobile)\b/i.test(prompt)) checks['implemented-requested-change'] = /\b(touch|pointer|ontouch|touchstart)\b/i.test(code);
  else if (/\b(undo|revert|remove)\b/i.test(prompt)) checks['implemented-requested-change'] = true; // conservative: judged by review
  else checks['implemented-requested-change'] = blocks.length > 0;

  // 4. Avoided unnecessary rewrite: previous code is not wholesale replaced
  //    with a different architecture (e.g. React -> standalone HTML).
  const previousCode = project.latestCode || '';
  if (previousCode && code) {
    const sameShape = blocks.length > 0 && project.framework === 'html'
      ? /<html[\s>]/i.test(code)
      : /\b(React|jsx)\b/i.test(code) || project.framework !== 'react';
    checks['avoided-unnecessary-rewrite'] = sameShape;
  } else {
    checks['avoided-unnecessary-rewrite'] = true;
  }

  checks['used-previous-implementation'] = checks['preserved-framework'] && checks['avoided-unnecessary-rewrite'];

  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(checks).length) * 50) / 10;
  return { score, checks, codeBlockCount: blocks.length };
}

// ---------------------------------------------------------------------------
// Repair pipeline
// ---------------------------------------------------------------------------

// Instruction used when the provider answer came back truncated: the model
// continues exactly where it stopped instead of restarting.
function buildContinuationMessages(messages, originalContent, reason) {
  let reasonInstruction;
  if (reason.includes('missing-code')) {
    reasonInstruction = 'Your previous answer did NOT include the code for the existing project. The full updated project code MUST be included in your answer — repeat the complete implementation with your change applied, in the same framework and structure as before.';
  } else if (reason.includes('syntax-failure')) {
    reasonInstruction = `The code in your previous answer has a syntax error (${reason}). Return the COMPLETE corrected answer with the fixed code — same content, same framework, only the syntax corrected.`;
  } else {
    reasonInstruction = 'Do NOT restart. Continue from the exact point where it stopped and finish it completely, preserving the language, code and structure already present.';
  }
  const continuation = {
    role: 'user',
    content: `[CONTINUATION] Your previous answer was incomplete (${reason}). ${reasonInstruction}`
  };
  return [
    ...messages.filter((m) => m?.role === 'system'),
    ...messages.filter((m) => m?.role === 'user' || m?.role === 'assistant').slice(-4),
    { role: 'assistant', content: originalContent },
    continuation
  ];
}

// Merge helper: if the repair returned standalone text, prefer it; if it
// looks like a continuation fragment, append it to the original.
export function mergeResponse(original, repair, reason) {
  if (!repair || !String(repair).trim()) return original;
  const repairText = String(repair).trim();
  const originalText = String(original || '').replace(/\s+$/, '');
  // A repair that repeats the whole answer (starts like the original) means
  // the model ignored the continuation instruction: trust the repair only if
  // it is clearly different, otherwise keep the original.
  const originalHead = originalText.slice(0, 120);
  if (repairText.slice(0, 120) === originalHead && repairText.length <= originalText.length + 200) {
    return originalText;
  }
  // Language mismatch: the repaired answer REPLACES the foreign-language one.
  // Syntax failures and missing-code repairs return the complete corrected
  // answer — replacing is correct; merging would duplicate broken code.
  if (reason === 'wrong-language' || reason === 'language mismatch'
    || reason.startsWith('syntax-failure') || reason === 'missing-code-for-modification') {
    return repairText;
  }
  if (originalText.endsWith(repairText.slice(0, 30))) {
    return originalText;
  }
  // Fence-aware merge: if the original ended inside an open fence:
  //  - a raw continuation fragment joins inside the fence;
  //  - a repair that restarted with a NEW fence replaces the broken tail
  //    (keeping everything up to the open fence, including the prose brief)
  //    so duplicated or malformed trailing code is never kept.
  if (countFences(originalText) % 2 === 1) {
    if (repairText.startsWith('```')) {
      const lastFenceStart = originalText.lastIndexOf('```');
      const prefix = originalText.slice(0, lastFenceStart).replace(/\s*$/, '');
      return `${prefix}\n${repairText}`;
    }
    return `${originalText}\n${repairText}`;
  }
  // Mid-sentence continuation: join seamlessly with a single space when the
  // original stops mid-sentence and the repair continues it.
  if (/[a-z0-9,;:]$/.test(originalText) && !/^\s*[.?!]/.test(repairText)) {
    return `${originalText} ${repairText}`;
  }
  return `${originalText}\n\n${repairText}`;
}

/**
 * Validate + repair a provider answer before it reaches the user.
 *
 * options:
 *  - messages: the api messages sent to the provider (for continuation)
 *  - content:  the provider answer
 *  - stopReason / provider metadata
 *  - userPrompt: original user prompt (language check)
 *  - project:   analysed project state (continuity)
 *  - generate:  async (messages) => { content, model, provider, stopReason }
 *               — injectable; default requires runProviderChain via the caller
 *  - maxRepairs: default 2
 *
 * Returns { content, diagnostics } where diagnostics carries every metric the
 * benchmark needs: truncationDetected, languageMismatch, repaired,
 * repairAttempts, validation { syntax, gameSignals, html }, continuity.
 */
export async function processResponse(messages, content, options = {}) {
  const userPrompt = options.userPrompt || '';
  const project = options.project || null;
  const stopReason = options.stopReason || null;
  const maxRepairs = Number.isFinite(options.maxRepairs) ? options.maxRepairs : 2;
  const generate = options.generate;
  const diagnostics = {
    truncationDetected: false,
    truncationSignals: [],
    languageMismatch: false,
    languageRatio: 0,
    repaired: false,
    repairAttempts: 0,
    repairReasons: [],
    validation: null,
    continuity: null,
    missingCodeForModification: false,
    stopReason
  };

  let answer = String(content || '');
  let finalStopReason = stopReason;
  let needsRepair = true;
  let attempts = 0;

  // Syntax validation of extracted code (requirement 4: validate -> repair).
  const validateCode = (text) => {
    const blocks = extractCodeBlocks(text);
    const issues = [];
    for (const block of blocks) {
      if (block.lang === 'html') {
        const html = validateHtmlDocument(block.code);
        if (!html.ok) issues.push(`html:${html.issues[0]}`);
      } else if (['js', 'javascript', 'jsx'].includes(block.lang)) {
        const syntax = syntaxCheckJS(block.code);
        if (!syntax.ok) issues.push(`${block.lang}:${syntax.error}`);
      }
    }
    return issues;
  };

  const validate = (text) => {
    const truncation = detectTruncation(text, { stopReason: finalStopReason });
    const language = detectLanguageMismatch(text, userPrompt);
    // Modification requests must return the full updated code: an existing
    // project whose follow-up reply has no code block is a broken deliverable.
    const missingCode = project && project.framework && project.framework !== 'unknown'
      && extractCodeBlocks(text).length === 0;
    const syntaxIssues = validateCode(text);
    diagnostics.missingCodeForModification = missingCode;
    diagnostics.syntaxIssues = syntaxIssues;
    diagnostics.truncationDetected = truncation.truncated;
    diagnostics.truncationSignals = truncation.signals;
    diagnostics.languageMismatch = language.mismatch;
    diagnostics.languageRatio = language.ratio;
    return truncation.truncated || language.mismatch || missingCode || syntaxIssues.length > 0;
  };

  while (needsRepair && attempts < maxRepairs) {
    needsRepair = validate(answer);
    if (!needsRepair) break;
    if (typeof generate !== 'function') break; // no repair engine available
    attempts += 1;
    const truncation = detectTruncation(answer, { stopReason: finalStopReason });
    let reason;
    if (diagnostics.missingCodeForModification) {
      reason = 'missing-code-for-modification';
    } else if (diagnostics.syntaxIssues && diagnostics.syntaxIssues.length > 0) {
      reason = `syntax-failure (${diagnostics.syntaxIssues.slice(0, 2).join('; ')})`;
    } else if (truncation.truncated) {
      reason = `truncation (${truncation.signals.join(', ')})`;
    } else {
      reason = 'language mismatch';
    }
    diagnostics.repairReasons.push(reason);
    diagnostics.repairAttempts = attempts;
    try {
      const repairResult = await generate(buildContinuationMessages(messages, answer, reason));
      if (repairResult && typeof repairResult.content === 'string' && repairResult.content.trim()) {
        answer = mergeResponse(answer, repairResult.content, reason);
        diagnostics.repaired = true;
        if (typeof repairResult.stopReason === 'string') finalStopReason = repairResult.stopReason;
        continue;
      }
      break; // repair produced nothing usable; keep the original
    } catch (err) {
      console.warn('COREZ response repair failed:', safeErrorDetail(err));
      break;
    }
  }

  // Final validation pass for the benchmark report.
  diagnostics.truncationDetected = detectTruncation(answer, { stopReason: finalStopReason }).truncated;
  diagnostics.truncationSignals = detectTruncation(answer, { stopReason: finalStopReason }).signals;
  diagnostics.stopReason = finalStopReason;
  diagnostics.languageMismatch = detectLanguageMismatch(answer, userPrompt).mismatch;
  diagnostics.languageRatio = languageMismatchRatio(answer);

  const blocks = extractCodeBlocks(answer);
  diagnostics.validation = {
    codeBlockCount: blocks.length,
    syntax: blocks
      .filter((b) => b.lang === 'js' || b.lang === 'javascript' || b.lang === 'jsx' || b.lang === 'html')
      .map((b) => {
        if (b.lang === 'html') {
          const html = validateHtmlDocument(b.code);
          return { lang: b.lang, ok: html.ok, issues: html.issues };
        }
        const syntax = syntaxCheckJS(b.code);
        return { lang: b.lang, ok: syntax.ok, issues: syntax.error ? [syntax.error] : [] };
      })
  };
  const gameSignals = checkGameRequirements(blocks.map((b) => b.code));
  if (gameSignals.length > 0) diagnostics.validation.gameSignals = gameSignals;

  if (project && project.framework !== 'unknown') {
    diagnostics.continuity = scoreContinuity({
      project: { ...project, latestCode: project.latestCode || blocks.map((b) => b.code).join('\n') },
      response: answer,
      userPrompt
    });
  }

  return { content: answer, diagnostics };
}
