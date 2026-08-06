export const CAT_PAW_BUTTON_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cat Paw Button - Recreated Interactive Demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background-color: #090d16;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #f8fafc;
      overflow-x: hidden;
      padding: 20px;
    }
    .header-badge {
      margin-bottom: 2rem;
      text-align: center;
    }
    .header-badge h1 {
      font-size: 2.25rem;
      font-weight: 800;
      background: linear-gradient(135deg, #fb923c, #f59e0b, #ec4899);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    .header-badge p {
      font-size: 0.95rem;
      color: #94a3b8;
    }
    .stage-wrapper {
      position: relative;
      width: 100%;
      max-width: 520px;
      height: 340px;
      background: radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.9) 75%);
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 1.5rem;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      user-select: none;
    }
    .cat-paw-container {
      position: absolute;
      top: 50%;
      left: 50%;
      pointer-events: none;
      z-index: 20;
      opacity: 0;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
      transform-origin: bottom center;
    }
    .cat-paw-container.visible {
      opacity: 1;
    }
    .cat-paw-svg {
      width: 80px;
      height: 110px;
      filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.6));
    }
    .cta-button {
      position: relative;
      z-index: 10;
      width: 230px;
      height: 64px;
      border: none;
      border-radius: 9999px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #ffffff;
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 12px 28px -6px rgba(245, 158, 11, 0.45), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      overflow: hidden;
    }
    .cta-button:hover {
      transform: translateY(-2px) scale(1.03);
      box-shadow: 0 16px 32px -6px rgba(245, 158, 11, 0.6), 0 8px 12px -2px rgba(0, 0, 0, 0.4);
    }
    .cta-button:active {
      transform: translateY(1px) scale(0.97);
    }
    .particle {
      position: absolute;
      pointer-events: none;
      z-index: 30;
      font-size: 1.5rem;
      transition: all 1s ease-out;
    }
    .controls-panel {
      margin-top: 1.5rem;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .breed-btn {
      padding: 8px 14px;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(30, 41, 59, 0.6);
      color: #cbd5e1;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .breed-btn.active, .breed-btn:hover {
      background: rgba(245, 158, 11, 0.2);
      border-color: rgba(245, 158, 11, 0.5);
      color: #fbbf24;
    }
  </style>
</head>
<body>
  <div class="header-badge">
    <h1>🐾 Cat Paw Button</h1>
    <p>Move your cursor near the button to summon kitty!</p>
  </div>

  <div class="stage-wrapper" id="stage">
    <div class="cat-paw-container" id="catPaw">
      <svg class="cat-paw-svg" viewBox="0 0 100 140" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path id="furBody" d="M20 140 C20 65, 30 35, 50 25 C70 35, 80 65, 80 140 Z" fill="#f97316" />
        <g id="stripes" stroke="#c2410c" stroke-width="4" stroke-linecap="round" opacity="0.65">
          <path d="M35 52 Q50 62 65 52" />
          <path d="M30 78 Q50 88 70 78" />
          <path d="M26 104 Q50 114 74 104" />
        </g>
        <path id="palmPad" d="M36 68 C36 54, 64 54, 64 68 C64 80, 36 80, 36 68 Z" fill="#f472b6" />
        <circle class="toeBean" cx="28" cy="44" r="7" fill="#f472b6" />
        <circle class="toeBean" cx="42" cy="34" r="8" fill="#f472b6" />
        <circle class="toeBean" cx="58" cy="34" r="8" fill="#f472b6" />
        <circle class="toeBean" cx="72" cy="44" r="7" fill="#f472b6" />
      </svg>
    </div>

    <button class="cta-button" id="ctaBtn">
      <span id="btnText">Get Started</span>
      <span>🐾</span>
    </button>
  </div>

  <div class="controls-panel">
    <button class="breed-btn active" onclick="setTheme('orange')">Orange Tabby 🍊</button>
    <button class="breed-btn" onclick="setTheme('tuxedo')">Tuxedo 🖤</button>
    <button class="breed-btn" onclick="setTheme('pink')">Pastel Pink 🌸</button>
  </div>

  <script>
    const stage = document.getElementById('stage');
    const paw = document.getElementById('catPaw');
    const btn = document.getElementById('ctaBtn');

    function playSound() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } catch(e) {}
    }

    stage.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const btnCenterX = rect.left + rect.width / 2;
      const btnCenterY = rect.top + rect.height / 2;
      const relX = e.clientX - btnCenterX;
      const relY = e.clientY - btnCenterY;

      paw.classList.add('visible');
      const rotate = relX * 0.25;
      const targetX = relX * 0.45;
      const targetY = relY * 0.3 - 40;

      paw.style.transform = \`translate(calc(-50% + \${targetX}px), calc(-50% + \${targetY}px)) rotate(\${rotate}deg)\`;
    });

    stage.addEventListener('mouseleave', () => {
      paw.classList.remove('visible');
    });

    btn.addEventListener('click', (e) => {
      playSound();
      paw.style.transform += ' scale(1.2) translateY(20px)';
      document.getElementById('btnText').innerText = 'Paws-itively Done! 🐾';
      btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

      for (let i = 0; i < 6; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.innerText = '🐾';
        p.style.left = (e.clientX - stage.getBoundingClientRect().left) + 'px';
        p.style.top = (e.clientY - stage.getBoundingClientRect().top) + 'px';
        stage.appendChild(p);

        setTimeout(() => {
          p.style.transform = \`translate(\${(Math.random() - 0.5) * 100}px, \${(Math.random() - 0.5) * 100}px) scale(0)\`;
          p.style.opacity = '0';
        }, 10);

        setTimeout(() => p.remove(), 1000);
      }
    });

    function setTheme(breed) {
      document.querySelectorAll('.breed-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      const fur = document.getElementById('furBody');
      const pad = document.getElementById('palmPad');
      const beans = document.querySelectorAll('.toeBean');
      
      if (breed === 'tuxedo') {
        fur.setAttribute('fill', '#1e293b');
        pad.setAttribute('fill', '#fb7185');
        beans.forEach(b => b.setAttribute('fill', '#fb7185'));
      } else if (breed === 'pink') {
        fur.setAttribute('fill', '#f472b6');
        pad.setAttribute('fill', '#ffffff');
        beans.forEach(b => b.setAttribute('fill', '#ffffff'));
      } else {
        fur.setAttribute('fill', '#f97316');
        pad.setAttribute('fill', '#f472b6');
        beans.forEach(b => b.setAttribute('fill', '#f472b6'));
      }
    }
  </script>
</body>
</html>`;
