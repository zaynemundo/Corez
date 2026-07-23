/**
 * Asset-Independent Game Engine Skeleton Generator
 * Constructs high-performance boilerplate for Canvas, Input, Audio, Collision, Entities, State, and Pixel Art CSS.
 */

export function generateEngineSkeleton(gameSpec = {}) {
  const title = gameSpec.title || 'COREZ Arcade Game';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0c0d14; color: #fff; font-family: 'Courier New', monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    #game-container { position: relative; width: 100%; max-width: 960px; aspect-ratio: 16/9; background: #161824; border: 2px solid #2a2d42; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); overflow: hidden; }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      image-rendering: -moz-crisp-edges;
    }
    .touch-controls { position: absolute; bottom: 12px; left: 0; right: 0; display: none; justify-content: space-between; padding: 0 16px; pointer-events: none; }
    .touch-btn { width: 56px; height: 56px; background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px; color: #fff; pointer-events: auto; touch-action: manipulation; }
    .touch-btn:active { background: rgba(255,255,255,0.4); transform: scale(0.95); }
  </style>
</head>
<body>
  <div id="game-container">
    <canvas id="gameCanvas" width="960" height="540"></canvas>
    <div id="touchControls" class="touch-controls">
      <div style="display: flex; gap: 8px;">
        <div class="touch-btn" id="btnLeft">◄</div>
        <div class="touch-btn" id="btnRight">►</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <div class="touch-btn" id="btnJump">▲</div>
        <div class="touch-btn" id="btnAction">★</div>
      </div>
    </div>
  </div>

  <script>
    // 1. PostMessage Bridge Integration
    function sendHostMessage(type, payload = {}) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, payload, timestamp: Date.now() }, '*');
      }
    }

    sendHostMessage('GAME_LOADING', { progress: 0 });

    // 2. Input Manager
    const Input = {
      keys: {},
      touch: { left: false, right: false, up: false, action: false },
      init() {
        window.addEventListener('keydown', e => { Input.keys[e.code] = true; });
        window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
        
        // Touch support
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
          const controlsEl = document.getElementById('touchControls');
          if (controlsEl) controlsEl.style.display = 'flex';
          
          const bindTouch = (id, keyName) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('touchstart', e => { e.preventDefault(); Input.touch[keyName] = true; });
            el.addEventListener('touchend', e => { e.preventDefault(); Input.touch[keyName] = false; });
          };
          bindTouch('btnLeft', 'left');
          bindTouch('btnRight', 'right');
          bindTouch('btnJump', 'up');
          bindTouch('btnAction', 'action');
        }
      },
      isDown(code, touchKey) {
        return !!(Input.keys[code] || (touchKey && Input.touch[touchKey]));
      }
    };

    // 3. Audio Synth Manager
    const Sound = {
      ctx: null,
      init() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.ctx = new AudioContext();
      },
      playTone(freq = 440, type = 'square', duration = 0.1) {
        if (!this.ctx) return;
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
      }
    };

    // 4. Collision Detection System (AABB)
    function checkCollision(rect1, rect2) {
      return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
      );
    }

    // 5. Game State Manager
    const GameState = {
      current: 'START', // 'START' | 'PLAYING' | 'GAMEOVER' | 'VICTORY'
      score: 0,
      lives: 3,
      set(newState) {
        this.current = newState;
        if (newState === 'GAMEOVER') sendHostMessage('GAME_COMPLETE', { score: this.score, result: 'lose' });
        if (newState === 'VICTORY') sendHostMessage('GAME_COMPLETE', { score: this.score, result: 'win' });
      },
      restart() {
        this.score = 0;
        this.lives = 3;
        this.set('PLAYING');
        sendHostMessage('GAME_RESTART');
      }
    };

    // Initialize core managers
    Input.init();
    window.addEventListener('click', () => Sound.init(), { once: true });
    window.addEventListener('keydown', () => Sound.init(), { once: true });
  </script>
</body>
</html>`;
}
