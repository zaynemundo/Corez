// Corez AI Service Engine - Universal Public Conversational Engine

export const MODEL = {
  id: 'corez',
  name: 'Corez AI',
  description: 'Minimalist AI assistant for concise conversation, reasoning, and live app creation.'
};

export const AI_PROXY_ENDPOINT = '/api/ai';
export const IMAGE_PROXY_ENDPOINT = '/api/image';

export const PUBLIC_USER_INTENT_PROMPT = `
Corez serves public users who may describe goals casually, incompletely, or
without technical vocabulary. Understand public user intent and infer the goal behind the words, not by matching only exact keywords. Identify whether
the user wants to create a public-facing website, landing page, dashboard,
portal, app, game, widget, calculator, timer, prototype, tool, code help,
writing help, an explanation, or general guidance. Respond with the likely
goal, useful next action, and a concise path forward.
`;

import { classifyIntent } from './intentClassifier.js';

const INTENT_PATTERNS = {
  app: /\b(build|make|create|generate|design|launch|prototype|develop|ship)\b.*\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|preview|html|bot|enemy)\b|\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|bot|enemy)\b.*\b(build|make|create|generate|design|launch|prototype|develop|ship)\b|\b(game|play|chess|snake|pong|shooter|quiz|puzzle|simulator|canvas|bot|enemy)\b/i,
  code: /\b(code|debug|bug|fix|error|javascript|typescript|python|react|css|html|component|function|api|compile|stack trace)\b/i,
  writing: /\b(write|rewrite|copy|caption|email|post|bio|headline|script|summarize|summary|proposal|description|landing copy)\b/i,
  explanation: /\b(explain|what is|what are|how does|why does|teach me|break down|understand|compare)\b/i
};

function analyzeIntentWithRules(cleanPrompt) {
  const lower = cleanPrompt.toLowerCase();

  if (INTENT_PATTERNS.app.test(cleanPrompt)) {
    return {
      type: 'app',
      summary: 'Create a public-facing interactive experience or web tool.',
      responseStrategy: 'Build a runnable monochrome HTML preview when enough intent is present.'
    };
  }

  if (INTENT_PATTERNS.code.test(cleanPrompt)) {
    return {
      type: 'code-help',
      summary: 'Help the user understand, debug, or improve code.',
      responseStrategy: 'Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.'
    };
  }

  if (INTENT_PATTERNS.writing.test(cleanPrompt)) {
    return {
      type: 'writing',
      summary: 'Help the user shape public-facing words or content.',
      responseStrategy: 'Offer a concise draft or rewrite with a clear tone.'
    };
  }

  if (INTENT_PATTERNS.explanation.test(lower)) {
    return {
      type: 'explanation',
      summary: 'Explain the topic in plain language.',
      responseStrategy: 'Give a direct answer with the minimum useful context.'
    };
  }

  return {
    type: 'general',
    summary: 'Understand the public user goal and give a useful next step.',
    responseStrategy: 'Clarify the likely intent, answer directly, and invite the next concrete detail.'
  };
}

export function analyzePublicUserIntent(prompt) {
  const cleanPrompt = prompt ? prompt.trim() : '';

  if (!cleanPrompt) {
    return {
      type: 'general',
      summary: 'Understand the public user goal and give a useful next step.',
      responseStrategy: 'Clarify the likely intent, answer directly, and invite the next concrete detail.',
      confidence: 0,
      source: 'default'
    };
  }

  let modelResult;
  try {
    modelResult = classifyIntent(cleanPrompt);
  } catch {
    modelResult = { accepted: false, confidence: 0 };
  }

  if (modelResult && modelResult.accepted) {
    switch (modelResult.label) {
      case 'app':
        return {
          type: 'app',
          summary: 'Create a public-facing interactive experience or web tool.',
          responseStrategy: 'Build a runnable monochrome HTML preview when enough intent is present.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'code-help':
        return {
          type: 'code-help',
          summary: 'Help the user understand, debug, or improve code.',
          responseStrategy: 'Ask for the relevant snippet when the code is missing; otherwise explain the fix clearly.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'writing':
        return {
          type: 'writing',
          summary: 'Help the user shape public-facing words or content.',
          responseStrategy: 'Offer a concise draft or rewrite with a clear tone.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'explanation':
        return {
          type: 'explanation',
          summary: 'Explain the topic in plain language.',
          responseStrategy: 'Give a direct answer with the minimum useful context.',
          confidence: modelResult.confidence,
          source: 'model'
        };
      case 'general':
      default:
        return {
          type: 'general',
          summary: 'Understand the public user goal and give a useful next step.',
          responseStrategy: 'Clarify the likely intent, answer directly, and invite the next concrete detail.',
          confidence: modelResult.confidence,
          source: 'model'
        };
    }
  }

  const ruleResult = analyzeIntentWithRules(cleanPrompt);
  return {
    ...ruleResult,
    confidence: modelResult?.confidence ?? 0,
    source: 'rules'
  };
}

export function createFallbackSvgDataUrl(prompt) {
  const cleanPrompt = (prompt || 'Visual Creation').slice(0, 42);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#09090b" />
        <stop offset="50%" stop-color="#18181b" />
        <stop offset="100%" stop-color="#27272a" />
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="100%" stop-color="#a1a1aa" />
      </linearGradient>
    </defs>
    <rect width="800" height="800" fill="url(#bg)" />
    <circle cx="400" cy="360" r="220" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
    <circle cx="400" cy="360" r="160" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="8 8" />
    <polygon points="400,200 520,440 280,440" fill="none" stroke="url(#accent)" stroke-width="2" />
    <text x="400" y="620" font-family="-apple-system, sans-serif" font-size="22" font-weight="300" fill="#ffffff" text-anchor="middle" letter-spacing="2">${cleanPrompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
    <text x="400" y="660" font-family="-apple-system, sans-serif" font-size="13" font-weight="300" fill="#71717a" text-anchor="middle" letter-spacing="4">CREATIVE VISUAL</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function generateFluxImage(prompt) {
  try {
    const response = await fetch(IMAGE_PROXY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt })
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.image) return data.image;
    }
  } catch (err) {
    console.warn('Hosted FLUX API request failed; rendering fallback visual.', err);
  }

  return createFallbackSvgDataUrl(prompt);
}

export async function generateHostedAIResponse(
  prompt,
  intent = analyzePublicUserIntent(prompt),
  history = []
) {
  const response = await fetch(AI_PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, intent, messages: history })
  });

  if (!response.ok) {
    throw new Error(`Hosted AI request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data?.content?.trim() || null;
}

// Extract executable code block (HTML/CSS/JS) from AI message if present
export function extractCodeFromMessage(text) {
  if (!text) return null;

  const htmlMatch = text.match(/```(?:html|xml|jsx|tsx)?\s*([\s\S]*?)```/i);
  if (htmlMatch && htmlMatch[1].trim()) {
    const code = htmlMatch[1].trim();
    if (code.includes('<html') || code.includes('<div') || code.includes('<script') || code.includes('<style')) {
      return code;
    }
  }

  const matchAny = text.match(/```\s*([\s\S]*?)```/);
  if (matchAny && matchAny[1].includes('<')) {
    return matchAny[1].trim();
  }

  return null;
}

function synthesizeChessGame(withBot = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Chess</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --sq-light: #27272a;
      --sq-dark: #18181b;
      --sq-select: #3f3f46;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 460px; text-align: center; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
    h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.75rem; color: #fff; }
    .status-bar { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); }
    .board { display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr); aspect-ratio: 1; border: 2px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 1rem; }
    .square { display: flex; align-items: center; justify-content: center; font-size: 2.2rem; cursor: pointer; user-select: none; transition: background 0.15s ease; position: relative; }
    .square.light { background-color: var(--sq-light); }
    .square.dark { background-color: var(--sq-dark); }
    .square.selected { background-color: var(--sq-select) !important; outline: 2px solid #fff; outline-offset: -2px; }
    .square.valid-move::after { content: ''; width: 12px; height: 12px; background: rgba(255,255,255,0.5); border-radius: 50%; position: absolute; }
    .controls { display: flex; gap: 0.5rem; justify-content: center; }
    .btn { background: #ffffff; color: #000000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    .btn-sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .btn-sec:hover { background: rgba(255,255,255,0.05); }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>COREZ CHESS</h1>
    <div class="status-bar">
      <span id="status">White's Turn</span>
      <span id="mode">${withBot ? '1-Player vs Bot' : 'Interactive 2-Player'}</span>
    </div>
    <div class="board" id="board"></div>
    <div class="controls">
      <button class="btn" id="resetBtn">New Game</button>
      <button class="btn btn-sec" id="flipBtn">Flip Board</button>
    </div>
  </div>
  <script>
    const WITH_BOT = ${withBot};
    const INITIAL_BOARD = [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R']
    ];
    const SYMBOLS = {
      'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
    };
    let board = [], turn = 'W', selected = null, flipped = false;

    function init() {
      board = INITIAL_BOARD.map(r => [...r]);
      turn = 'W'; selected = null; render();
    }
    function isW(p) { return p && p === p.toUpperCase(); }
    function isB(p) { return p && p === p.toLowerCase(); }

    function getMoves(r, c) {
      const p = board[r][c];
      if (!p || (turn === 'W' && !isW(p)) || (turn === 'B' && !isB(p))) return [];
      const moves = [], white = isW(p), type = p.toLowerCase();
      const check = (nr, nc) => {
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const t = board[nr][nc];
          if (!t) { moves.push([nr, nc]); return true; }
          if (white ? isB(t) : isW(t)) moves.push([nr, nc]);
        }
        return false;
      };
      if (type === 'p') {
        const dir = white ? -1 : 1, startRow = white ? 6 : 1;
        if (r + dir >= 0 && r + dir < 8 && !board[r + dir][c]) {
          moves.push([r + dir, c]);
          if (r === startRow && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
        }
        [-1, 1].forEach(dc => {
          const nr = r + dir, nc = c + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const t = board[nr][nc];
            if (t && (white ? isB(t) : isW(t))) moves.push([nr, nc]);
          }
        });
      } else if (type === 'n') {
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => check(r + dr, c + dc));
      } else if (type === 'k') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => check(r + dr, c + dc));
      } else {
        const dirs = type === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]] :
                     type === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
                     [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        dirs.forEach(([dr, dc]) => {
          let nr = r + dr, nc = c + dc;
          while (check(nr, nc)) { nr += dr; nc += dc; }
        });
      }
      return moves;
    }

    function onClick(r, c) {
      if (WITH_BOT && turn === 'B') return;
      if (selected) {
        const [sr, sc] = selected;
        const valid = getMoves(sr, sc);
        if (valid.some(([vr, vc]) => vr === r && vc === c)) {
          board[r][c] = board[sr][sc];
          board[sr][sc] = '';
          turn = turn === 'W' ? 'B' : 'W';
          selected = null;
          render();
          if (WITH_BOT && turn === 'B') {
            setTimeout(botMove, 500);
          }
          return;
        }
      }
      const p = board[r][c];
      if (p && ((turn === 'W' && isW(p)) || (turn === 'B' && isB(p)))) {
        selected = [r, c];
      } else {
        selected = null;
      }
      render();
    }
    
    function botMove() {
      const allMoves = [];
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const p = board[i][j];
          if (p && isB(p)) {
            const moves = getMoves(i, j);
            moves.forEach(([vr, vc]) => allMoves.push({ from: [i, j], to: [vr, vc] }));
          }
        }
      }
      if (allMoves.length > 0) {
        const m = allMoves[Math.floor(Math.random() * allMoves.length)];
        board[m.to[0]][m.to[1]] = board[m.from[0]][m.from[1]];
        board[m.from[0]][m.from[1]] = '';
        turn = 'W';
        render();
      }
    }

    function render() {
      const el = document.getElementById('board');
      el.innerHTML = '';
      document.getElementById('status').textContent = turn === 'W' ? "White's Turn" : "Black's Turn";
      const valid = selected ? getMoves(selected[0], selected[1]) : [];
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const r = flipped ? 7 - i : i;
          const c = flipped ? 7 - j : j;
          const sq = document.createElement('div');
          sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
          if (selected && selected[0] === r && selected[1] === c) sq.classList.add('selected');
          if (valid.some(([vr, vc]) => vr === r && vc === c)) sq.classList.add('valid-move');
          const p = board[r][c];
          if (p) {
            sq.textContent = SYMBOLS[p] || p;
            sq.style.color = isW(p) ? '#ffffff' : '#a1a1aa';
          }
          sq.onclick = () => onClick(r, c);
          el.appendChild(sq);
        }
      }
    }

    document.getElementById('resetBtn').onclick = init;
    document.getElementById('flipBtn').onclick = () => { flipped = !flipped; render(); };
    init();
  </script>
</body>
</html>`;
}

function synthesizeRetroSpaceGame() {
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
    .game-card { background: var(--card); border: 2px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 0 30px rgba(0,255,204,0.15); }
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

function synthesizeBotEnemyGame() {
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

// DYNAMIC GAME & APP SYNTHESIZER ENGINE (Kimi 2.7 Code Driven)
function synthesizeCustomGame(prompt) {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('chess')) {
    const withBot = lower.includes('bot') || lower.includes('enemy');
    return {
      title: withBot ? 'COREZ Chess App (vs Bot)' : 'COREZ Chess App',
      html: synthesizeChessGame(withBot)
    };
  }

  if (lower.includes('space') || lower.includes('retro') || lower.includes('shooter') || lower.includes('arcade') || lower.includes('ship')) {
    return {
      title: 'COREZ Retro Space Game',
      html: synthesizeRetroSpaceGame()
    };
  }

  if (lower.includes('bot') || lower.includes('enemy')) {
    return {
      title: 'COREZ Bot Enemy Simulator',
      html: synthesizeBotEnemyGame()
    };
  }

  const gameTitle = clean.replace(/(create|build|make|generate|a|an|the|game|play|app|widget|prototype)/gi, '').trim() || 'Interactive App';
  const capitalizedTitle = gameTitle.charAt(0).toUpperCase() + gameTitle.slice(1);

  return {
    title: `COREZ ${capitalizedTitle} App`,
    html: synthesizeRetroSpaceGame()
  };
}

// Generate concise, natural AI responses for any public user
export async function generateLocalAIResponse(prompt) {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const intent = analyzePublicUserIntent(cleanPrompt);

  // Natural short latency (0.6s)
  await new Promise(r => setTimeout(r, 600));

  // 1. GREETINGS & SMALL TALK (Universal & Natural)
  if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup)(\s|!|\.|\?|$)/i.test(lower) || lower.includes('who are you') || lower.includes('what can you do')) {
    return `Hello! I'm COREZ AI. How can I help you today?`;
  }

  if (/^(how are you|how is it going|how's it going)(\s|!|\.|\?|$)/i.test(lower)) {
    return `Doing great! Ready to help whenever you are. What's on your mind?`;
  }

  // 2. GRATITUDE INTENT
  if (/^(thanks|thank you|awesome|great|cool|nice|perfect)(\s|!|\.|$)/i.test(lower)) {
    return `You're very welcome! Let me know if there's anything else I can help with.`;
  }

  // 3. PUBLIC APP / GAME / WIDGET CREATION INTENT
  if (intent.type === 'app') {
    const gameResult = synthesizeCustomGame(cleanPrompt);
    return `I've created **${gameResult.title}** for you! Click below to open it live in the preview canvas on the right side.\n\n\`\`\`html\n${gameResult.html}\n\`\`\``;
  }

  // 4. PUBLIC USER INTENT RESPONSES
  if (intent.type === 'code-help') {
    return `I understand the goal: ${intent.summary}\n\nShare the snippet, error message, or file you are working on. I’ll walk through what is happening, identify the likely cause, propose a fix, and explain how to verify it so you can move forward without guessing.`;
  }

  if (intent.type === 'writing') {
    return `I understand the goal: ${intent.summary}\n\nSend me the rough text, audience, and tone you want. I’ll turn it into clear public-facing copy, tighten the message, and give you a polished version plus a short explanation of why it works.`;
  }

  if (intent.type === 'explanation') {
    return `I understand the goal: ${intent.summary}\n\nHere’s the useful way to think about **"${cleanPrompt}"**:\n\nStart with the core idea, then connect it to what the user is trying to accomplish. From there, separate the topic into simple parts, explain why each part matters, and end with the next action someone should take. If you want, I can also turn this into a step-by-step guide or a shorter public-facing explanation.`;
  }

  return `I understand the goal: ${intent.summary}\n\nFor **"${cleanPrompt}"**, I’ll focus on what the public user is trying to accomplish and give a practical path forward.\n\nA good next step is to define the outcome, the audience, and the format you want. Once those are clear, I can help turn the idea into a plan, a written answer, code, or a live preview depending on what you need.`;
}

const IMAGE_PATTERNS = /\b(generate|create|draw|make|render|show|flux)\b.*\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic)\b|\b(image|picture|photo|logo|illustration|artwork|wallpaper|drawing|graphic)\b.*\b(generate|create|draw|make|render|flux)\b/i;

export async function generateAIResponse(prompt, history = []) {
  const cleanPrompt = prompt.trim();

  // If this is the first message and it obviously asks for an image, we can skip the LLM overhead.
  if (history.length <= 1 && (IMAGE_PATTERNS.test(cleanPrompt) || cleanPrompt.toLowerCase().startsWith('image:') || cleanPrompt.toLowerCase().startsWith('flux:'))) {
    try {
      const imageUrl = await generateFluxImage(cleanPrompt);
      if (imageUrl) {
        return `Here is your generated image:\n\n![${cleanPrompt}](${imageUrl})`;
      }
    } catch (imgError) {
      console.warn('FLUX image generation error; falling back to standard text response.', imgError);
    }
  }

  const intent = analyzePublicUserIntent(cleanPrompt);

  try {
    const hostedAiResponse = await generateHostedAIResponse(cleanPrompt, intent, history);
    if (hostedAiResponse) {
      // Check if the AI decided to generate an image
      const imageMatch = hostedAiResponse.match(/\[IMAGE_PROMPT:\s*(.*?)\]/i);
      if (imageMatch) {
        const imagePrompt = imageMatch[1].trim();
        try {
          const imageUrl = await generateFluxImage(imagePrompt);
          if (imageUrl) {
             // Replace the tag with the actual image markdown
             return hostedAiResponse.replace(imageMatch[0], `![${imagePrompt}](${imageUrl})`);
          }
        } catch (imgError) {
          console.warn('FLUX image generation error from AI tag.', imgError);
        }
      }
      return hostedAiResponse;
    }
  } catch (hostedAiError) {
    console.warn('Hosted AI unavailable; using local Corez fallback.', hostedAiError);
  }

  return generateLocalAIResponse(cleanPrompt);
}
