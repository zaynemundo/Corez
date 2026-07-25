export function synthesizeBotEnemyGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bot Enemy Simulator</title>
  <style>
    body { background: #111; color: #fff; font-family: monospace; text-align: center; margin-top: 50px; }
    #arena { width: 400px; height: 400px; background: #222; border: 2px solid #555; position: relative; margin: 0 auto; overflow: hidden; }
    .bot { width: 30px; height: 30px; background: red; position: absolute; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-weight: bold; }
    .player { width: 30px; height: 30px; background: blue; position: absolute; border-radius: 15px; }
  </style>
</head>
<body>
  <h2>Bot Enemy Arena</h2>
  <div id="arena">
    <div id="player" class="player" style="left: 185px; top: 185px;"></div>
  </div>
  <p>Use arrow keys to move. Avoid the red bot enemy!</p>
  <script>
    const player = document.getElementById('player');
    const arena = document.getElementById('arena');
    let px = 185, py = 185;

    const bot = document.createElement('div');
    bot.className = 'bot';
    bot.innerText = 'X';
    bot.style.left = '10px';
    bot.style.top = '10px';
    arena.appendChild(bot);

    let bx = 10, by = 10;
    let bSpeed = 1.5;

    document.addEventListener('keydown', (e) => {
      const speed = 10;
      if (e.key === 'ArrowUp') py = Math.max(0, py - speed);
      if (e.key === 'ArrowDown') py = Math.min(370, py + speed);
      if (e.key === 'ArrowLeft') px = Math.max(0, px - speed);
      if (e.key === 'ArrowRight') px = Math.min(370, px + speed);
      player.style.left = px + 'px';
      player.style.top = py + 'px';
    });

    function updateBot() {
      if (bx < px) bx += bSpeed;
      else if (bx > px) bx -= bSpeed;
      if (by < py) by += bSpeed;
      else if (by > py) by -= bSpeed;

      bot.style.left = bx + 'px';
      bot.style.top = by + 'px';

      if (Math.abs(bx - px) < 30 && Math.abs(by - py) < 30) {
        alert('You were caught by the bot enemy!');
        px = 185; py = 185; bx = 10; by = 10;
      }

      requestAnimationFrame(updateBot);
    }
    updateBot();
  </script>
</body>
</html>`;
}

