export function synthesizeScrabbleGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Scrabble Master</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --tile-bg: #eab308;
      --tile-text: #000000;
      --tw: #ef4444;
      --dw: #ec4899;
      --tl: #3b82f6;
      --dl: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1rem; }
    .game-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; width: 100%; max-width: 480px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    h1 { font-size: 1.25rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5rem; color: #fff; }
    .status-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border); margin-bottom: 0.75rem; font-size: 0.85rem; }
    .score-badge { font-weight: 700; color: #eab308; }
    .board { display: grid; grid-template-columns: repeat(11, 1fr); grid-template-rows: repeat(11, 1fr); gap: 2px; aspect-ratio: 1; background: #18181b; border: 2px solid var(--border); border-radius: 6px; padding: 4px; margin-bottom: 0.75rem; }
    .sq { background: #27272a; border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; cursor: pointer; user-select: none; position: relative; color: #71717a; text-transform: uppercase; }
    .sq.tw { background: var(--tw); color: #fff; }
    .sq.dw { background: var(--dw); color: #fff; }
    .sq.tl { background: var(--tl); color: #fff; }
    .sq.dl { background: var(--dl); color: #fff; }
    .sq.center { background: #eab308; color: #000; }
    .tile { width: 90%; height: 90%; background: var(--tile-bg); color: var(--tile-text); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 800; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    .tile-sub { position: absolute; bottom: 1px; right: 2px; font-size: 0.55rem; font-weight: 700; }
    .tile.unsubmitted { outline: 2px solid #ffffff; animation: pulse 1s infinite alternate; }
    .rack-container { background: #18181b; border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem; margin-bottom: 0.75rem; }
    .rack-label { font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .rack-tiles { display: flex; justify-content: center; gap: 6px; min-height: 42px; }
    .rack-tile { width: 38px; height: 38px; background: var(--tile-bg); color: var(--tile-text); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 800; cursor: pointer; user-select: none; position: relative; box-shadow: 0 2px 4px rgba(0,0,0,0.3); transition: transform 0.15s ease; }
    .rack-tile:hover { transform: translateY(-2px); }
    .rack-tile.selected { outline: 3px solid #6366f1; transform: translateY(-4px); }
    .controls { display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap; }
    .btn { background: #fff; color: #000; border: none; padding: 0.55rem 1rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
    .btn:hover { opacity: 0.9; }
    .btn-sec { background: transparent; color: var(--text); border: 1px solid var(--border); }
    .btn-sec:hover { background: rgba(255,255,255,0.05); }
    @keyframes pulse { from { opacity: 0.85; } to { opacity: 1; } }
  </style>
</head>
<body>
  <div class="game-card">
    <h1>COREZ SCRABBLE</h1>
    <div class="status-bar">
      <span>Score: <span id="score" class="score-badge">0</span></span>
      <span>Tiles Left: <span id="bagCount" class="score-badge">80</span></span>
    </div>
    <div class="board" id="board"></div>
    <div class="rack-container">
      <div class="rack-label">Your Tile Rack (Click tile to select, then click board square)</div>
      <div class="rack-tiles" id="rack"></div>
    </div>
    <div class="controls">
      <button class="btn" id="submitBtn">Play Turn</button>
      <button class="btn btn-sec" id="recallBtn">Recall</button>
      <button class="btn btn-sec" id="shuffleBtn">Shuffle</button>
      <button class="btn btn-sec" id="resetBtn">New Game</button>
    </div>
  </div>
  <script>
    const POINTS = { A:1, B:3, C:3, D:2, E:1, F:4, G:2, H:4, I:1, J:8, K:5, L:1, M:3, N:1, O:1, P:3, Q:10, R:1, S:1, T:1, U:1, V:4, W:4, X:8, Y:4, Z:10 };

    const DICTIONARY = new Set([
      "AN","AT","BE","BY","DO","GO","HE","IN","IS","IT","ME","MY","NO","ON","OR","SO","TO","UP","WE",
      "ACT","ADD","AGE","AIR","AND","ANY","ART","BAD","BAG","BED","BIG","BOX","BOY","BUS","BUT","CAN","CAT","CAR","DAY","DOG","DRY","EAR","EAT","EGG","END","EYE","FAR","FLY","FOR","GET","GOD","GUN","HAT","HOT","ICE","JOB","KEY","KID","LAW","LEG","LET","LOW","MAN","MAP","NEW","NOT","NOW","OFF","OLD","ONE","OUR","OUT","PAY","PEN","PER","PET","PIN","POP","PUT","RED","RUN","SEA","SEE","SET","SIX","SUN","TAX","TEN","THE","TOP","TOY","TRY","TWO","USE","WAR","WAY","WIN","YES","YOU","ZOO",
      "ABLE","ACID","AGED","ALSO","AREA","ARMY","BABY","BACK","BALL","BAND","BANK","BASE","BATH","BEAR","BEAT","BELL","BEST","BIRD","BLOW","BLUE","BOAT","BODY","BOMB","BOND","BONE","BOOK","BOOM","BORN","BOSS","BOTH","BOWL","BULK","BURN","BUSH","BUSY","CALL","CALM","CAME","CAMP","CARD","CARE","CASE","CASH","CELL","CHAT","CHEF","CITY","CLUB","COAL","COAT","CODE","COLD","CORE","COST","DARK","DATA","DATE","DAWN","DEAD","DEAL","DEAR","DEBT","DEEP","DESK","DIET","DISK","DOOR","DOWN","DRAW","DROP","DUST","DUTY","EACH","EARN","EAST","EASY","EDGE","ELSE","EVEN","EVER","FACE","FACT","FAIR","FALL","FARM","FAST","FEAR","FEED","FEEL","FEET","FILE","FILL","FILM","FIND","FINE","FIRE","FIRM","FISH","FLAT","FLOW","FOOD","FOOT","FORD","FORM","FORT","FREE","FROM","FUEL","FULL","FUND","GAME","GIFT","GIRL","GIVE","GLAD","GOAL","GOLD","GOOD","GROW","GOLF","HALF","HAND","HARD","HARM","HEAD","HEAR","HEAT","HELL","HELP","HIGH","HOLD","HOLE","HOME","HOPE","HUGE","IDEA","INTO","ITEM","JOIN","JUMP","JUST","KEEP","KIND","KING","KNEW","KNOW","LACK","LADY","LAND","LANE","LAST","LATE","LEAD","LEFT","LESS","LIFE","LIFT","LIKE","LINE","LINK","LION","LIST","LIVE","LOAD","LOAN","LOCK","LOGO","LONG","LOOK","LORD","LOSS","LOVE","LUCK","MADE","MAIL","MAIN","MAKE","MALE","MANY","MARK","MASS","MEAL","MEAN","MEAT","MEET","MIND","MINE","MODE","MOON","MORE","MOST","MOVE","MUCH","NAME","NAVY","NEAR","NECK","NEED","NEWS","NEXT","NICE","NIGHT","NODE","NONE","NOSE","NOTE","OKAY","ONCE","ONLY","OPEN","OVER","PACE","PACK","PAGE","PAIN","PAIR","PARK","PART","PASS","PATH","PEAK","PLAN","PLAY","PLUS","POEM","POET","POLE","POOL","POOR","PORT","POST","PULL","PURE","PUSH","RACE","RAIL","RAIN","RANK","RARE","RATE","READ","REAL","RELY","REST","RICE","RICH","RIDE","RING","RISE","RISK","ROAD","ROCK","ROLE","ROLL","ROOF","ROOM","ROOT","ROSE","RULE","RUSH","SAFE","SAID","SAIL","SALE","SAME","SAVE","SEAT","SEED","SEEK","SEEM","SEEN","SELF","SELL","SEND","SHIP","SHOE","SHOP","SHOT","SHOW","SIDE","SIGN","SITE","SIZE","SKIN","SLIP","SLOW","SNOW","SOFT","SOIL","SOLD","SOLE","SOME","SONG","SOON","SORT","SOUL","SPOT","STAR","STAY","STEP","STOP","SUCH","SUIT","SURE","TAKE","TALK","TALL","TASK","TEAM","TEAR","TECH","TELL","TERM","TEST","TEXT","THAT","THEM","THEN","THIS","THUS","TIDE","TIME","TINY","TOLL","TONE","TOOK","TOOL","TOWN","TREE","TRIP","TRUE","TUBE","TURN","TYPE","UNIT","UPON","USER","VARY","VERY","VIEW","VOTE","WAGE","WAIT","WALK","WALL","WANT","WARM","WASH","WAVE","WAYS","WEAR","WEEK","WELL","WEST","WHAT","WHEN","WHICH","WIDE","WIFE","WILD","WILL","WIND","WINE","WING","WIRE","WISH","WITH","WOOD","WORD","WORK","YARD","YEAR","ZERO","ZONE",
      "ABOUT","ABOVE","ACCEPT","ACTION","ACTIVE","ACTUAL","ADVICE","AFFORD","AFRAID","AGENDA","AGREE","ALMOST","ALWAYS","ANIMAL","ANSWER","ANYONE","APPEAR","AUTHOR","BAKERY","BEAUTY","BEFORE","BEHIND","BETTER","BEYOND","BORDER","BOTTLE","BRANCH","BRIDGE","BRIGHT","BUDGET","CAMERA","CANCEL","CANDLE","CANYON","CAPTAIN","CARBON","CAREER","CASTLE","CEMENT","CENTER","CHANCE","CHANGE","CHARGE","CHEESE","CHOICE","CHURCH","CIRCLE","CLIENT","CHOICE","CLEVER","CLIENT","CLIMATE","COFFEE","COLLEGE","COMMON","CANDLE","COOKIE","COPPER","CORNER","COUSIN","CREDIT","CUSTOM","DAMAGE","DANGER","DEGREE","DESIGN","DESIRE","DETAIL","DEVICE","DIRECT","DOCTOR","DOMAIN","DRAGON","DRIVER","DURING","ENGINE","ENOUGH","ESCAPE","ESTATE","EXPERT","FAMILY","FARMER","FEATHER","FEMALE","FINGER","FLIGHT","FLOWER","FOREST","FORGET","FRIEND","FUTURE","GARDEN","GARLIC","GENIUS","GENTLE","GLOBAL","GOLDEN","HANDLE","HAPPINESS","HARBOR","HEALTH","HEAVEN","HEIGHT","HEROIC","HISTORY","HONEST","HONEY","HUNTER","IMPACT","ISLAND","JACKET","JOURNEY","JUNGLE","JUNIOR","KITCHEN","LADDER","LAWYER","LEADER","LEGEND","LESSON","LETTER","LIQUID","LISTEN","LITTLE","LIVING","LIZARD","LONELY","MAGNET","MAGIC","MANAGEMENT","MANUAL","MARKET","MASTER","MEMORY","MENTOR","METHOD","MIRROR","MODERN","MOMENT","MONKEY","MOTHER","MOUNTAIN","MUSEUM","NATURE","NEIGHBOR","NETWORK","NORMAL","NOTICE","NUMBER","OFFICE","ONLINE","ORANGE","ORIGIN","OXYGEN","PACKET","PALACE","PARNER","PATIENT","PATTERN","PEOPLE","PEPPER","PERSON","PLANET","PLAYER","POLICE","PORTRAIT","POSTAL","POWDER","POWERFUL","PRECIOUS","PREFIX","PRETTY","PRINCE","PRISON","PROFIT","PROMPT","PROPERTY","PROTECT","PUBLIC","PUPIL","PURPLE","PUZZLE","QUALITY","QUARTER","RABBIT","RANDOM","READER","REASON","RECORD","REGION","RESCUE","RESORT","RESULT","REWARD","RIVER","ROCKET","RUNNER","SAFETY","SALAD","SALMON","SAMPLE","SATURN","SAVING","SCHOOL","SCREEN","SEASON","SECOND","SECRET","SECTOR","SENIOR","SHADOW","SILVER","SIMPLE","SINGLE","SISTER","SOCKET","SILENT","SILVER","SKETCH","SLIDER","SMART","SOCKET","SOCKET","SOURCE","SPEAKER","SPIRIT","SPRING","SQUARE","STATION","STATUS","STREAM","STREET","STRONG","STUDENT","SUMMER","SUNDAY","SUPER","SUPPER","SWITCH","SYMBOL","SYSTEM","TARGET","TEMPLE","TENNIS","TERROR","THEORY","THICKET","TICKET","TIMBER","TOGETHER","TOMATO","TONIGHT","TOPIC","TOTAL","TOWARD","TRAVEL","TUNNEL","TURTLE","TWELVE","TWENTY","UNDER","UNIQUE","UPDATE","UPGRADE","VACUUM","VALLEY","VECTOR","VELVET","VICTORY","VILLAGE","VIRTUE","VISION","VOLUME","WALKER","WARNING","WEAPON","WEATHER","WEEKEND","WINNER","WINTER","WISDOM","WORKER","YELLOW"
    ]);

    const BOARD_SIZE = 11;
    let board = [], rack = [], bag = [], score = 0, selectedRackIdx = null, unsubmittedTiles = [];

    function getSquareType(r, c) {
      if (r === 5 && c === 5) return 'center';
      if ((r === 0 || r === 10) && (c === 0 || c === 10)) return 'tw';
      if ((r === 2 || r === 8) && (c === 2 || c === 8)) return 'dw';
      if ((r === 1 || r === 9) && (c === 5 || r === 5 && (c === 1 || c === 9))) return 'tl';
      if ((r === 3 || r === 7) && (c === 3 || c === 7)) return 'dl';
      return '';
    }

    function initBag() {
      bag = [];
      const distribution = { A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9, J:1, K:1, L:4, M:2, N:6, O:8, P:2, Q:1, R:6, S:4, T:6, U:4, V:2, W:2, X:1, Y:2, Z:1 };
      for (let char in distribution) {
        for (let i = 0; i < distribution[char]; i++) bag.push(char);
      }
      bag.sort(() => Math.random() - 0.5);
    }

    function drawTiles(count) {
      const drawn = [];
      while (drawn.length < count && bag.length > 0) {
        drawn.push(bag.pop());
      }
      return drawn;
    }

    function init() {
      initBag();
      score = 0;
      unsubmittedTiles = [];
      selectedRackIdx = null;
      board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
      rack = drawTiles(7);
      render();
    }

    function render() {
      document.getElementById('score').textContent = score;
      document.getElementById('bagCount').textContent = bag.length;

      const bEl = document.getElementById('board');
      bEl.innerHTML = '';
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const sq = document.createElement('div');
          const sqType = getSquareType(r, c);
          sq.className = 'sq ' + sqType;

          const cell = board[r][c];
          if (cell) {
            const tile = document.createElement('div');
            tile.className = 'tile' + (cell.unsubmitted ? ' unsubmitted' : '');
            tile.innerHTML = cell.char + '<span class="tile-sub">' + POINTS[cell.char] + '</span>';
            sq.appendChild(tile);
          } else if (sqType) {
            sq.textContent = sqType.toUpperCase();
          }

          sq.onclick = () => onSquareClick(r, c);
          bEl.appendChild(sq);
        }
      }

      const rEl = document.getElementById('rack');
      rEl.innerHTML = '';
      rack.forEach((char, idx) => {
        const t = document.createElement('div');
        t.className = 'rack-tile' + (selectedRackIdx === idx ? ' selected' : '');
        t.innerHTML = char + '<span class="tile-sub">' + POINTS[char] + '</span>';
        t.onclick = () => {
          selectedRackIdx = selectedRackIdx === idx ? null : idx;
          render();
        };
        rEl.appendChild(t);
      });
    }

    function onSquareClick(r, c) {
      const cell = board[r][c];
      if (cell && cell.unsubmitted) {
        rack.push(cell.char);
        board[r][c] = null;
        unsubmittedTiles = unsubmittedTiles.filter(t => !(t.r === r && t.c === c));
        render();
        return;
      }

      if (!cell && selectedRackIdx !== null) {
        const char = rack[selectedRackIdx];
        rack.splice(selectedRackIdx, 1);
        selectedRackIdx = null;
        board[r][c] = { char, unsubmitted: true };
        unsubmittedTiles.push({ r, c, char });
        render();
      }
    }

    function recallUnsubmitted() {
      unsubmittedTiles.forEach(t => {
        rack.push(t.char);
        board[t.r][t.c] = null;
      });
      unsubmittedTiles = [];
      selectedRackIdx = null;
      render();
    }

    function submitTurn() {
      if (unsubmittedTiles.length === 0) {
        alert('Place at least 1 tile on the board to play your turn.');
        return;
      }

      const rows = new Set(unsubmittedTiles.map(t => t.r));
      const cols = new Set(unsubmittedTiles.map(t => t.c));
      if (rows.size > 1 && cols.size > 1) {
        alert('Tiles must be placed in a single straight row or column.');
        return;
      }

      const wordsFormed = [];

      function getHorizontalWord(r, c) {
        let startC = c;
        while (startC > 0 && board[r][startC - 1]) startC--;
        let endC = c;
        while (endC < BOARD_SIZE - 1 && board[r][endC + 1]) endC++;
        if (startC === endC) return null;
        let word = "", scoreMult = 1, wordPoints = 0;
        for (let i = startC; i <= endC; i++) {
          const cell = board[r][i];
          let p = POINTS[cell.char];
          if (cell.unsubmitted) {
            const type = getSquareType(r, i);
            if (type === 'dl') p *= 2;
            if (type === 'tl') p *= 3;
            if (type === 'dw') scoreMult *= 2;
            if (type === 'tw') scoreMult *= 3;
          }
          wordPoints += p;
          word += cell.char;
        }
        return { word, points: wordPoints * scoreMult };
      }

      function getVerticalWord(r, c) {
        let startR = r;
        while (startR > 0 && board[startR - 1][c]) startR--;
        let endR = r;
        while (endR < BOARD_SIZE - 1 && board[endR + 1][c]) endR++;
        if (startR === endR) return null;
        let word = "", scoreMult = 1, wordPoints = 0;
        for (let i = startR; i <= endR; i++) {
          const cell = board[i][c];
          let p = POINTS[cell.char];
          if (cell.unsubmitted) {
            const type = getSquareType(i, c);
            if (type === 'dl') p *= 2;
            if (type === 'tl') p *= 3;
            if (type === 'dw') scoreMult *= 2;
            if (type === 'tw') scoreMult *= 3;
          }
          wordPoints += p;
          word += cell.char;
        }
        return { word, points: wordPoints * scoreMult };
      }

      const testedWords = new Set();
      let turnScore = 0;

      unsubmittedTiles.forEach(t => {
        const h = getHorizontalWord(t.r, t.c);
        if (h && !testedWords.has(h.word)) {
          testedWords.add(h.word);
          wordsFormed.push(h);
        }
        const v = getVerticalWord(t.r, t.c);
        if (v && !testedWords.has(v.word)) {
          testedWords.add(v.word);
          wordsFormed.push(v);
        }
      });

      if (wordsFormed.length === 0) {
        alert('Your tile must connect with other letters to form a word.');
        return;
      }

      const invalid = wordsFormed.filter(w => !DICTIONARY.has(w.word));
      if (invalid.length > 0) {
        alert('Invalid word: "' + invalid[0].word + '" is not in the dictionary!');
        recallUnsubmitted();
        return;
      }

      wordsFormed.forEach(w => turnScore += w.points);

      unsubmittedTiles.forEach(t => {
        if (board[t.r][t.c]) delete board[t.r][t.c].unsubmitted;
      });

      score += turnScore;
      unsubmittedTiles = [];

      const needed = 7 - rack.length;
      if (needed > 0) {
        const drawn = drawTiles(needed);
        rack.push(...drawn);
      }

      render();
      alert('Success! Word accepted! +' + turnScore + ' points.');
    }

    document.getElementById('submitBtn').onclick = submitTurn;
    document.getElementById('recallBtn').onclick = recallUnsubmitted;
    document.getElementById('shuffleBtn').onclick = () => { rack.sort(() => Math.random() - 0.5); render(); };
    document.getElementById('resetBtn').onclick = init;

    init();
  </script>
</body>
</html>`;
}

