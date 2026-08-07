// COREZ Response Processor
// Reliability + continuity checks for /api/ai responses.

import { safeErrorDetail } from './utils.js';

const TRAILING_CONJUNCTIONS = /\b(and|but|or|so|because|then|that|which|with|while|when|if|after|before|by|to|of|in|on|for|as|at|from|into|onto|upon|using|via|plus|also|however|therefore|meanwhile|although|though|whereas)\s*$/i;
const TRAILING_OPENERS = /\b(such as|for example|for instance|in order to|so that|as well as|along with|together with|the following|in particular|including|especially|in addition|on the other hand|which means|meaning|using|inside|outside|across|through|towards?|during|among|between|under|above|below|around|within|without|unless|until|where|when|how|what|why|excluding|plus|about|beyond|despite|instead|regardless|to:|the:)\s*$/i;
const UNFINISHED_WORD = /[a-z0-9]$/i;

function stripFences(content) {
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

  if (!text.trim()) return { truncated: true, signals: ['empty-response'] };
  if (countFences(text) % 2 === 1) signals.push('open-code-fence');

  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
    const opens = (text.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closes = (text.match(new RegExp(`\\${close}`, 'g')) || []).length;
    if (opens > closes) signals.push(`unmatched-${open}${close}`);
  }

  const proseView = text
    .replace(/```[\s\S]*?(```|$)/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  const openTags = proseView.match(/<([a-z][a-z0-9-]*)([^>]*)>/gi) || [];
  const unclosedByName = new Map();
  for (const tag of openTags) {
    const inner = tag.slice(1, -1);
    if (/\/\s*$/.test(inner)) continue;
    const nameMatch = inner.match(/^([a-z][a-z0-9-]*)/i);
    if (!nameMatch) continue;
    const tagName = nameMatch[1].toLowerCase();
    if (['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'].includes(tagName)) continue;
    const tagStart = proseView.indexOf(tag);
    const before = tagStart > 0 ? proseView[tagStart - 1] : '';
    if (/[/:=('"`[]/.test(before)) continue;
    const rest = proseView.slice(tagStart + tag.length);
    if (!new RegExp(`</${tagName}\\s*>`, 'i').test(rest)) {
      unclosedByName.set(tagName, (unclosedByName.get(tagName) || 0) + 1);
    }
  }
  const distinct = unclosedByName.size;
  const maxRepeats = Math.max(0, ...unclosedByName.values());
  const structuralSignals = signals.some((s) => s.startsWith('open-code-fence') || s.startsWith('unmatched-'));
  if ((distinct >= 2 && (structuralSignals || maxRepeats >= 2)) || distinct >= 3 || maxRepeats >= 3) {
    for (const tagName of unclosedByName.keys()) signals.push(`unclosed-html-${tagName}`);
  }

  if (/[#|]+\s*$/.test(text)) signals.push('ends-with-structure-mark');
  if (/\n\s*\d+[.)]\s*$/.test(text)) signals.push('unfinished-list-item');

  const prose = stripFences(text).replace(/\s+$/, '');
  if (prose.length > 40 && UNFINISHED_WORD.test(prose)) {
    if (TRAILING_CONJUNCTIONS.test(prose)) signals.push('ends-with-conjunction');
    else if (/:\s*$/.test(prose)) signals.push('unfinished-list-intro');
    else if (TRAILING_OPENERS.test(prose)) signals.push('mid-sentence-cutoff');
  }

  if (stopReason === 'length') signals.push('provider-stop-reason-length');
  return { truncated: signals.length > 0, signals };
}

const NON_LATIN_RANGES = [
  /[\u0400-\u04FF]/g,
  /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g,
  /[\u0600-\u06FF\u0750-\u077F]/g,
  /[\u0900-\u097F\u0A00-\u0A7F\u0B00-\u0B7F]/g,
  /[\u0E00-\u0E7F\u0F00-\u0FFF]/g,
  /[\u0370-\u03FF\u1F00-\u1FFF]/g
];

export function languageMismatchRatio(content) {
  const text = stripFences(String(content || ''));
  if (!text.trim()) return 0;
  const totalLetters = (text.match(/[\p{L}]/gu) || []).length;
  if (totalLetters < 20) return 0;
  let nonLatin = 0;
  for (const range of NON_LATIN_RANGES) nonLatin += (text.match(range) || []).length;
  return nonLatin / totalLetters;
}

export function detectLanguageMismatch(content, userPrompt = '') {
  const ratio = languageMismatchRatio(content);
  if (ratio < 0.5) return { mismatch: false, ratio };
  const prompt = String(userPrompt || '').toLowerCase();
  const explicitForeignTask = /\b(translate|translation|in (french|spanish|german|japanese|chinese|korean|russian|arabic|tagalog|filipino))\b/i.test(prompt);
  return { mismatch: !explicitForeignTask, ratio };
}

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

export function checkBracketBalance(code) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let inString = null;
  let escaped = false;
  let prevSignificant = '';
  const startsRegex = (prev) => prev === '' || /[([=,:!&|?{;]/.test(prev);

  for (let i = 0; i < String(code || '').length; i += 1) {
    const char = code[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      if (char !== '`') {
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
      i += 1;
      let inClass = false;
      let closed = false;
      while (i < code.length) {
        const c = code[i];
        if (c === '\\') i += 1;
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
      if (stack.length === 0 || stack[stack.length - 1] !== pairs[char]) return false;
      stack.pop();
    }
    if (!/\s/.test(char)) prevSignificant = char;
  }
  return stack.length === 0;
}

export function syntaxCheckJS(code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return { ok: false, error: 'empty code block' };
  const isJsx = /\breturn\s*\(?\s*<[A-Za-z]/.test(trimmed) || /<\/[A-Za-z]/.test(trimmed);
  const isModule = /\b(import\s|export\s|from\s+['"])/.test(trimmed);
  if (isJsx || isModule) {
    return checkBracketBalance(trimmed)
      ? { ok: true, checked: 'brackets-only' }
      : { ok: false, error: 'unbalanced brackets (jsx/module code)' };
  }
  try {
    new Function(trimmed);
    return { ok: true, checked: 'parse' };
  } catch (err) {
    return { ok: false, error: safeErrorDetail(err) || 'syntax error' };
  }
}

export function validateHtmlDocument(content) {
  const text = String(content || '');
  const issues = [];
  const documentLike = /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(text);

  // Explanations often contain legitimate HTML fragments. Only require a full
  // <html> root when the block presents itself as a complete document.
  if (documentLike && (!/<html[\s>]/i.test(text) || !/<\/html>/i.test(text))) {
    issues.push('missing-html-root');
  }
  if (/<body[\s>]/i.test(text) && !/<\/body>/i.test(text)) issues.push('unclosed-body-tag');

  const scriptOpens = (text.match(/<script[\s>]/gi) || []).length;
  const scriptCloses = (text.match(/<\/script>/gi) || []).length;
  if (scriptOpens !== scriptCloses) issues.push('unbalanced-script-tags');
  const divOpens = (text.match(/<div[\s>]/gi) || []).length;
  const divCloses = (text.match(/<\/div>/gi) || []).length;
  if (divOpens > divCloses) issues.push('unclosed-div-tags');
  return { ok: issues.length === 0, issues };
}

const GAME_SIGNALS = [
  { id: 'game-loop', pattern: /requestAnimationFrame|setInterval\s*\(|setTimeout\s*\(\s*(?:gameLoop|loop|update)/i },
  { id: 'controls', pattern: /\b(keydown|keyup|keyCode|addEventListener\s*\(\s*['"]key|onKeyDown|touchstart|touchend|pointerdown)/i },
  { id: 'scoring', pattern: /\b(score|points)\b/i },
  { id: 'collision', pattern: /\b(collide|collision|intersect|isTouching|overlap|hitTest|wallCollision|selfCollision)\b/i },
  { id: 'canvas', pattern: /\b(getContext\s*\(\s*['"]2d|canvas)\b/i }
];

export function checkGameRequirements(code) {
  const combined = Array.isArray(code) ? code.join('\n') : String(code || '');
  return GAME_SIGNALS.filter((signal) => signal.pattern.test(combined)).map((signal) => signal.id);
}

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
    recentChanges: [],
    latestCode: code
  };

  if (/<canvas[\s>]/i.test(code) || /\bgetContext\s*\(\s*['"]2d/.test(code)) project.rendering = 'canvas';
  const jsx = /\b(import\s+.*\bReact\b|ReactDOM|export default function \w+\s*\(|useState|useEffect)/.test(code);
  if (jsx || blocks.some((b) => b.lang === 'jsx')) {
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
  else if (/<html[\s>]/i.test(code) || jsx) project.projectType = 'website';
  else project.projectType = 'app';

  for (const signal of GAME_SIGNALS) if (signal.pattern.test(code)) project.features.push(signal.id);
  if (/\b(restart|reset|gameOver\s*=\s*false)\b/i.test(code)) project.features.push('restart');
  if (/\b(game[- ]?over|gameOver)\b/i.test(code)) project.features.push('game-over');
  return { project, blocks, latestReply: latest };
}

export function isModificationRequest(prompt, project) {
  if (!project || project.framework === 'unknown') return false;
  const text = String(prompt || '');
  return /\b(now|also|instead|change|make|add|remove|update|fix|modify|edit|undo|revert|don'?t|keep|preserve|convert|replace|switch)\b/i.test(text);
}

function stableLines(code) {
  return String(code || '')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length >= 12 && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*'));
}

function lineRetentionRatio(previousCode, currentCode) {
  const previous = stableLines(previousCode);
  if (previous.length === 0) return 1;
  const current = new Set(stableLines(currentCode));
  const retained = previous.filter((line) => current.has(line)).length;
  return retained / previous.length;
}

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

  if (project.framework === 'react') {
    checks['preserved-framework'] = /\b(ReactDOM|useState|useEffect|export default function \w+\s*\()/.test(code)
      || blocks.some((b) => b.lang === 'jsx');
  } else if (project.framework === 'html') {
    checks['preserved-framework'] = /<html[\s>]/i.test(code);
  } else {
    checks['preserved-framework'] = blocks.length > 0;
  }

  const features = Array.isArray(project.features) ? project.features : [];
  if (features.length > 0) {
    const preserved = features.filter((feature) => {
      const pattern = GAME_SIGNALS.find((s) => s.id === feature)?.pattern;
      if (pattern) return pattern.test(code);
      if (feature === 'restart') return /\b(restart|reset)\b/i.test(code);
      if (feature === 'game-over') return /\b(game[- ]?over|gameOver)\b/i.test(code);
      return false;
    });
    checks['preserved-unrelated-features'] = preserved.length >= Math.max(1, Math.ceil(features.length * 0.75));
  } else {
    checks['preserved-unrelated-features'] = blocks.length > 0;
  }

  const prompt = String(userPrompt || '');
  if (/\b(speed|faster|slower|gradual)\b/i.test(prompt)) checks['implemented-requested-change'] = /\b(speed|interval|delay|velocity|rate)\b/i.test(code);
  else if (/\b(blue)\b/i.test(prompt)) checks['implemented-requested-change'] = /\bblue\b|#(?:00f|0000ff|0{0,2}[0-4][0-9a-f]{2,4})\b/i.test(code);
  else if (/\b(touch|mobile)\b/i.test(prompt)) checks['implemented-requested-change'] = /\b(touch|pointer|ontouch|touchstart|touchend)\b/i.test(code);
  else if (/\b(undo|revert|remove)\b/i.test(prompt)) checks['implemented-requested-change'] = blocks.length > 0;
  else checks['implemented-requested-change'] = blocks.length > 0;

  const previousCode = String(project.latestCode || '');
  const retentionRatio = previousCode && code ? lineRetentionRatio(previousCode, code) : null;
  if (retentionRatio === null) {
    checks['avoided-unnecessary-rewrite'] = checks['preserved-framework'];
  } else {
    // A small edit should retain most lines. A larger feature addition can
    // legitimately move more code, so 45% is the floor for "same project".
    checks['avoided-unnecessary-rewrite'] = retentionRatio >= 0.45;
  }
  checks['used-previous-implementation'] = checks['preserved-framework'] && checks['avoided-unnecessary-rewrite'];

  const passed = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passed / Object.keys(checks).length) * 50) / 10;
  return { score, checks, codeBlockCount: blocks.length, retainedLineRatio: retentionRatio };
}

function buildContinuationMessages(messages, originalContent, reason) {
  let reasonInstruction;
  if (reason.includes('missing-code')) {
    reasonInstruction = 'Return the COMPLETE updated code for the existing project in the SAME framework and structure. Reuse the previous implementation and change only what the user requested; do not redesign or rewrite unrelated sections.';
  } else if (reason.includes('syntax-failure')) {
    reasonInstruction = `The code in your previous answer has a syntax error (${reason}). Return the COMPLETE corrected answer with the fixed code — same content, same framework, only the syntax corrected.`;
  } else {
    reasonInstruction = 'Do NOT restart. Continue from the exact point where it stopped and finish it completely, preserving the language, code and structure already present.';
  }
  return [
    ...messages.filter((m) => m?.role === 'system'),
    ...messages.filter((m) => m?.role === 'user' || m?.role === 'assistant').slice(-4),
    { role: 'assistant', content: originalContent },
    { role: 'user', content: `[CONTINUATION] Your previous answer was incomplete (${reason}). ${reasonInstruction}` }
  ];
}

export function mergeResponse(original, repair, reason) {
  if (!repair || !String(repair).trim()) return original;
  const repairText = String(repair).trim();
  const originalText = String(original || '').replace(/\s+$/, '');
  const originalHead = originalText.slice(0, 120);
  if (repairText.slice(0, 120) === originalHead && repairText.length <= originalText.length + 200) return originalText;
  if (reason === 'wrong-language' || reason === 'language mismatch'
    || reason.startsWith('syntax-failure') || reason === 'missing-code-for-modification') return repairText;
  if (originalText.endsWith(repairText.slice(0, 30))) return originalText;
  if (countFences(originalText) % 2 === 1) {
    if (repairText.startsWith('```')) {
      const lastFenceStart = originalText.lastIndexOf('```');
      return `${originalText.slice(0, lastFenceStart).replace(/\s*$/, '')}\n${repairText}`;
    }
    return `${originalText}\n${repairText}`;
  }
  if (/[a-z0-9,;:]$/.test(originalText) && !/^\s*[.?!]/.test(repairText)) return `${originalText} ${repairText}`;
  return `${originalText}\n\n${repairText}`;
}

function mergeProjectState(target, answer, userPrompt) {
  if (!target || typeof target !== 'object') return;
  const next = analyzeProjectState([{ role: 'assistant', content: answer }]).project;
  if (next.framework && next.framework !== 'unknown') target.framework = next.framework;
  if (next.projectType) target.projectType = next.projectType;
  if (next.language) target.language = next.language;
  if (next.rendering) target.rendering = next.rendering;
  if (Array.isArray(next.features) && next.features.length > 0) target.features = [...new Set(next.features)];
  const priorChanges = Array.isArray(target.recentChanges) ? target.recentChanges : [];
  const change = String(userPrompt || '').trim();
  if (change) target.recentChanges = [...priorChanges, change.slice(0, 180)].slice(-10);
  target.latestCode = next.latestCode || target.latestCode;
}

export async function processResponse(messages, content, options = {}) {
  const userPrompt = options.userPrompt || '';
  const project = options.project || null;
  const stopReason = options.stopReason || null;
  const maxRepairs = Number.isFinite(options.maxRepairs) ? options.maxRepairs : 2;
  const generate = options.generate;

  const priorAnalysis = analyzeProjectState(messages);
  const priorCode = priorAnalysis.blocks.map((b) => b.code).join('\n');
  const effectiveProject = project && project.framework && project.framework !== 'unknown'
    ? { ...project, latestCode: project.latestCode || priorCode }
    : (priorAnalysis.project.framework !== 'unknown' ? priorAnalysis.project : null);
  const modificationRequest = options.isModification === true
    || (options.isModification !== false && isModificationRequest(userPrompt, effectiveProject));

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
    isModificationRequest: modificationRequest,
    stopReason
  };

  let answer = String(content || '');
  let finalStopReason = stopReason;
  let attempts = 0;

  const validateCode = (text) => {
    const issues = [];
    for (const block of extractCodeBlocks(text)) {
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
    const missingCode = modificationRequest && effectiveProject && effectiveProject.framework !== 'unknown'
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

  while (attempts < maxRepairs && validate(answer)) {
    if (typeof generate !== 'function') break;
    attempts += 1;
    const truncation = detectTruncation(answer, { stopReason: finalStopReason });
    let reason;
    if (diagnostics.missingCodeForModification) reason = 'missing-code-for-modification';
    else if (diagnostics.syntaxIssues?.length) reason = `syntax-failure (${diagnostics.syntaxIssues.slice(0, 2).join('; ')})`;
    else if (truncation.truncated) reason = `truncation (${truncation.signals.join(', ')})`;
    else reason = 'language mismatch';

    diagnostics.repairReasons.push(reason);
    diagnostics.repairAttempts = attempts;
    try {
      const repairResult = await generate(buildContinuationMessages(messages, answer, reason));
      if (!repairResult || typeof repairResult.content !== 'string' || !repairResult.content.trim()) break;
      answer = mergeResponse(answer, repairResult.content, reason);
      diagnostics.repaired = true;
      // A successful continuation supersedes the original stop reason. Keeping
      // a stale "length" here made repaired answers fail the strict evaluator.
      finalStopReason = typeof repairResult.stopReason === 'string' ? repairResult.stopReason : null;
    } catch (err) {
      console.warn('COREZ response repair failed:', safeErrorDetail(err));
      break;
    }
  }

  const finalTruncation = detectTruncation(answer, { stopReason: finalStopReason });
  diagnostics.truncationDetected = finalTruncation.truncated;
  diagnostics.truncationSignals = finalTruncation.signals;
  diagnostics.stopReason = finalStopReason;
  diagnostics.languageMismatch = detectLanguageMismatch(answer, userPrompt).mismatch;
  diagnostics.languageRatio = languageMismatchRatio(answer);

  const blocks = extractCodeBlocks(answer);
  diagnostics.validation = {
    codeBlockCount: blocks.length,
    syntax: blocks
      .filter((b) => ['js', 'javascript', 'jsx', 'html'].includes(b.lang))
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

  if (modificationRequest && effectiveProject && effectiveProject.framework !== 'unknown') {
    diagnostics.continuity = scoreContinuity({ project: effectiveProject, response: answer, userPrompt });
    if (project) mergeProjectState(project, answer, userPrompt);
  }

  return { content: answer, diagnostics };
}
