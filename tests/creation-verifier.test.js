import { describe, it, expect } from 'vitest';
import { verifyCreation, verifySpecCoverage, buildRepairPrompt } from '../worker/creationVerifier.js';

const GOOD_GAME = `<!DOCTYPE html>
<html lang="en">
<head><title>FPS</title></head>
<body>
<canvas id="c"></canvas>
<script>
function gameLoop(){ update(); render(); }
function update(){}
function render(){}
document.addEventListener('keydown', function(){});
canvas.addEventListener('mousemove', function(){});
requestAnimationFrame(gameLoop);
</script>
</body>
</html>`;

const GOOD_SITE = `<!DOCTYPE html>
<html lang="en">
<head><title>Site</title></head>
<body>
<a href="about.html">About</a>
<script>console.log('hi');</script>
</body>
</html>`;

describe('verifyCreation', () => {
  it('passes a complete game artifact', () => {
    const result = verifyCreation(GOOD_GAME, { intentType: 'game_creation' });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('passes a complete website artifact', () => {
    const result = verifyCreation(GOOD_SITE, { intentType: 'website_creation' });
    expect(result.passed).toBe(true);
  });

  it('rejects empty output', () => {
    const result = verifyCreation('', { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'empty-output')).toBe(true);
  });

  it('rejects an incomplete document without </html>', () => {
    const result = verifyCreation('<html><body><canvas></canvas><script>gameLoop();</script>', { intentType: 'game_creation' });
    expect(result.failures.some((f) => f.code === 'incomplete-html')).toBe(true);
  });

  it('rejects a truncated <script> block', () => {
    const result = verifyCreation('<html><body></body></html>\n<script>function x() {', { intentType: 'app' });
    expect(result.failures.some((f) => f.code === 'truncated-block')).toBe(true);
  });

  it('rejects external http(s) scripts', () => {
    const result = verifyCreation(
      '<html><body><script src="https://evil.example/x.js"></script></body></html>',
      { intentType: 'app' }
    );
    expect(result.failures.some((f) => f.code === 'external-script')).toBe(true);
  });

  it('flags a game without a canvas, loop, or input', () => {
    const result = verifyCreation('<html><body></body></html>', { intentType: 'game_creation' });
    const codes = result.failures.map((f) => f.code);
    expect(codes).toContain('missing-canvas');
    expect(codes).toContain('missing-loop');
    expect(codes).toContain('missing-input');
  });

  it('flags badly unbalanced braces', () => {
    const content = GOOD_GAME.replace(/function update\(\)\{\}/, 'function update() {' + '{'.repeat(15));
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.failures.some((f) => f.code === 'unbalanced-braces')).toBe(true);
  });
});

describe('buildRepairPrompt', () => {
  it('lists every failure and repeats the original request', () => {
    const prompt = buildRepairPrompt('make a snake game', GOOD_GAME, [
      { code: 'missing-loop', detail: 'no loop' },
      { code: 'missing-input', detail: 'no input' }
    ], 2, 5);

    expect(prompt).toContain('attempt 2/5');
    expect(prompt).toContain('[missing-loop] no loop');
    expect(prompt).toContain('[missing-input] no input');
    expect(prompt).toContain('make a snake game');
  });
});

describe('verifySpecCoverage', () => {
  it('passes when the artifact covers the spec features', () => {
    const spec = 'A snake game with a score and an enemy.';
    const artifact = '<html><body><canvas></canvas><script>const snake = 0; const score = 0; const enemy = { x: 0 };</script></body></html>';
    const result = verifySpecCoverage(spec, artifact);
    expect(result.passed).toBe(true);
  });

  it('fails when most requested features are missing from the artifact', () => {
    const spec = 'A snake game with a score, three levels, and an enemy.';
    const artifact = '<html><body><canvas></canvas><script>const snake = 0;</script></body></html>';
    const result = verifySpecCoverage(spec, artifact);
    expect(result.passed).toBe(false);
    expect(result.missing.length).toBeGreaterThanOrEqual(3);
    expect(result.missing).toContain('score');
    expect(result.missing).toContain('enemy');
    expect(result.missing).toContain('levels');
  });

  it('never fails tiny or generic specs', () => {
    expect(verifySpecCoverage('A game.', '<html></html>').passed).toBe(true);
    expect(verifySpecCoverage('Build a game with a loop.', '<html></html>').passed).toBe(true);
  });

  it('tolerates a few paraphrased or missing features', () => {
    const spec = 'A game with a score counter, a health bar, a pause menu, and a final boss.';
    const artifact = '<html><body><canvas></canvas><script>const score=0; const boss={}; const menu = null; const final = true;</script></body></html>';
    const result = verifySpecCoverage(spec, artifact);
    expect(result.passed).toBe(true);
  });
});
