export function synthesizePlatformerGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Super Mario Platformer</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --gold: #eab308;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 560px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.5rem; color: #fff; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); margin-bottom: 0.75rem; font-size: 0.85rem; font-family: monospace; }
    .badge { color: var(--gold); font-weight: 700; }
    canvas { background: #5c94fc; border: 2px solid var(--border); border-radius: 6px; display: block; margin: 0 auto 0.75rem auto; width: 100%; aspect-ratio: 1.6; image-rendering: pixelated; }
    .controls-hint { font-size: 0.75rem; color: #a1a1aa; margin-bottom: 0.75rem; }
    .btn-bar { display: flex; gap: 0.5rem; justify-content: center; }
    .btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>SUPER MARIO WORLD</h1>
    <div class="status-bar">
      <span>SCORE: <span id="scoreText" class="badge">0</span></span>
      <span>COINS: <span id="coinText" class="badge">🪙 0</span></span>
      <span>LIVES: <span id="livesText" class="badge">❤️ 3</span></span>
    </div>
    <canvas id="c" width="512" height="320"></canvas>
    <div class="controls-hint">Controls: <b>A / D / Arrow Keys</b> to Move • <b>Space / W / Up Arrow</b> to Jump</div>
    <div class="btn-bar">
      <button class="btn" id="restartBtn">Play Again</button>
    </div>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let state = { score: 0, coins: 0, lives: 3, gameOver: false, won: false, cameraX: 0 };
    let keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    let player = { x: 40, y: 200, w: 18, h: 26, vx: 0, vy: 0, grounded: false, facing: 'right' };
    let platforms = [
      { x: 0, y: 280, w: 750, h: 40, type: 'ground' },
      { x: 820, y: 280, w: 800, h: 40, type: 'ground' },
      { x: 140, y: 200, w: 24, h: 24, type: 'block' },
      { x: 180, y: 200, w: 24, h: 24, type: 'question', hit: false },
      { x: 204, y: 200, w: 24, h: 24, type: 'block' },
      { x: 228, y: 200, w: 24, h: 24, type: 'question', hit: false },
      { x: 252, y: 200, w: 24, h: 24, type: 'block' },
      { x: 340, y: 232, w: 36, h: 48, type: 'pipe' },
      { x: 460, y: 212, w: 36, h: 68, type: 'pipe' },
      { x: 560, y: 160, w: 96, h: 20, type: 'block' },
      { x: 610, y: 100, w: 24, h: 24, type: 'question', hit: false },
      { x: 860, y: 200, w: 120, h: 20, type: 'block' },
      { x: 1100, y: 256, w: 24, h: 24, type: 'stair' },
      { x: 1124, y: 232, w: 24, h: 48, type: 'stair' },
      { x: 1148, y: 208, w: 24, h: 72, type: 'stair' },
      { x: 1172, y: 184, w: 24, h: 96, type: 'stair' }
    ];

    let coins = [
      { x: 184, y: 160, taken: false },
      { x: 232, y: 160, taken: false },
      { x: 580, y: 130, taken: false },
      { x: 600, y: 130, taken: false },
      { x: 620, y: 130, taken: false },
      { x: 880, y: 170, taken: false },
      { x: 910, y: 170, taken: false }
    ];

    let enemies = [
      { x: 280, y: 258, w: 20, h: 22, vx: -1, alive: true },
      { x: 500, y: 258, w: 20, h: 22, vx: -1.2, alive: true },
      { x: 900, y: 178, w: 20, h: 22, vx: -1, alive: true },
      { x: 1000, y: 258, w: 20, h: 22, vx: -1.5, alive: true }
    ];

    let flagpole = { x: 1240, y: 100, w: 8, h: 180 };

    function resetGame() {
      state = { score: 0, coins: 0, lives: 3, gameOver: false, won: false, cameraX: 0 };
      player = { x: 40, y: 200, w: 18, h: 26, vx: 0, vy: 0, grounded: false, facing: 'right' };
      platforms.forEach(p => p.hit = false);
      coins.forEach(c => c.taken = false);
      enemies.forEach((e, i) => { e.alive = true; e.x = 280 + i * 240; e.vx = -1; });
      updateUI();
    }

    function updateUI() {
      document.getElementById('scoreText').textContent = state.score;
      document.getElementById('coinText').textContent = '🪙 ' + state.coins;
      document.getElementById('livesText').textContent = '❤️ ' + state.lives;
    }

    function update() {
      if (state.gameOver || state.won) return;

      if (keys['ArrowLeft'] || keys['a'] || keys['A']) { player.vx = -3.2; player.facing = 'left'; }
      else if (keys['ArrowRight'] || keys['d'] || keys['D']) { player.vx = 3.2; player.facing = 'right'; }
      else { player.vx *= 0.7; }

      if ((keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' ']) && player.grounded) {
        player.vy = -10.5; player.grounded = false;
      }

      player.vy += 0.55; player.x += player.vx;
      platforms.forEach(p => {
        if (player.x < p.x + p.w && player.x + player.w > p.x && player.y < p.y + p.h && player.y + player.h > p.y) {
          if (player.vx > 0) player.x = p.x - player.w;
          else if (player.vx < 0) player.x = p.x + p.w;
        }
      });

      player.y += player.vy; player.grounded = false;
      platforms.forEach(p => {
        if (player.x < p.x + p.w && player.x + player.w > p.x && player.y < p.y + p.h && player.y + player.h > p.y) {
          if (player.vy > 0) { player.y = p.y - player.h; player.vy = 0; player.grounded = true; }
          else if (player.vy < 0) {
            player.y = p.y + p.h; player.vy = 0;
            if (p.type === 'question' && !p.hit) { p.hit = true; state.coins++; state.score += 100; updateUI(); }
          }
        }
      });

      if (player.y > 340) {
        state.lives--; updateUI();
        if (state.lives <= 0) { state.gameOver = true; }
        else { player.x = Math.max(40, state.cameraX + 20); player.y = 100; player.vy = 0; }
      }

      coins.forEach(c => {
        if (!c.taken && Math.hypot(player.x + 9 - c.x, player.y + 13 - c.y) < 18) {
          c.taken = true; state.coins++; state.score += 100; updateUI();
        }
      });

      enemies.forEach(e => {
        if (!e.alive) return;
        e.x += e.vx;
        if (e.x < 100 || e.x > 1150) e.vx *= -1;

        if (player.x < e.x + e.w && player.x + player.w > e.x && player.y < e.y + e.h && player.y + player.h > e.y) {
          if (player.vy > 0 && player.y + player.h - player.vy <= e.y + 8) {
            e.alive = false; player.vy = -7; state.score += 200; updateUI();
          } else {
            state.lives--; updateUI();
            if (state.lives <= 0) { state.gameOver = true; }
            else { player.x = Math.max(40, state.cameraX + 20); player.y = 100; player.vy = 0; }
          }
        }
      });

      if (player.x >= flagpole.x) { state.won = true; state.score += 1000; updateUI(); }
      state.cameraX = Math.max(0, player.x - 160);
    }

    function render() {
      ctx.clearRect(0, 0, 512, 320);
      ctx.save();
      ctx.translate(-state.cameraX, 0);

      ctx.fillStyle = '#5c94fc'; ctx.fillRect(state.cameraX, 0, 512, 320);
      ctx.fillStyle = '#ffffff';
      [100, 300, 600, 900, 1100].forEach(cx => {
        ctx.beginPath(); ctx.arc(cx, 60, 18, 0, Math.PI*2); ctx.arc(cx + 14, 55, 22, 0, Math.PI*2); ctx.arc(cx + 30, 60, 18, 0, Math.PI*2); ctx.fill();
      });

      ctx.fillStyle = '#00a800';
      [60, 420, 800].forEach(hx => { ctx.beginPath(); ctx.arc(hx, 280, 50, Math.PI, 0); ctx.fill(); });

      platforms.forEach(p => {
        if (p.type === 'ground') {
          ctx.fillStyle = '#c84c0c'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = '#00a800'; ctx.fillRect(p.x, p.y, p.w, 6);
        } else if (p.type === 'block' || p.type === 'stair') {
          ctx.fillStyle = '#c84c0c'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x, p.y, p.w, p.h);
        } else if (p.type === 'question') {
          ctx.fillStyle = p.hit ? '#8b5a2b' : '#fc9838'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x, p.y, p.w, p.h);
          if (!p.hit) { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.fillText('?', p.x + 7, p.y + 17); }
        } else if (p.type === 'pipe') {
          ctx.fillStyle = '#00a800'; ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = '#00d800'; ctx.fillRect(p.x - 2, p.y, p.w + 4, 10);
          ctx.strokeStyle = '#000'; ctx.strokeRect(p.x - 2, p.y, p.w + 4, 10); ctx.strokeRect(p.x, p.y + 10, p.w, p.h - 10);
        }
      });

      coins.forEach(c => {
        if (c.taken) return;
        ctx.fillStyle = '#fce000'; ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#c88000'; ctx.stroke();
      });

      ctx.fillStyle = '#ffffff'; ctx.fillRect(flagpole.x, flagpole.y, flagpole.w, flagpole.h);
      ctx.fillStyle = '#fc9838'; ctx.beginPath(); ctx.arc(flagpole.x + 4, flagpole.y - 6, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fc0000'; ctx.beginPath(); ctx.moveTo(flagpole.x, flagpole.y + 10); ctx.lineTo(flagpole.x - 24, flagpole.y + 20); ctx.lineTo(flagpole.x, flagpole.y + 30); ctx.fill();

      enemies.forEach(e => {
        if (!e.alive) return;
        ctx.fillStyle = '#a81000'; ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#fff'; ctx.fillRect(e.x + 3, e.y + 4, 4, 6); ctx.fillRect(e.x + 13, e.y + 4, 4, 6);
        ctx.fillStyle = '#000'; ctx.fillRect(e.x + 5, e.y + 6, 2, 4); ctx.fillRect(e.x + 13, e.y + 6, 2, 4);
      });

      // Mario player
      ctx.fillStyle = '#e52521'; ctx.fillRect(player.x, player.y, player.w, player.h);
      ctx.fillStyle = '#0020c2'; ctx.fillRect(player.x + 2, player.y + 14, player.w - 4, 12);
      ctx.fillStyle = '#fcc082'; ctx.fillRect(player.x + (player.facing === 'right' ? 6 : 2), player.y + 4, 10, 8);
      ctx.fillStyle = '#000000'; ctx.fillRect(player.x + (player.facing === 'right' ? 12 : 4), player.y + 6, 3, 3);
      ctx.fillRect(player.x + (player.facing === 'right' ? 8 : 2), player.y + 10, 8, 3);

      ctx.restore();

      if (state.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, 512, 320);
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.fillText('GAME OVER', 256, 140);
        ctx.fillStyle = '#ffffff'; ctx.font = '14px monospace'; ctx.fillText('Click "Play Again" to restart mission', 256, 180);
      } else if (state.won) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, 512, 320);
        ctx.fillStyle = '#10b981'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.fillText('COURSE CLEAR!', 256, 140);
        ctx.fillStyle = '#ffffff'; ctx.font = '14px monospace'; ctx.fillText('Final Score: ' + state.score + ' | Coins: ' + state.coins, 256, 180);
      }
    }

    function loop() { update(); render(); requestAnimationFrame(loop); }
    document.getElementById('restartBtn').onclick = resetGame;
    resetGame(); loop();
  </script>
</body>
</html>`;
}

