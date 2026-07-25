export function synthesizeChessGame(withBot = false) {
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
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 460px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
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

