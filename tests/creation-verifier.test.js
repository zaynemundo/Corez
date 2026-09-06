import { describe, it, expect } from 'vitest';
import { verifyCreation, verifySpecCoverage, buildRepairPrompt } from '../worker/creationVerifier.js';

const GOOD_GAME = `<!DOCTYPE html>
<html lang="en">
<head><title>FPS</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<canvas id="c"></canvas>
<button id="startBtn">Play</button>
<script>
let state='menu',score=0,lives=3;
const keys={};
let AC=window.AudioContext||window.webkitAudioContext,ac=null;
function ensureAudio(){if(!ac&&AC){ac=new AC();}if(ac&&ac.state==='suspended'){ac.resume();}}
document.addEventListener('keydown',function(e){keys[e.code]=true;ensureAudio();});
document.addEventListener('keyup',function(e){keys[e.code]=false;});
canvas.addEventListener('mousemove', function(){});
document.getElementById('startBtn').addEventListener('click',function(){ensureAudio();state='playing';});
const bulletPool=[];
function spawnBullet(x,y){let b=bulletPool.pop()||{};b.x=x;b.y=y;b.vx=5;return b;}
const STEP=1/60;let acc=0,last=0;
function frame(t){const dt=Math.min((t-last)/1000,0.1);last=t;acc+=dt;while(acc>=STEP){update(STEP);acc-=STEP;}render();requestAnimationFrame(frame);}
function update(dt){ if(state!=='playing')return; if(keys['ArrowRight']){score++;} if(score>100){state='victory';} if(lives<=0){state='gameover';} }
function render(){}
window.addEventListener('resize',function(){});
requestAnimationFrame(frame);
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

  it('rejects a stray </script> with no opening tag (code rendered as page text)', () => {
    const content = `<!DOCTYPE html><html><head></head><body><div>hi</div>
// Reveal + skill bars
const io=new IntersectionObserver(entries=>{
entries.forEach(e=>{
if(e.isIntersecting){
e.target.classList.add('in');
}
});
});
</script>
</body></html>`;
    const result = verifyCreation(content, { intentType: 'website_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'stray-closing-tag')).toBe(true);
  });

  it('rejects an embedded early </script> inside a script block', () => {
    const content = `<!DOCTYPE html><html><head></head><body>
<script>
const s = 'foo';
const t = '</script>';
alert(t);
</script>
</body></html>`;
    const result = verifyCreation(content, { intentType: 'app' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'stray-closing-tag')).toBe(true);
  });

  it('rejects a <script> opening tag that swallowed the first lines of its block', () => {
    const content = `<!DOCTYPE html><html><head></head><body><div>ok</div>
<script
// first line of js
const x=1;
console.log(x);
</script>
</body></html>`;
    const result = verifyCreation(content, { intentType: 'app' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'malformed-script-tag')).toBe(true);
  });

  it('passes balanced adjacent script blocks', () => {
    const content = '<!DOCTYPE html><html><head><style>body{}</style></head><body><script>a()</script><script>b()</script></body></html>';
    const result = verifyCreation(content, { intentType: 'app' });
    expect(result.passed).toBe(true);
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
    expect(codes).toContain('missing-start');
    expect(codes).toContain('missing-terminal-state');
  });

  it('flags badly unbalanced braces', () => {
    const content = GOOD_GAME.replace(/function render\(\)\{\}/, 'function render() {' + '{'.repeat(15));
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.failures.some((f) => f.code === 'unbalanced-braces')).toBe(true);
  });

  it('rejects a game with a loop but no start control', () => {
    const content = GOOD_GAME.replace(/<button id="startBtn">Play<\/button>\n/, '');
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-start')).toBe(true);
  });

  it('rejects a game with no win or lose end state', () => {
    const content = GOOD_GAME.replace(/victory/g, 'playing').replace(/gameover/g, 'playing');
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-terminal-state')).toBe(true);
  });

  it('accepts a game-over-only end state (endless survival)', () => {
    const content = GOOD_GAME.replace(/victory/g, 'playing');
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.failures.some((f) => f.code === 'missing-terminal-state')).toBe(false);
  });

  it('rejects a game with no Web Audio', () => {
    const content = GOOD_GAME.replace(
      'let AC=window.AudioContext||window.webkitAudioContext,ac=null;',
      'let ac=null;',
    );
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-audio')).toBe(true);
  });

  it('rejects a game with no fixed timestep', () => {
    const content = GOOD_GAME
      .replace('const STEP=1/60;let acc=0,last=0;', '')
      .replace(
        'function frame(t){const dt=Math.min((t-last)/1000,0.1);last=t;acc+=dt;while(acc>=STEP){update(STEP);acc-=STEP;}render();requestAnimationFrame(frame);}',
        'function frame(t){update(0.016);render();requestAnimationFrame(frame);}',
      );
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-fixed-timestep')).toBe(true);
  });

  it('rejects a game that polls no held-key map', () => {
    const content = GOOD_GAME.replace(/keys\[/g, 'k[');
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-key-polling')).toBe(true);
  });

  it('rejects a spawning game with no object pool', () => {
    const content = GOOD_GAME.replace(/bulletPool/g, 'activeShots');
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-object-pool')).toBe(true);
  });

  it('does not require a pool when nothing spawns', () => {
    const content = GOOD_GAME.replace(/bulletPool/g, 'activeShots').replace(
      'function spawnBullet(x,y){let b=activeShots.pop()||{};b.x=x;b.y=y;b.vx=5;return b;}',
      '',
    );
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.failures.some((f) => f.code === 'missing-object-pool')).toBe(false);
  });

  it('rejects a game with no resize handling', () => {
    const content = GOOD_GAME.replace(
      "window.addEventListener('resize',function(){});",
      '',
    );
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-resize')).toBe(true);
  });

  it('rejects a game with no viewport meta', () => {
    const content = GOOD_GAME.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '',
    );
    const result = verifyCreation(content, { intentType: 'game_creation' });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'missing-viewport')).toBe(true);
  });

  it('keeps quality gates soft (repairable, never build-blocking)', async () => {
    const { HARD_FAILURE_CODES } = await import('../worker/harness.js');
    for (const code of [
      'missing-audio',
      'missing-fixed-timestep',
      'missing-key-polling',
      'missing-object-pool',
      'missing-resize',
      'missing-viewport',
    ]) {
      expect(HARD_FAILURE_CODES.has(code)).toBe(false);
    }
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
