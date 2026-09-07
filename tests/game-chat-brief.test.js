import { describe, it, expect } from 'vitest';
import {
  ensureGameChatBrief,
  processResponse,
} from '../worker/responseProcessor.js';
import {
  ensureGameChatBrief as ensureClientBrief,
  hasGameChatBrief,
  evaluateResponse,
  repairResponse,
} from '../src/services/reflectionEngine.js';

const GAME_CODE = `<!DOCTYPE html>
<html><head><title>Neon Cube 3D</title></head><body>
<canvas id="c"></canvas>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
let score = 0;
window.addEventListener('keydown', (e) => {});
window.addEventListener('touchstart', () => {});
function loop() { score += 1; requestAnimationFrame(loop); }
loop();
</script></body></html>`;

const BARE_GAME = '```html\n' + GAME_CODE + '\n```';
const BRIEFED_GAME =
  "Here's **Neon Cube 3D** — collect to score and win. Move with the Arrow keys.\n\n" +
  BARE_GAME;

describe('game chat brief (worker)', () => {
  it('injects a short brief for a bare game code block', () => {
    const out = ensureGameChatBrief(BARE_GAME, 'build a 3d game');
    expect(out).not.toBe(BARE_GAME);
    expect(out.startsWith("Here's **Neon Cube 3D**")).toBe(true);
    expect(out).toContain(BARE_GAME);
    // Brief is 1-2 sentences before the fence
    const preamble = out.slice(0, out.indexOf('```'));
    expect(preamble.split('.').filter(Boolean).length).toBeLessThanOrEqual(3);
  });

  it('keeps an existing brief byte-identical', () => {
    expect(ensureGameChatBrief(BRIEFED_GAME, 'build a 3d game')).toBe(
      BRIEFED_GAME,
    );
  });

  it('leaves non-game answers untouched', () => {
    const site =
      'Here is your site:\n\n```html\n<!DOCTYPE html><html><body><h1>Hi</h1></body></html>\n```';
    expect(ensureGameChatBrief(site, 'build a website')).toBe(site);
  });

  it('processResponse guarantees a brief and flags injection', async () => {
    const { content, diagnostics } = await processResponse([], BARE_GAME, {
      userPrompt: 'build a 3d game',
      maxRepairs: 0,
    });
    expect(content.startsWith('Here\'s **')).toBe(true);
    expect(diagnostics.gameBriefInjected).toBe(true);
  });
});

describe('game chat brief (client reflection)', () => {
  it('detects an existing brief', () => {
    expect(hasGameChatBrief(BRIEFED_GAME)).toBe(true);
    expect(hasGameChatBrief(BARE_GAME)).toBe(false);
  });

  it('flags a missing brief for game_creation html', () => {
    const evalResult = evaluateResponse(
      BARE_GAME,
      {},
      { type: 'game_creation', outputFormat: 'html' },
    );
    expect(evalResult.isCompliant).toBe(false);
    expect(
      evalResult.violations.some((v) => v.includes('game brief')),
    ).toBe(true);
  });

  it('repairs a missing brief deterministically', () => {
    const evalResult = evaluateResponse(
      BARE_GAME,
      {},
      { type: 'game_creation', outputFormat: 'html' },
    );
    const repaired = repairResponse(BARE_GAME, evalResult, {}, 5, 0, {
      type: 'game_creation',
      outputFormat: 'html',
    });
    expect(repaired.finalContent.startsWith("Here's **")).toBe(true);
    expect(ensureClientBrief(BARE_GAME).startsWith("Here's **")).toBe(true);
  });
});
