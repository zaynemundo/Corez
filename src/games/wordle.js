export function synthesizeWordleGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Wordle Master</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --correct: #10b981;
      --present: #eab308;
      --absent: #3f3f46;
      --tile-border: #3f3f46;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; width: 100%; max-width: 440px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.3rem; color: #fff; }
    .subtitle { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem; }
    .grid { display: grid; grid-template-rows: repeat(6, 1fr); gap: 6px; margin-bottom: 1.2rem; }
    .row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    .tile { aspect-ratio: 1; border: 2px solid var(--tile-border); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; text-transform: uppercase; user-select: none; transition: transform 0.15s ease, background-color 0.3s ease; }
    .tile.filled { border-color: #71717a; animation: pop 0.1s ease; }
    .tile.correct { background: var(--correct) !important; border-color: var(--correct) !important; color: #fff; }
    .tile.present { background: var(--present) !important; border-color: var(--present) !important; color: #fff; }
    .tile.absent { background: var(--absent) !important; border-color: var(--absent) !important; color: #a1a1aa; }
    .keyboard { display: flex; flex-direction: column; gap: 6px; width: 100%; }
    .kb-row { display: flex; justify-content: center; gap: 4px; }
    .key { background: #27272a; color: var(--text); border: none; border-radius: 4px; padding: 0.6rem 0.4rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; user-select: none; flex: 1; max-width: 36px; transition: background 0.2s; }
    .key.wide { flex: 1.5; max-width: 58px; font-size: 0.7rem; }
    .key:hover { background: #3f3f46; }
    .key.correct { background: var(--correct); color: #fff; }
    .key.present { background: var(--present); color: #fff; }
    .key.absent { background: #18181b; color: #52525b; }
    .toast { position: fixed; top: 1.5rem; left: 50%; transform: translateX(-50%); background: #ef4444; color: #fff; padding: 0.6rem 1.2rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; z-index: 10; }
    .toast.show { opacity: 1; }
    .controls { margin-top: 1rem; display: flex; justify-content: center; gap: 0.5rem; }
    .btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
  </style>
</head>
<body>
  <div id="toast" class="toast">Not in word list!</div>
  <div class="game-card">
    <h1>COREZ WORDLE</h1>
    <p class="subtitle">Guess the 5-letter hidden word in 6 tries</p>
    <div class="grid" id="grid"></div>
    <div class="keyboard" id="keyboard"></div>
    <div class="controls">
      <button class="btn" id="resetBtn">New Word</button>
    </div>
  </div>
  <script>
    const WORDS = [
      "APPLE","BRAIN","SMART","COREZ","FLASH","REACT","PLANT","TRAIN","WATER","DREAM",
      "SHINE","CLOCK","FLAME","STORM","CLIMB","SOUND","MUSIC","LIGHT","GREAT","WORLD",
      "POWER","CLEAN","CLEAR","CLOUDS","SPACE","CRAFT","AGENT","BOARD","CHECK","FRAME",
      "GUIDE","HOUSE","IMAGE","JUICE","KNIFE","LEMON","MAGIC","NIGHT","OCEAN","PAPER",
      "QUEEN","RIVER","SOLAR","TABLE","UNION","VALUE","WHITE","YOUTH","ZEBRA","BLOCK",
      "CANDY","DRIVE","EARTH","FIELD","GLASS","HEART","INDEX","JUDGE","LOGIC","MONEY",
      "NOBLE","ORDER","PHASE","RADIO","STAGE","TRACK","VOICE","YIELD","APEX","BLINK"
    ];
    const DICTIONARY = new Set([
      ...WORDS,
      "ABOUT","ABOVE","ABUSE","ACTOR","ACUTE","ADMIT","ADOPT","ADULT","AFTER","AGAIN",
      "AGENT","AGREE","AHEAD","ALARM","ALBUM","ALERT","ALIKE","ALIVE","ALLOW","ALONE",
      "ALONG","ALTER","AMONG","ANGER","ANGLE","ANGRY","APART","APPLE","APPLY","ARENA",
      "ARGUE","ARISE","ARRAY","ASIDE","ASSET","AUDIO","AUDIT","AVOID","AWARD","AWARE",
      "BADLY","BAKER","BASES","BASIC","BASIS","BEACH","BEGIN","BEING","BELOW","BENCH",
      "BLACK","BLANK","BLIND","BLOCK","BLOOD","BOARD","BOAST","BOOST","BOUND","BRAIN",
      "BRAND","BREAD","BREAK","BRICK","BRIEF","BRING","BROAD","BROWN","BUILD","BUILT",
      "BUYER","CABLE","CALIF","CARRY","CATCH","CAUSE","CHAIN","CHAIR","CHAOS","CHARM",
      "CHART","CHASE","CHEAP","CHECK","CHEST","CHIEF","CHILD","CHINA","CHOSE","CIVIL",
      "CLAIM","CLASS","CLEAN","CLEAR","CLICK","CLOCK","CLOSE","COACH","COAST","COLOR",
      "COUNT","COURT","COVER","CRAFT","CRASH","CREAM","CRIME","CROSS","CROWD","CROWN",
      "CYCLE","DAILY","DANCE","DATED","DEATH","DEBUT","DELAY","DEPTH","DIRTY","DOUBT",
      "DRAFT","DRAMA","DREAM","DRESS","DRIVE","EARTH","EIGHT","EMPTY","ENEMY","ENTRY",
      "EQUAL","ERROR","EVENT","EVERY","EXACT","EXIST","FAITH","FALSE","FAULT","FIBER",
      "FIELD","FIFTH","FIFTY","FINAL","FIRST","FIXED","FLASH","FLEET","FLOOR","FLUID",
      "FOCUS","FORCE","FORTH","FORTY","FORUM","FOUND","FRAME","FRANK","FRAUD","FRESH",
      "FRONT","FRUIT","FULLY","FUNNY","GIANT","GIVEN","GLASS","GLOBE","GOING","GRACE",
      "GRADE","GRAND","GRANT","GRASS","GREAT","GREEN","GROSS","GROUP","GROWN","GUARD",
      "GUESS","GUEST","GUIDE","HAPPY","HEART","HEAVY","HELLO","IMAGE","INDEX","INPUT",
      "ISSUE","JAPAN","JUDGE","KNIFE","LABEL","LABOR","LARGE","LATER","LATIN","LAYER",
      "LEARN","LEASE","LEAST","LEAVE","LEGAL","LEVEL","LIGHT","LIMIT","LOCAL","LOGIC",
      "LOOSE","LOWER","LUCKY","MAGIC","MAJOR","MAKER","MARCH","MATCH","MAYBE","MEDAL",
      "MEDIA","METAL","MICRO","MIGHT","MINOR","MINUS","MODEL","MONEY","MONTH","MORAL",
      "MOTOR","MOUNT","MOUSE","MOUTH","MOVIE","MUSIC","NEEDS","NEVER","NIGHT","NOISE",
      "NORTH","NOTED","NOVEL","NURSE","OCCUR","OCEAN","OFFER","OFTEN","ORDER","OTHER",
      "OUGHT","PAINT","PANEL","PAPER","PARTY","PEACE","PETER","PHASE","PHONE","PHOTO",
      "PIECE","PILOT","PITCH","PLACE","PLAIN","PLANE","PLANT","PLATE","POINT","POUND",
      "POWER","PRESS","PRICE","PRIDE","PRIME","PRINT","PRIOR","PROOF","PROUD","PROVE",
      "QUEEN","QUICK","QUIET","QUITE","RADIO","RAISE","RANGE","RAPID","RATIO","REACH",
      "READY","REFER","RIGHT","RIVAL","RIVER","ROBIN","ROGER","ROMAN","ROUGH","ROUND",
      "ROUTE","ROYAL","SCALE","SCENE","SCOPE","SCORE","SENSE","SERVE","SEVEN","SHALL",
      "SHAPE","SHARE","SHARP","SHEET","SHELF","SHELL","SHIFT","SHINE","SHIRT","SHOCK",
      "SHOOT","SHORT","SHOWN","SIGHT","SINCE","SIXTH","SIXTY","SIZED","SKILL","SLEEP",
      "SLIDE","SMALL","SMART","SMILE","SMITH","SMOKE","SOLID","SOLVE","SORRY","SOUND",
      "SOUTH","SPACE","SPARE","SPEAK","SPEED","SPEND","SPENT","SPLIT","SPOKE","SPORT",
      "STAFF","STAGE","STAKE","STAND","START","STATE","STEAM","STEEL","STICK","STILL",
      "STOCK","STONE","STOOD","STORE","STORM","STORY","STRIP","STUCK","STUDY","STUFF",
      "STYLE","SUGAR","SUITE","SUPER","TABLE","TAKEN","TASTE","TAXES","TEACH","TEETH",
      "TEXAS","THANK","THEFT","THEIR","THEME","THERE","THESE","THICK","THING","THINK",
      "THIRD","THOSE","THREE","THREW","THROW","TIGHT","TIMES","TIRED","TITLE","TODAY",
      "TOPIC","TOTAL","TOUCH","TOUGH","TOWER","TRACK","TRADE","TRAIN","TREAT","TREND",
      "TRIAL","TRIED","TRIES","TRUCK","TRULY","TRUST","TRUTH","TWICE","UNDER","UNDUE",
      "UNION","UNITY","UNTIL","UPPER","UPSET","URBAN","USAGE","USUAL","VALID","VALUE",
      "VIDEO","VIRUS","VISIT","VITAL","VOICE","WASTE","WATCH","WATER","WHEEL","WHERE",
      "WHICH","WHILE","WHITE","WHOLE","WHOSE","WOMAN","WOMEN","WORLD","WORRY","WORSE",
      "WORST","WORTH","WOULD","WOUND","WRITE","WRONG","WROTE","YOUTH"
    ]);

    let target = "", currentRow = 0, currentTile = 0, gameOver = false;
    let guesses = Array(6).fill("");
    const keyStates = {};

    function init() {
      target = WORDS[Math.floor(Math.random() * WORDS.length)];
      currentRow = 0; currentTile = 0; gameOver = false;
      guesses = Array(6).fill("");
      for (let k in keyStates) delete keyStates[k];
      renderGrid();
      renderKeyboard();
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }

    function renderGrid() {
      const g = document.getElementById('grid');
      g.innerHTML = '';
      for (let r = 0; r < 6; r++) {
        const row = document.createElement('div');
        row.className = 'row';
        for (let c = 0; c < 5; c++) {
          const tile = document.createElement('div');
          tile.className = 'tile';
          const ch = guesses[r] ? guesses[r][c] || '' : '';
          tile.textContent = ch;
          if (ch) tile.classList.add('filled');
          if (r < currentRow) {
            const evalState = evaluateTile(guesses[r], c);
            tile.classList.add(evalState);
          }
          row.appendChild(tile);
        }
        g.appendChild(row);
      }
    }

    function evaluateTile(word, idx) {
      if (!word) return '';
      const ch = word[idx];
      if (target[idx] === ch) return 'correct';
      if (target.includes(ch)) return 'present';
      return 'absent';
    }

    function renderKeyboard() {
      const kb = document.getElementById('keyboard');
      kb.innerHTML = '';
      const layout = [
        ["Q","W","E","R","T","Y","U","I","O","P"],
        ["A","S","D","F","G","H","J","K","L"],
        ["ENTER","Z","X","C","V","B","N","M","BACK"]
      ];

      layout.forEach(r => {
        const row = document.createElement('div');
        row.className = 'kb-row';
        r.forEach(k => {
          const btn = document.createElement('button');
          btn.className = 'key' + (k.length > 1 ? ' wide' : '');
          btn.textContent = k === 'BACK' ? '⌫' : k;
          if (keyStates[k]) btn.classList.add(keyStates[k]);
          btn.onclick = () => handleInput(k);
          row.appendChild(btn);
        });
        kb.appendChild(row);
      });
    }

    function handleInput(key) {
      if (gameOver) return;
      if (key === 'ENTER') {
        if (currentTile < 5) {
          showToast('Not enough letters');
          return;
        }
        const guess = guesses[currentRow];
        if (!DICTIONARY.has(guess)) {
          showToast('Not in word list!');
          return;
        }

        for (let i = 0; i < 5; i++) {
          const ch = guess[i];
          const st = evaluateTile(guess, i);
          if (st === 'correct' || (st === 'present' && keyStates[ch] !== 'correct') || (!keyStates[ch] && st === 'absent')) {
            keyStates[ch] = st;
          }
        }

        currentRow++;
        currentTile = 0;
        renderGrid();
        renderKeyboard();

        if (guess === target) {
          gameOver = true;
          setTimeout(() => alert('🎉 Outstanding! You solved it in ' + currentRow + ' tries!'), 300);
        } else if (currentRow === 6) {
          gameOver = true;
          setTimeout(() => alert('Game Over! The target word was: ' + target), 300);
        }
      } else if (key === 'BACK' || key === 'BACKSPACE') {
        if (currentTile > 0) {
          currentTile--;
          guesses[currentRow] = guesses[currentRow].slice(0, currentTile);
          renderGrid();
        }
      } else if (/^[A-Z]$/.test(key)) {
        if (currentTile < 5) {
          guesses[currentRow] += key;
          currentTile++;
          renderGrid();
        }
      }
    }

    document.addEventListener('keydown', e => {
      const k = e.key.toUpperCase();
      if (k === 'ENTER' || k === 'BACKSPACE' || /^[A-Z]$/.test(k)) {
        handleInput(k);
      }
    });

    document.getElementById('resetBtn').onclick = init;
    init();
  </script>
</body>
</html>`;
}

