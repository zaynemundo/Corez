import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  testGameHtml,
  runFunctionalGameCheck,
} from '../src/services/gamePipeline/gameTester.js';

// A game whose start button is wired to a crash: static pattern checks
// (canvas/loop/input/start-button present) all pass, so only execution
// catches it — the exact hole the DUSTLINE-style builds fell through.
const CRASH_ON_START = `<!DOCTYPE html>
<html><head><title>Crash</title></head><body>
<canvas id="c" width="960" height="540"></canvas>
<button id="startBtn">Play</button>
<script>
let state='menu';
document.getElementById('startBtn').addEventListener('click',function(){ state='playing'; startLevel(); });
function startLevel(){ return missingFn.crash; }
function gameLoop(){ update(); render(); }
function update(){}
function render(){ const c=document.getElementById('c').getContext('2d'); c.fillRect(0,0,10,10); }
document.addEventListener('keydown', function(){});
requestAnimationFrame(gameLoop);
</script></body></html>`;

// A game with a loop that never draws: structurally complete, functionally dead.
const DEAD_LOOP = `<!DOCTYPE html>
<html><head><title>Dead</title></head><body>
<canvas id="c" width="960" height="540"></canvas>
<button id="startBtn">Play</button>
<script>
let state='menu',score=0;
document.getElementById('startBtn').addEventListener('click',function(){state='playing';});
function gameLoop(){ update(); render(); requestAnimationFrame(gameLoop); }
function update(){ if(state==='playing'){ score++; if(score>10)state='victory'; } }
function render(){}
document.addEventListener('keydown', function(){});
requestAnimationFrame(gameLoop);
</script></body></html>`;

const SYNTAX_BROKEN = `<!DOCTYPE html>
<html><head><title>Broken</title></head><body>
<canvas id="c"></canvas>
<script>
function gameLoop( { update(; render() }
</script></body></html>`;

describe('Functional game gate', () => {
  it('rejects inline JavaScript that cannot parse', async () => {
    const result = await testGameHtml(SYNTAX_BROKEN, { assets: [] });
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('syntax error'))).toBe(true);
  });

  it('catches a start button wired to a runtime crash', async () => {
    const result = await runFunctionalGameCheck(CRASH_ON_START);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('runtime'))).toBe(true);
  }, 20000);

  it('catches a loop that renders nothing', async () => {
    const result = await runFunctionalGameCheck(DEAD_LOOP);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('zero canvas draw calls'))).toBe(true);
  }, 20000);

  it('passes a real shipped game end-to-end (2D minimalist platformer)', async () => {
    const file = path.resolve(process.cwd(), 'public', 'games', 'platformer-2d-minimalist.html');
    const html = fs.readFileSync(file, 'utf8');
    const result = await testGameHtml(html, { assets: [] }, { functional: true });
    expect(result.errors).toEqual([]);
    expect(result.passed).toBe(true);
  }, 30000);

  it('keeps default (non-functional) mode backward compatible', async () => {
    const minimal = `<!DOCTYPE html><html><head><title>T</title></head><body>
<canvas id="gameCanvas" width="960" height="540"></canvas>
<script>
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let x = 0;
function gameLoop() { x++; requestAnimationFrame(gameLoop); }
window.addEventListener('keydown', e => {});
requestAnimationFrame(gameLoop);
</script></body></html>`;
    const result = await testGameHtml(minimal, { assets: [] }, { executeScripts: true });
    expect(result.passed).toBe(true);
  });
});
