/**
 * Asset-Independent Game Engine Skeleton Generator
 * Constructs high-performance boilerplate for Canvas, Input, Audio, Collision, Entities, State, and responsive presentation.
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
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0c0d14; color: #fff; font-family: 'Courier New', monospace; touch-action: none; overscroll-behavior: none; }
    /* Fullscreen: the game fills the entire viewport — no box, no border,
       no max-width. Draw in 960x540 logical space via View.beginFrame(). */
    #game-container { position: fixed; inset: 0; width: 100%; height: 100%; background: #0c0d14; overflow: hidden; }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .touch-controls { position: absolute; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); left: 0; right: 0; display: none; justify-content: space-between; align-items: flex-end; padding: 0 18px; pointer-events: none; }
    .touch-btn { width: 62px; height: 62px; background: rgba(255,255,255,0.16); border: 2px solid rgba(255,255,255,0.45); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; color: #fff; pointer-events: auto; touch-action: manipulation; -webkit-user-select: none; }
    .touch-btn:active { background: rgba(255,255,255,0.45); transform: scale(0.92); }
    @media (max-width: 560px) {
      .touch-btn { width: 54px; height: 54px; font-size: 17px; }
    }
    @media (max-height: 480px) {
      .touch-controls { opacity: 0.85; }
      .touch-btn { width: 48px; height: 48px; font-size: 15px; }
    }
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
    // 1. Fullscreen Resolution System: the canvas always fills the viewport.
    // Keep game logic in the fixed 960x540 logical space below and call
    // View.beginFrame(ctx) at the start of every render frame so drawing is
    // scaled to fill the whole screen (centered, aspect preserved).
    // Mobile-aware: uses visualViewport so iOS Safari's collapsing URL bar
    // never leaves a gap, and listens for orientation changes too.
    const VIEW_W = 960;
    const VIEW_H = 540;
    const canvas = document.getElementById('gameCanvas');
    const View = {
      W: VIEW_W,
      H: VIEW_H,
      scale: 1,
      ox: 0,
      oy: 0,
      resize() {
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(vw * dpr));
        canvas.height = Math.max(1, Math.round(vh * dpr));
        this.scale = Math.min(canvas.width / this.W, canvas.height / this.H);
        this.ox = (canvas.width - this.W * this.scale) / 2;
        this.oy = (canvas.height - this.H * this.scale) / 2;
      },
      beginFrame(ctx) {
        ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
      }
    };
    const viewResizeListener = () => View.resize();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', viewResizeListener);
      window.visualViewport.addEventListener('scroll', viewResizeListener);
    }
    window.addEventListener('resize', viewResizeListener);
    window.addEventListener('orientationchange', viewResizeListener);
    View.resize();

    // 2. PostMessage Bridge Integration
    function sendHostMessage(type, payload = {}) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, payload, timestamp: Date.now() }, '*');
      }
    }

    sendHostMessage('GAME_LOADING', { progress: 0 });

    // 3. Input Manager
    const Input = {
      keys: {},
      mouse: { down: false, x: 0, y: 0 },
      touch: { left: false, right: false, up: false, action: false },
      init() {
        window.addEventListener('focus', () => {});
        window.addEventListener('keydown', e => { Input.keys[e.code] = true; });
        window.addEventListener('keyup', e => { Input.keys[e.code] = false; });
        
        window.addEventListener('mousedown', e => {
          window.focus();
          Input.mouse.down = true;
          Input.mouse.x = e.clientX;
          Input.mouse.y = e.clientY;
        });
        window.addEventListener('mouseup', e => {
          Input.mouse.down = false;
        });
        window.addEventListener('mousemove', e => {
          Input.mouse.x = e.clientX;
          Input.mouse.y = e.clientY;
        });

        // Touch support: show the on-screen controls on any touch-capable or
        // coarse-pointer (mobile) device, and bind them with robust
        // touchstart/touchend/touchcancel handling so a sliding finger or a
        // gesture interrupt never leaves a key stuck down.
        const isTouchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0)
          || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        if (isTouchDevice) {
          const controlsEl = document.getElementById('touchControls');
          if (controlsEl) controlsEl.style.display = 'flex';

          const bindTouch = (id, keyName) => {
            const el = document.getElementById(id);
            if (!el) return;
            const press = (e) => { e.preventDefault(); Input.touch[keyName] = true; };
            const release = (e) => { e.preventDefault(); Input.touch[keyName] = false; };
            el.addEventListener('touchstart', press, { passive: false });
            el.addEventListener('touchend', release, { passive: false });
            el.addEventListener('touchcancel', release, { passive: false });
            el.addEventListener('contextmenu', (e) => e.preventDefault());
          };
          bindTouch('btnLeft', 'left');
          bindTouch('btnRight', 'right');
          bindTouch('btnJump', 'up');
          bindTouch('btnAction', 'action');
        }
      },
      isDown(code, touchKey) {
        return !!(Input.keys[code] || (touchKey && Input.touch[touchKey]));
      },
      // Convenience: maps the most common controls so games on mobile only
      // need to check keys here (Space/ArrowUp fire from the on-screen pad too).
      fire() { return this.isDown('Space', 'action'); },
      jump() { return this.isDown('Space', 'up') || this.isDown('ArrowUp', 'up'); },
      left() { return this.isDown('ArrowLeft', 'left'); },
      right() { return this.isDown('ArrowRight', 'right'); }
    };

    // 4. Audio Synth Manager
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

    // 5. Collision Detection System (AABB)
    function checkCollision(rect1, rect2) {
      return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
      );
    }

    // 6. Game State Manager
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
