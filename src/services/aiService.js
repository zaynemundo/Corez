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
  app: /\b(build|make|create|generate|design|launch|prototype|develop|ship)\b.*\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|preview|html)\b|\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator)\b.*\b(build|make|create|generate|design|launch|prototype|develop|ship)\b|\b(game|play|chess|snake|pong|shooter|quiz|puzzle|simulator|canvas)\b/i,
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
  intent = analyzePublicUserIntent(prompt)
) {
  const response = await fetch(AI_PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, intent })
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

// DYNAMIC GAME & APP SYNTHESIZER ENGINE
function synthesizeCustomGame(prompt) {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  // CHESS
  if (lower.includes('chess')) {
    return {
      title: 'COREZ Chess Game',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>COREZ Chess Game</title>
  <style>
    :root { --bg: #09090b; --card: #121215; --border: #27272a; --text: #f4f4f5; --sq-light: #e4e4e7; --sq-dark: #3f3f46; --sq-sel: #71717a; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1.25rem 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .game-container { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.5rem; }
    .status-bar { font-size: 0.85rem; font-weight: 500; color: #a1a1aa; margin-bottom: 1rem; display: flex; justify-content: space-between; padding: 0.45rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 4px; border: 1px solid var(--border); }
    .chessboard { display: grid; grid-template-columns: repeat(8, 1fr); width: 100%; aspect-ratio: 1; border: 2px solid var(--border); border-radius: 4px; overflow: hidden; margin-bottom: 1rem; }
    .square { display: flex; align-items: center; justify-content: center; font-size: 2.2rem; cursor: pointer; user-select: none; transition: background 0.15s ease; position: relative; }
    .square.light { background: var(--sq-light); color: #000; }
    .square.dark { background: var(--sq-dark); color: #fff; }
    .square.selected { background: var(--sq-sel) !important; outline: 2px solid #fff; z-index: 2; }
    .square.possible::after { content: ''; width: 14px; height: 14px; background: rgba(0,0,0,0.35); border-radius: 50%; position: absolute; }
    .square.dark.possible::after { background: rgba(255,255,255,0.45); }
    .square.possible.has-piece::after { width: 100%; height: 100%; border-radius: 0; background: rgba(239,68,68,0.35); }
    .btn { background: #fff; color: #000; border: none; padding: 0.55rem 1.1rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; }
    .btn:hover { background: #ccc; }
  </style>
</head>
<body>
  <div class="game-container">
    <h1>COREZ CHESS</h1>
    <div class="status-bar">
      <span id="turnIndicator">Turn: White ♔</span>
      <span id="moveCount">Moves: 0</span>
    </div>
    <div class="chessboard" id="board"></div>
    <button class="btn" id="resetBtn">Restart Game</button>
  </div>
  <script>
    const PIECES = { r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙' };
    const initialBoard = [
      ['r','n','b','q','k','b','n','r'],['p','p','p','p','p','p','p','p'],['','','','','','','',''],['','','','','','','',''],
      ['','','','','','','',''],['','','','','','','',''],['P','P','P','P','P','P','P','P'],['R','N','B','Q','K','B','N','R']
    ];
    let boardState = [], currentTurn = 'white', selectedSquare = null, validMoves = [], moveCount = 0;
    function isWhite(p) { return p && p === p.toUpperCase(); }
    function isBlack(p) { return p && p === p.toLowerCase(); }
    function initBoard() {
      boardState = JSON.parse(JSON.stringify(initialBoard));
      currentTurn = 'white'; selectedSquare = null; validMoves = []; moveCount = 0;
      updateStatus(); render();
    }
    function updateStatus() {
      document.getElementById('turnIndicator').textContent = 'Turn: ' + (currentTurn === 'white' ? 'White ♔' : 'Black ♚');
      document.getElementById('moveCount').textContent = 'Moves: ' + moveCount;
    }
    function getPossibleMoves(r, c) {
      const piece = boardState[r][c]; if (!piece) return [];
      const isW = isWhite(piece); if ((currentTurn === 'white' && !isW) || (currentTurn === 'black' && isW)) return [];
      const moves = [], type = piece.toLowerCase();
      const addMove = (nr, nc) => {
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
        const target = boardState[nr][nc];
        if (!target) { moves.push([nr, nc]); return true; }
        if ((isW && isBlack(target)) || (!isW && isWhite(target))) moves.push([nr, nc]);
        return false;
      };
      if (type === 'p') {
        const dir = isW ? -1 : 1, startRow = isW ? 6 : 1;
        if (r + dir >= 0 && r + dir <= 7 && !boardState[r + dir][c]) {
          moves.push([r + dir, c]);
          if (r === startRow && !boardState[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
        }
        [[r + dir, c - 1], [r + dir, c + 1]].forEach(([nr, nc]) => {
          if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
            const t = boardState[nr][nc];
            if (t && ((isW && isBlack(t)) || (!isW && isWhite(t)))) moves.push([nr, nc]);
          }
        });
      } else if (type === 'n') {
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => addMove(r + dr, c + dc));
      } else if (type === 'r' || type === 'b' || type === 'q') {
        const dirs = [];
        if (type === 'r' || type === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        if (type === 'b' || type === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        dirs.forEach(([dr, dc]) => { let nr = r + dr, nc = c + dc; while (addMove(nr, nc)) { nr += dr; nc += dc; } });
      } else if (type === 'k') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => addMove(r + dr, c + dc));
      }
      return moves;
    }
    function render() {
      const b = document.getElementById('board'); b.innerHTML = '';
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = document.createElement('div');
          sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
          const p = boardState[r][c]; if (p) sq.textContent = PIECES[p] || p;
          if (selectedSquare && selectedSquare[0] === r && selectedSquare[1] === c) sq.classList.add('selected');
          if (validMoves.some(([mr, mc]) => mr === r && mc === c)) { sq.classList.add('possible'); if (p) sq.classList.add('has-piece'); }
          sq.onclick = () => handleSquareClick(r, c);
          b.appendChild(sq);
        }
      }
    }
    function handleSquareClick(r, c) {
      if (selectedSquare) {
        const [sr, sc] = selectedSquare;
        if (validMoves.some(([mr, mc]) => mr === r && mc === c)) {
          boardState[r][c] = boardState[sr][sc]; boardState[sr][sc] = '';
          currentTurn = currentTurn === 'white' ? 'black' : 'white'; moveCount++;
          selectedSquare = null; validMoves = []; updateStatus(); render(); return;
        }
      }
      const p = boardState[r][c];
      if (p && ((currentTurn === 'white' && isWhite(p)) || (currentTurn === 'black' && isBlack(p)))) {
        selectedSquare = [r, c]; validMoves = getPossibleMoves(r, c); render(); return;
      }
      selectedSquare = null; validMoves = []; render();
    }
    document.getElementById('resetBtn').onclick = initBoard;
    initBoard();
  </script>
</body>
</html>`
    };
  }

  // SNAKE
  if (lower.includes('snake')) {
    return {
      title: 'COREZ Snake Game',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>COREZ Snake Game</title>
  <style>
    :root { --bg: #09090b; --card: #121215; --border: #27272a; --text: #f4f4f5; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1.25rem 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .game-container { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 440px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.5rem; }
    .status-bar { font-size: 0.85rem; color: #a1a1aa; margin-bottom: 0.75rem; display: flex; justify-content: space-between; padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.03); border-radius: 4px; border: 1px solid var(--border); }
    canvas { background: #000; border: 1px solid var(--border); border-radius: 4px; display: block; margin: 0 auto 1rem auto; width: 100%; max-width: 360px; aspect-ratio: 1; }
    .btn { background: #fff; color: #000; border: none; padding: 0.55rem 1.1rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="game-container">
    <h1>COREZ SNAKE</h1>
    <div class="status-bar">
      <span id="scoreText">Score: 0</span>
      <span id="highScoreText">High Score: 0</span>
    </div>
    <canvas id="c" width="300" height="300"></canvas>
    <button class="btn" id="startBtn">Play / Restart</button>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    const grid = 15, count = 20;
    let snake = [{x: 10, y: 10}], food = {x: 15, y: 15}, dx = 1, dy = 0, score = 0, highScore = 0, gameLoop = null;
    function reset() {
      snake = [{x: 10, y: 10}]; dx = 1; dy = 0; score = 0;
      document.getElementById('scoreText').textContent = 'Score: 0';
      spawnFood(); if (gameLoop) clearInterval(gameLoop); gameLoop = setInterval(update, 100);
    }
    function spawnFood() { food.x = Math.floor(Math.random() * count); food.y = Math.floor(Math.random() * count); }
    function update() {
      const head = {x: snake[0].x + dx, y: snake[0].y + dy};
      if (head.x < 0 || head.x >= count || head.y < 0 || head.y >= count || snake.some(s => s.x === head.x && s.y === head.y)) {
        clearInterval(gameLoop); alert('Game Over! Score: ' + score); return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10; if (score > highScore) { highScore = score; document.getElementById('highScoreText').textContent = 'High Score: ' + highScore; }
        document.getElementById('scoreText').textContent = 'Score: ' + score; spawnFood();
      } else snake.pop();
      draw();
    }
    function draw() {
      ctx.fillStyle = '#000'; ctx.fillRect(0,0,300,300);
      ctx.fillStyle = '#fff'; snake.forEach(s => ctx.fillRect(s.x*grid, s.y*grid, grid-1, grid-1));
      ctx.fillStyle = '#a1a1aa'; ctx.fillRect(food.x*grid, food.y*grid, grid-1, grid-1);
    }
    window.onkeydown = e => {
      if (e.key === 'ArrowUp' && dy === 0) { dx = 0; dy = -1; }
      if (e.key === 'ArrowDown' && dy === 0) { dx = 0; dy = 1; }
      if (e.key === 'ArrowLeft' && dx === 0) { dx = -1; dy = 0; }
      if (e.key === 'ArrowRight' && dx === 0) { dx = 1; dy = 0; }
    };
    document.getElementById('startBtn').onclick = reset; reset();
  </script>
</body>
</html>`
    };
  }

  // PONG / ARCADE
  if (lower.includes('pong') || lower.includes('paddle') || lower.includes('ping pong')) {
    return {
      title: 'COREZ Pong Arcade',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>COREZ Pong Arcade</title>
  <style>
    :root { --bg: #09090b; --card: #121215; --border: #27272a; --text: #f4f4f5; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .game-container { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 480px; text-align: center; }
    h1 { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem; text-transform: uppercase; }
    .status { font-size: 0.85rem; color: #a1a1aa; margin-bottom: 0.75rem; }
    canvas { background: #000; border: 1px solid var(--border); border-radius: 4px; width: 100%; aspect-ratio: 1.5; display: block; margin: 0 auto 1rem auto; }
    .btn { background: #fff; color: #000; border: none; padding: 0.5rem 1rem; border-radius: 4px; font-weight: 700; cursor: pointer; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="game-container">
    <h1>COREZ PONG ARCADE</h1>
    <div class="status" id="score">Player: 0 | CPU: 0</div>
    <canvas id="c" width="450" height="300"></canvas>
    <button class="btn" id="start">Start Game</button>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let pY = 110, cY = 110, bX = 225, bY = 150, bVX = 3, bVY = 3, pS = 0, cS = 0, loop = null;
    canvas.onmousemove = e => { const r = canvas.getBoundingClientRect(); pY = e.clientY - r.top - 40; };
    function resetBall() { bX = 225; bY = 150; bVX = (Math.random()>0.5?3:-3); bVY = (Math.random()>0.5?3:-3); }
    function update() {
      bX += bVX; bY += bVY;
      if (bY <= 0 || bY >= 290) bVY *= -1;
      cY += (bY - (cY + 40)) * 0.08;
      if (bX <= 20 && bY >= pY && bY <= pY + 80) { bVX = Math.abs(bVX) + 0.2; }
      if (bX >= 420 && bY >= cY && bY <= cY + 80) { bVX = -Math.abs(bVX) - 0.2; }
      if (bX < 0) { cS++; resetBall(); }
      if (bX > 450) { pS++; resetBall(); }
      document.getElementById('score').textContent = 'Player: ' + pS + ' | CPU: ' + cS;
      ctx.fillStyle = '#000'; ctx.fillRect(0,0,450,300);
      ctx.fillStyle = '#fff'; ctx.fillRect(10, pY, 10, 80); ctx.fillRect(430, cY, 10, 80);
      ctx.fillRect(bX, bY, 10, 10);
    }
    document.getElementById('start').onclick = () => { if (loop) clearInterval(loop); pS = 0; cS = 0; resetBall(); loop = setInterval(update, 1000/60); };
  </script>
</body>
</html>`
    };
  }

  // DINO RUNNER / RETRO JUMP GAME
  if (lower.includes('dino') || lower.includes('dinosaur') || lower.includes('runner') || lower.includes('jump') || lower.includes('t-rex')) {
    return {
      title: 'COREZ Retro Dino Runner 🦖',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>COREZ Retro Dino Runner</title>
  <style>
    :root { --bg: #09090b; --card: #121215; --border: #27272a; --text: #f4f4f5; --text-muted: #a1a1aa; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1.25rem 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .game-container { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.5rem; }
    .status-bar { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem; display: flex; justify-content: space-between; padding: 0.4rem 0.65rem; background: rgba(255,255,255,0.03); border-radius: 4px; border: 1px solid var(--border); }
    canvas { background: #050505; border: 1px solid var(--border); border-radius: 4px; display: block; margin: 0 auto 0.75rem auto; width: 100%; max-width: 440px; aspect-ratio: 2 / 1; cursor: pointer; }
    .controls-hint { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem; }
    .btn { background: #fff; color: #000; border: none; padding: 0.55rem 1.1rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; }
    .btn:hover { background: #ccc; }
  </style>
</head>
<body>
  <div class="game-container">
    <h1>COREZ DINO RUNNER 🦖</h1>
    <div class="status-bar">
      <span id="scoreText">Score: 0</span>
      <span id="highScoreText">High Score: 0</span>
    </div>
    <canvas id="c" width="400" height="200"></canvas>
    <div class="controls-hint">Press SPACE, UP ARROW, or TAP CANVAS to Jump</div>
    <button class="btn" id="startBtn">Play / Restart</button>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let dino = { x: 40, y: 150, w: 20, h: 30, vy: 0, grounded: true };
    let obstacles = [];
    let score = 0, highScore = 0, speed = 4, frame = 0, isRunning = false, loop = null;

    function jump() {
      if (dino.grounded && isRunning) {
        dino.vy = -10;
        dino.grounded = false;
      } else if (!isRunning) {
        start();
      }
    }

    function spawnObstacle() {
      const h = 20 + Math.random() * 20;
      obstacles.push({ x: 400, w: 14, h: h, y: 180 - h });
    }

    function start() {
      dino = { x: 40, y: 150, w: 20, h: 30, vy: 0, grounded: true };
      obstacles = [];
      score = 0; speed = 4; frame = 0; isRunning = true;
      document.getElementById('scoreText').textContent = 'Score: 0';
      if (loop) clearInterval(loop);
      loop = setInterval(update, 1000/60);
    }

    function update() {
      frame++;
      score = Math.floor(frame / 5);
      if (score > highScore) { highScore = score; document.getElementById('highScoreText').textContent = 'High Score: ' + highScore; }
      document.getElementById('scoreText').textContent = 'Score: ' + score;

      if (frame % 300 === 0) speed += 0.5;

      dino.vy += 0.5;
      dino.y += dino.vy;
      if (dino.y >= 150) {
        dino.y = 150;
        dino.vy = 0;
        dino.grounded = true;
      }

      if (frame % Math.max(40, Math.floor(100 - speed * 4)) === 0) {
        spawnObstacle();
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= speed;

        if (dino.x < o.x + o.w && dino.x + dino.w > o.x && dino.y < o.y + o.h && dino.y + dino.h > o.y) {
          isRunning = false;
          clearInterval(loop);
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(0, 0, 400, 200);
          ctx.fillStyle = '#fff';
          ctx.font = '700 18px -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('GAME OVER 🦖', 200, 90);
          ctx.font = '400 13px -apple-system, sans-serif';
          ctx.fillText('Final Score: ' + score + ' - Tap to Restart', 200, 120);
          return;
        }

        if (o.x + o.w < 0) obstacles.splice(i, 1);
      }

      draw();
    }

    function draw() {
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, 400, 200);

      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 180);
      ctx.lineTo(400, 180);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(dino.x, dino.y, dino.w, dino.h);
      ctx.fillStyle = '#000000';
      ctx.fillRect(dino.x + 12, dino.y + 4, 4, 4);

      ctx.fillStyle = '#a1a1aa';
      obstacles.forEach(o => {
        ctx.fillRect(o.x, o.y, o.w, o.h);
      });
    }

    window.addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    });
    canvas.addEventListener('click', jump);
    document.getElementById('startBtn').addEventListener('click', start);
    start();
  </script>
</body>
</html>`
    };
  }

  // GENERAL DYNAMIC GAME SYNTHESIZER for ANY user prompt!
  const gameTitle = clean.replace(/(create|build|make|generate|a|an|the|game|play|app|widget|prototype)/gi, '').trim() || 'Arcade Dodge';
  const capitalizedTitle = gameTitle.charAt(0).toUpperCase() + gameTitle.slice(1);

  return {
    title: `COREZ ${capitalizedTitle} Game`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>COREZ ${capitalizedTitle}</title>
  <style>
    :root { --bg: #09090b; --card: #121215; --border: #27272a; --text: #f4f4f5; --text-muted: #a1a1aa; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1.25rem 1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; width: 100%; max-width: 440px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { font-size: 1.2rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 0.5rem; }
    .status-bar { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem; display: flex; justify-content: space-between; padding: 0.4rem 0.65rem; background: rgba(255,255,255,0.03); border-radius: 4px; border: 1px solid var(--border); }
    canvas { background: #000; border: 1px solid var(--border); border-radius: 4px; display: block; margin: 0 auto 0.75rem auto; width: 100%; aspect-ratio: 1.5; cursor: crosshair; }
    .btn { background: #fff; color: #000; border: none; padding: 0.55rem 1.1rem; border-radius: 4px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>COREZ ${capitalizedTitle.toUpperCase()}</h1>
    <div class="status-bar">
      <span id="scoreText">Score: 0</span>
      <span id="highScoreText">High Score: 0</span>
    </div>
    <canvas id="c" width="360" height="240"></canvas>
    <button class="btn" id="startBtn">Start Game</button>
  </div>
  <script>
    const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
    let pX = 160, pY = 200, score = 0, highScore = 0, enemies = [], loop = null, active = false;
    canvas.onmousemove = e => { const r = canvas.getBoundingClientRect(); pX = e.clientX - r.left - 15; };
    function start() {
      pX = 160; score = 0; enemies = []; active = true;
      if (loop) clearInterval(loop);
      loop = setInterval(update, 1000/60);
    }
    function update() {
      score++;
      if (score > highScore) highScore = score;
      document.getElementById('scoreText').textContent = 'Score: ' + score;
      document.getElementById('highScoreText').textContent = 'High Score: ' + highScore;
      if (score % 20 === 0) enemies.push({ x: Math.random()*330, y: 0, s: 2 + Math.random()*3 });
      for (let i = enemies.length-1; i >= 0; i--) {
        const e = enemies[i]; e.y += e.s;
        if (pX < e.x + 20 && pX + 30 > e.x && pY < e.y + 20 && pY + 20 > e.y) {
          active = false; clearInterval(loop); alert('Game Over! Final Score: ' + score); return;
        }
        if (e.y > 240) enemies.splice(i, 1);
      }
      ctx.fillStyle = '#000'; ctx.fillRect(0,0,360,240);
      ctx.fillStyle = '#fff'; ctx.fillRect(pX, pY, 30, 20);
      ctx.fillStyle = '#a1a1aa'; enemies.forEach(e => ctx.fillRect(e.x, e.y, 20, 20));
    }
    document.getElementById('startBtn').onclick = start;
    start();
  </script>
</body>
</html>`
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
  if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup)(\s|!|\.|\?|$)/i.test(lower)) {
    return `Hi there! How’s your day going?`;
  }

  if (lower.includes('who are you') || lower.includes('what can you do')) {
    return `Hello! I'm **COREZ**, a minimalist AI assistant built for public users.\n\nI can help you understand ideas, write clearer content, debug code, analyze documents, plan products, or generate live monochrome web apps and games that open in the preview canvas. Tell me what you want to make or understand, and I’ll infer the goal, explain the useful context, and give you a practical next step.`;
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

export async function generateAIResponse(prompt) {
  const cleanPrompt = prompt.trim();

  if (IMAGE_PATTERNS.test(cleanPrompt) || cleanPrompt.toLowerCase().startsWith('image:') || cleanPrompt.toLowerCase().startsWith('flux:')) {
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
    const hostedAiResponse = await generateHostedAIResponse(cleanPrompt, intent);
    if (hostedAiResponse) {
      return hostedAiResponse;
    }
  } catch (hostedAiError) {
    console.warn('Hosted AI unavailable; using local Corez fallback.', hostedAiError);
  }

  return generateLocalAIResponse(cleanPrompt);
}
