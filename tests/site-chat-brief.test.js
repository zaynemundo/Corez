import { describe, it, expect } from 'vitest';
import {
  ensureSiteChatBrief,
  processResponse,
} from '../worker/responseProcessor.js';
import {
  ensureSiteChatBrief as ensureClientBrief,
  hasSiteChatBrief,
  evaluateResponse,
  repairResponse,
} from '../src/services/reflectionEngine.js';

const SITE_CODE = `<!DOCTYPE html>
<html lang="en"><head><title>Sindikato Agency — Stream. Gift. Grow.</title></head><body>
<h2>An agency built for live creators</h2>
<h2>Full-stack support for hosts</h2>
<h2>Meet the faces of Sindikato</h2>
<p>Recruiting live streamers.</p>
</body></html>`;

const BARE_FENCED = '```html\n' + SITE_CODE + '\n```';
const BARE_RAW = SITE_CODE;
const BRIEFED =
  "Here's **Sindikato Agency** — a live-streamer agency site.\n\n" + BARE_FENCED;

const GAME_CODE = `<!DOCTYPE html>
<html><head><title>Neon Cube 3D</title></head><body>
<canvas id="c"></canvas>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
let score = 0;
window.addEventListener('keydown', (e) => {});
function loop() { score += 1; requestAnimationFrame(loop); }
loop();
</script></body></html>`;

describe('site chat brief (worker)', () => {
  it('injects a short description for a bare fenced site', () => {
    const out = ensureSiteChatBrief(BARE_FENCED, 'build a website');
    expect(out).not.toBe(BARE_FENCED);
    expect(out.startsWith("Here's **Sindikato Agency")).toBe(true);
    expect(out).toContain(BARE_FENCED);
    // Brief is 1-2 sentences before the fence and names real sections.
    const preamble = out.slice(0, out.indexOf('```'));
    const afterTitle = preamble.replace(/^Here's \*\*[^*]*\*\* — /, '');
    expect(afterTitle.split('.').filter((s) => s.trim()).length).toBeLessThanOrEqual(2);
    expect(out).toContain('An agency built for live creators');
  });

  it('injects a short description for raw unfenced HTML', () => {
    const out = ensureSiteChatBrief(BARE_RAW, 'build a website');
    expect(out).not.toBe(BARE_RAW);
    expect(out.startsWith("Here's **")).toBe(true);
    expect(out).toContain(BARE_RAW);
  });

  it('keeps an existing description byte-identical', () => {
    expect(ensureSiteChatBrief(BRIEFED, 'build a website')).toBe(BRIEFED);
  });

  it('leaves game content to the game brief', () => {
    const bareGame = '```html\n' + GAME_CODE + '\n```';
    expect(ensureSiteChatBrief(bareGame, 'build a 3d game')).toBe(bareGame);
    expect(ensureSiteChatBrief(GAME_CODE, 'build a 3d game')).toBe(GAME_CODE);
  });

  it('leaves fragments and plain prose untouched', () => {
    expect(ensureSiteChatBrief('<div>hello</div>', 'fix this')).toBe(
      '<div>hello</div>',
    );
    expect(ensureSiteChatBrief('Just an answer.', 'hi')).toBe(
      'Just an answer.',
    );
    expect(ensureSiteChatBrief('', 'build a website')).toBe('');
  });

  it('processResponse guarantees a description and flags injection', async () => {
    const { content, diagnostics } = await processResponse([], BARE_FENCED, {
      userPrompt: 'build a website for a live streamer agency',
      maxRepairs: 0,
    });
    expect(content.startsWith("Here's **")).toBe(true);
    expect(diagnostics.siteBriefInjected).toBe(true);
    expect(diagnostics.gameBriefInjected).toBe(false);
  });
});

describe('site chat brief (client reflection)', () => {
  it('detects an existing description', () => {
    expect(hasSiteChatBrief(BRIEFED)).toBe(true);
    expect(hasSiteChatBrief(BARE_FENCED)).toBe(false);
    expect(hasSiteChatBrief(BARE_RAW)).toBe(false);
  });

  it('flags a missing description for website_creation html', () => {
    const evalResult = evaluateResponse(
      BARE_FENCED,
      {},
      { type: 'website_creation', outputFormat: 'html' },
    );
    expect(evalResult.isCompliant).toBe(false);
    expect(
      evalResult.violations.some((v) => v.includes('site brief')),
    ).toBe(true);
  });

  it('stays compliant when the description exists', () => {
    const evalResult = evaluateResponse(
      BRIEFED,
      {},
      { type: 'website_creation', outputFormat: 'html' },
    );
    expect(evalResult.isCompliant).toBe(true);
  });

  it('repairs a missing description deterministically', () => {
    const evalResult = evaluateResponse(
      BARE_RAW,
      {},
      { type: 'website_creation', outputFormat: 'html' },
    );
    const repaired = repairResponse(BARE_RAW, evalResult, {}, 5, 0, {
      type: 'website_creation',
      outputFormat: 'html',
    });
    expect(repaired.finalContent.startsWith("Here's **")).toBe(true);
    expect(ensureClientBrief(BARE_RAW).startsWith("Here's **")).toBe(true);
  });

  it('defers game-intent output to the game brief (worker parity)', () => {
    expect(ensureClientBrief(BARE_FENCED, 'build a game')).toBe(BARE_FENCED);
    expect(ensureClientBrief(BARE_RAW, 'build a game')).toBe(BARE_RAW);
  });
});
