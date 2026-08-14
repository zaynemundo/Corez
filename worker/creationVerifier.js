// Creation Harness Verifier — deterministic, pure-JS checks for artifacts
// produced by the build loop. Runs inside the Worker (no jsdom, no DOM):
// every check is static so a full HTML document can be validated without
// executing untrusted code.

const MAX_PAGES = 12;

const GAME_LOOP_PATTERNS = /\b(requestAnimationFrame|setInterval)\b/i;
const GAME_UPDATE_PATTERNS = /\b(gameLoop|update|render|loop)\b/i;
const INPUT_PATTERNS = /\b(addEventListener\s*\(\s*['"](keydown|keyup|mousedown|mouseup|mousemove|click|touchstart)['"])/i;
export const DEFAULT_APPROVED_CDNS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdn.tailwindcss.com',
  'esm.sh',
  'cdn.skypack.dev',
  'cdn.babylonjs.com',
  'threejs.org',
  'fonts.googleapis.com'
];

export function verifyCreation(html, options = {}) {
  const { intentType = 'app', allowedExternalScripts = DEFAULT_APPROVED_CDNS } = options;
  const content = String(html || '');
  const failures = [];

  if (!content.trim()) {
    return { passed: false, failures: [{ code: 'empty-output', detail: 'The artifact is empty.' }] };
  }

  if (!/<html[\s>]/i.test(content) || !/<\/html>/i.test(content)) {
    failures.push({ code: 'incomplete-html', detail: 'The artifact is missing a complete <html>...</html> document.' });
  }

  // Truncation guard: an odd number of <script> tags means the document was
  // cut off mid-block (the closing tag never arrived).
  const tags = content.match(/<\/?(script|style)\b/gi) || [];
  let scriptDepth = 0;
  for (const tag of tags) {
    if (/^<\//i.test(tag)) scriptDepth -= 1;
    else if (!/\/>/.test(tag)) scriptDepth += 1;
    if (scriptDepth < 0) scriptDepth = 0;
  }
  if (scriptDepth !== 0) {
    failures.push({ code: 'truncated-block', detail: 'The artifact has an unclosed <script> or <style> block — output was likely cut off.' });
  }

  const scriptTags = content.match(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi) || [];
  const allowedList = Array.isArray(allowedExternalScripts) && allowedExternalScripts.length > 0
    ? allowedExternalScripts
    : DEFAULT_APPROVED_CDNS;

  for (const tag of scriptTags) {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const src = srcMatch[1].trim();
    if (/^https?:\/\//i.test(src)) {
      const isAllowed = allowedList.some((domain) => src.toLowerCase().includes(domain.toLowerCase()));
      if (!isAllowed) {
        failures.push({
          code: 'external-script',
          detail: `The artifact loads an untrusted external script (${src}), which is blocked in the preview sandbox.`
        });
        break;
      }
    }
  }

  const braceOpen = (content.match(/\{/g) || []).length;
  const braceClose = (content.match(/\}/g) || []).length;
  if (Math.abs(braceOpen - braceClose) > 10) {
    failures.push({ code: 'unbalanced-braces', detail: `Braces are badly unbalanced (${braceOpen} open vs ${braceClose} close).` });
  }

  const isGame = /game_creation/.test(intentType) || /\bgame\b/i.test(intentType);
  if (isGame) {
    if (!/<canvas[\s>]/i.test(content)) {
      failures.push({ code: 'missing-canvas', detail: 'The game has no <canvas> element to render into.' });
    }
    if (!GAME_LOOP_PATTERNS.test(content) || !GAME_UPDATE_PATTERNS.test(content)) {
      failures.push({ code: 'missing-loop', detail: 'The game has no animation loop (requestAnimationFrame/setInterval + update/render).' });
    }
    if (!INPUT_PATTERNS.test(content)) {
      failures.push({ code: 'missing-input', detail: 'The game registers no keyboard/mouse/touch input listeners.' });
    }
  }

  const isWebsite = /website_creation|design_task/.test(intentType);
  if (isWebsite) {
    const links = content.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi) || [];
    const pages = new Set(['index.html']);
    const hrefs = [];
    for (const link of links) {
      const match = link.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!match) continue;
      const href = match[1].trim();
      if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('/')) continue;
      hrefs.push(href);
      pages.add(href);
    }
    if (pages.size > MAX_PAGES) {
      failures.push({ code: 'too-many-pages', detail: `The site references ${pages.size} pages; the limit is ${MAX_PAGES}.` });
    }
    if (hrefs.length > 0) {
      for (const href of hrefs) {
        if (!/<html[\s>]/i.test(content) && href.endsWith('.html')) {
          // A multi-page site missing its index is caught by the incomplete check.
          break;
        }
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

export function isTruncated(html) {
  return verifyCreation(html).failures.some((f) => f.code === 'truncated-block' || f.code === 'incomplete-html');
}

export function buildRepairPrompt(originalPrompt, currentArtifact, failures, attempt, maxAttempts) {
  const lines = [
    `Your previous build did not pass functional verification (attempt ${attempt}/${maxAttempts}).`,
    '',
    'Fix ALL of the following problems in your new output. Keep every working feature intact.',
    'Output the complete, finished artifact again as a single self-contained HTML document.',
    '',
    'Verification failures:'
  ];
  for (const failure of failures) {
    lines.push(`- [${failure.code}] ${failure.detail}`);
  }
  lines.push('', 'User request:', originalPrompt);
  return lines.join('\n');
}
