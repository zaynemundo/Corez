export function synthesizeRetroSpaceGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Retro Space Defender</title>
  <style>
    :root {
      --bg: #050508;
      --card: #0d0d12;
      --border: #1f1f2e;
      --text: #00ffcc;
      --accent: #ff0055;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Courier New', monospace; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 2px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 0 15px rgba(0,255,204,0.08); }
    h1 { font-size: 1.3rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem; text-shadow: 0 0 10px var(--text); }
    .status-bar { font-size: 0.85rem; color: #a1a1aa; margin-bottom: 0.75rem; display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; background: rgba(0,255,204,0.05); border-radius: 4px; border: 1px solid var(--border); }
    canvas { background: #000005; border: 1px solid var(--border); border-radius: 4px; display: block; margin: 0 auto 0.75rem auto; width: 100%; aspect-ratio: 1.33; cursor: crosshair; }
    .btn { background: var(--text); color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; font-weight: 700; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: 0.2s; }
    .btn:hover { background: #fff; box-shadow: 0 0 15px var(--text); }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>RETRO SPACE DEFENDER</h1>
    <div class="status-bar">
      <span id="scoreText">SCORE: 0</span>
      <span id="livesText">LIVES: 3</span>
    </div>
    <canvas id="c" width="400" height="300"></canvas>
    <button class="btn" id="startBtn">Launch Mission</button>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let pX = 180, score = 0, lives = 3, bullets = [], enemies = [], stars = [], particles = [], loop = null, active = false;

    for (let i = 0; i < 50; i++) {
      stars.push({ x: Math.random()*400, y: Math.random()*300, s: Math.random()*1.5 + 0.5 });
    }

    canvas.onmousemove = e => {
      const r = canvas.getBoundingClientRect();
      pX = Math.max(10, Math.min(370, e.clientX - r.left - 15));
    };

    canvas.onclick = () => {
      if (active) bullets.push({ x: pX + 13, y: 270 });
    };

    function start() {
      pX = 180; score = 0; lives = 3; bullets = []; enemies = []; particles = []; active = true;
      document.getElementById('scoreText').textContent = 'SCORE: ' + score;
      document.getElementById('livesText').textContent = 'LIVES: ' + lives;
      if (loop) clearInterval(loop);
      loop = setInterval(update, 1000/60);
    }

    function update() {
      ctx.fillStyle = '#000005'; ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#ffffff';
      stars.forEach(st => {
        st.y += st.s * 0.5;
        if (st.y > 300) st.y = 0;
        ctx.fillRect(st.x, st.y, st.s, st.s);
      });

      if (!active) return;

      score++;
      if (score % 40 === 0) {
        enemies.push({ x: Math.random()*360, y: -20, s: 1.5 + Math.random()*2, w: 24, h: 20 });
      }

      ctx.fillStyle = '#00ffcc';
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i]; b.y -= 7;
        ctx.fillRect(b.x, b.y, 4, 10);
        if (b.y < -10) bullets.splice(i, 1);
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i]; e.y += e.s;
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(e.x + 6, e.y + 6, 12, 8);

        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
            for (let k = 0; k < 8; k++) {
              particles.push({ x: e.x + 12, y: e.y + 10, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4, life: 15 });
            }
            score += 100;
            enemies.splice(i, 1);
            bullets.splice(j, 1);
            break;
          }
        }

        if (e && pX < e.x + e.w && pX + 30 > e.x && 270 < e.y + e.h && 290 > e.y) {
          lives--;
          enemies.splice(i, 1);
          document.getElementById('livesText').textContent = 'LIVES: ' + lives;
          if (lives <= 0) {
            active = false;
            clearInterval(loop);
            alert('GAME OVER! Final Score: ' + score);
            return;
          }
        }

        if (e && e.y > 300) enemies.splice(i, 1);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        ctx.fillStyle = '#ff9900';
        ctx.fillRect(p.x, p.y, 3, 3);
        if (p.life <= 0) particles.splice(i, 1);
      }

      ctx.fillStyle = '#00ffcc';
      ctx.beginPath();
      ctx.moveTo(pX + 15, 265);
      ctx.lineTo(pX, 290);
      ctx.lineTo(pX + 30, 290);
      ctx.closePath();
      ctx.fill();

      document.getElementById('scoreText').textContent = 'SCORE: ' + score;
    }

    document.getElementById('startBtn').onclick = start;
    start();
  </script>
</body>
</html>`;
}

