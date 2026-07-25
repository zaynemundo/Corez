export function synthesizeFinancialTerminal() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COREZ Financial Demo Terminal</title>
  <style>
    :root {
      --bg: #09090b;
      --card: #121215;
      --border: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --green: #10b981;
      --red: #ef4444;
      --accent: #6366f1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; }
    .terminal-container { width: 100%; max-width: 860px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
    .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem; flex-wrap: wrap; gap: 0.8rem; border-bottom: 1px solid var(--border); padding-bottom: 0.8rem; }
    .title { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.5rem; }
    .status-badge { font-size: 0.7rem; padding: 0.2rem 0.5rem; background: rgba(16, 185, 129, 0.15); color: var(--green); border: 1px solid var(--green); border-radius: 4px; font-weight: 700; text-transform: uppercase; }
    .search-box { display: flex; gap: 0.5rem; width: 100%; max-width: 320px; }
    .search-input { width: 100%; background: var(--bg); border: 1px solid var(--border); color: #fff; padding: 0.5rem 0.8rem; border-radius: 6px; font-size: 0.85rem; }
    .search-input:focus { outline: none; border-color: var(--accent); }
    .ticker-bar { display: flex; gap: 0.6rem; overflow-x: auto; padding-bottom: 0.6rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); }
    .ticker-chip { background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 0.45rem 0.75rem; border-radius: 6px; cursor: pointer; white-space: nowrap; font-size: 0.8rem; transition: 0.2s; }
    .ticker-chip:hover, .ticker-chip.active { background: var(--border); border-color: var(--accent); }
    .main-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
    @media (max-width: 768px) { .main-grid { grid-template-columns: 1fr; } }
    .chart-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .asset-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1rem; }
    .asset-symbol { font-size: 1.4rem; font-weight: 800; }
    .asset-price { font-size: 1.6rem; font-weight: 800; font-family: monospace; }
    .asset-change { font-size: 0.85rem; font-weight: 700; margin-left: 0.5rem; }
    .asset-change.up { color: var(--green); }
    .asset-change.down { color: var(--red); }
    .timeframes { display: flex; gap: 0.3rem; margin-bottom: 1rem; }
    .tf-btn { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
    .tf-btn.active { background: #fff; color: #000; font-weight: 700; }
    svg.chart { width: 100%; height: 220px; overflow: visible; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; margin-top: 1rem; font-size: 0.8rem; border-top: 1px solid var(--border); padding-top: 0.8rem; }
    .stat-item { display: flex; justify-content: space-between; color: var(--muted); }
    .stat-val { color: var(--text); font-weight: 700; }
    .side-panel { display: flex; flex-direction: column; gap: 1rem; }
    .panel-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .panel-title { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .converter-row { display: flex; flex-direction: column; gap: 0.6rem; }
    .conv-input { background: var(--card); border: 1px solid var(--border); color: #fff; padding: 0.5rem; border-radius: 6px; font-size: 0.85rem; }
    .conv-result { font-size: 1.1rem; font-weight: 800; color: var(--green); margin-top: 0.4rem; text-align: center; }
  </style>
</head>
<body>
  <div class="terminal-container">
    <div class="header-bar">
      <div class="title">
        <span>COREZ FINANCIAL DEMO TERMINAL</span>
        <span class="status-badge">DEMO DATA</span>
      </div>
      <div class="search-box">
        <input type="text" id="searchInput" class="search-input" placeholder="Search AAPL, NVDA, BTC, EUR/USD...">
      </div>
    </div>

    <div class="ticker-bar" id="tickerBar"></div>

    <div class="main-grid">
      <div class="chart-card">
        <div class="asset-header">
          <div>
            <span class="asset-symbol" id="assetSymbol">AAPL</span>
            <span class="asset-change up" id="assetChange">+1.42%</span>
          </div>
          <div class="asset-price" id="assetPrice">$333.69</div>
        </div>

        <div class="timeframes">
          <button class="tf-btn active">1D</button>
          <button class="tf-btn">1W</button>
          <button class="tf-btn">1M</button>
          <button class="tf-btn">1Y</button>
        </div>

        <svg class="chart" id="chartSvg" viewBox="0 0 500 200"></svg>

        <div class="stats-grid">
          <div class="stat-item"><span>High (24h)</span><span class="stat-val" id="statHigh">$335.20</span></div>
          <div class="stat-item"><span>Low (24h)</span><span class="stat-val" id="statLow">$329.10</span></div>
          <div class="stat-item"><span>Volume</span><span class="stat-val" id="statVol">48.2M</span></div>
          <div class="stat-item"><span>Market Cap</span><span class="stat-val" id="statCap">$5.12T</span></div>
        </div>
      </div>

      <div class="side-panel">
        <div class="panel-card">
          <div class="panel-title">FX & Currency Converter</div>
          <div class="converter-row">
            <input type="number" id="convAmount" class="conv-input" value="100">
            <select id="convFrom" class="conv-input">
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
            <select id="convTo" class="conv-input">
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
            <div class="conv-result" id="convResult">€87.66</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const ASSETS = {
      'AAPL': { name: 'Apple Inc.', price: 333.69, change: '+1.42%', high: 335.20, low: 329.10, vol: '48.2M', cap: '$5.12T', points: [329, 330, 331.5, 331, 333, 332.8, 333.69] },
      'NVDA': { name: 'NVIDIA Corp.', price: 207.06, change: '+2.85%', high: 209.40, low: 201.50, vol: '62.4M', cap: '$5.08T', points: [201, 203, 204, 206, 205.5, 208, 207.06] },
      'TSLA': { name: 'Tesla Inc.', price: 379.76, change: '-0.65%', high: 384.10, low: 375.00, vol: '34.8M', cap: '$1.21T', points: [383, 381, 379, 377, 380, 378, 379.76] },
      'BTC': { name: 'Bitcoin', price: 65000.00, change: '+1.30%', high: 65500, low: 64000, vol: '$32.1B', cap: '$1.31T', points: [64000, 64300, 64800, 64600, 65000] },
      'ETH': { name: 'Ethereum', price: 1930.83, change: '+0.40%', high: 1955, low: 1910, vol: '$14.2B', cap: '$232B', points: [1910, 1925, 1920, 1940, 1935, 1930, 1930.83] },
      'EUR/USD': { name: 'Euro / USD', price: 1.1407, change: '+0.07%', high: 1.1425, low: 1.1390, vol: 'Forex', cap: 'N/A', points: [1.139, 1.1398, 1.1402, 1.1412, 1.1405, 1.1407] },
      'GOLD': { name: 'Gold Spot', price: 2400.00, change: '+0.85%', high: 2410, low: 2380, vol: 'Futures', cap: 'N/A', points: [2380, 2388, 2395, 2390, 2400] }
    };

    const FX = { USD: 1.0, EUR: 0.8766, GBP: 0.7505, JPY: 148.80 };
    let currentSymbol = 'AAPL';

    async function fetchLiveMarketData() {
      try {
        // Fetch Live Crypto from CoinGecko API
        const cryptoRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
        if (cryptoRes.ok) {
          const cData = await cryptoRes.json();
          if (cData.bitcoin) {
            ASSETS['BTC'].price = cData.bitcoin.usd;
            ASSETS['BTC'].change = (cData.bitcoin.usd_24h_change >= 0 ? '+' : '') + cData.bitcoin.usd_24h_change.toFixed(2) + '%';
          }
          if (cData.ethereum) {
            ASSETS['ETH'].price = cData.ethereum.usd;
            ASSETS['ETH'].change = (cData.ethereum.usd_24h_change >= 0 ? '+' : '') + cData.ethereum.usd_24h_change.toFixed(2) + '%';
          }
        }
      } catch (e) {
        console.warn('Crypto API live fetch fallback active', e);
      }

      try {
        // Fetch Live FX rates from Frankfurter (ECB Data API)
        const fxRes = await fetch('https://api.frankfurter.app/latest?from=USD');
        if (fxRes.ok) {
          const fxData = await fxRes.json();
          if (fxData.rates) {
            FX.EUR = fxData.rates.EUR || FX.EUR;
            FX.GBP = fxData.rates.GBP || FX.GBP;
            FX.JPY = fxData.rates.JPY || FX.JPY;
            if (fxData.rates.EUR) {
              ASSETS['EUR/USD'].price = (1 / fxData.rates.EUR).toFixed(4);
            }
          }
        }
      } catch (e) {
        console.warn('FX API live fetch fallback active', e);
      }

      renderTickers();
      selectAsset(currentSymbol);
      setupConverter();
    }

    function init() {
      renderTickers();
      selectAsset('AAPL');
      setupConverter();
      fetchLiveMarketData();

      document.getElementById('searchInput').addEventListener('input', e => {
        const query = e.target.value.toUpperCase().trim();
        if (ASSETS[query]) selectAsset(query);
      });

      // Periodically refresh live price data every 15 seconds
      setInterval(fetchLiveMarketData, 15000);
    }

    function renderTickers() {
      const bar = document.getElementById('tickerBar');
      bar.innerHTML = Object.keys(ASSETS).map(sym => \`
        <div class="ticker-chip \${sym === currentSymbol ? 'active' : ''}" onclick="selectAsset('\${sym}')">
          <b>\${sym}</b> $\${ASSETS[sym].price}
        </div>
      \`).join('');
    }

    function selectAsset(sym) {
      currentSymbol = sym;
      renderTickers();
      const a = ASSETS[sym];
      document.getElementById('assetSymbol').textContent = sym + ' (' + a.name + ')';
      document.getElementById('assetPrice').textContent = (sym.includes('/') || sym === 'GOLD' ? '' : '$') + a.price;
      const chgEl = document.getElementById('assetChange');
      chgEl.textContent = a.change;
      chgEl.className = 'asset-change ' + (a.change.startsWith('+') ? 'up' : 'down');
      document.getElementById('statHigh').textContent = a.high;
      document.getElementById('statLow').textContent = a.low;
      document.getElementById('statVol').textContent = a.vol;
      document.getElementById('statCap').textContent = a.cap;
      renderSVGChart(a.points, a.change.startsWith('+'));
    }

    function renderSVGChart(pts, isUp) {
      const svg = document.getElementById('chartSvg');
      const min = Math.min(...pts), max = Math.max(...pts);
      const range = (max - min) || 1;
      const coords = pts.map((val, idx) => {
        const x = (idx / (pts.length - 1)) * 480 + 10;
        const y = 180 - ((val - min) / range) * 150;
        return \`\${x},\${y}\`;
      }).join(' ');

      const color = isUp ? '#10b981' : '#ef4444';
      svg.innerHTML = \`
        <polyline fill="none" stroke="\${color}" stroke-width="3" points="\${coords}" />
        \${pts.map((val, idx) => {
          const x = (idx / (pts.length - 1)) * 480 + 10;
          const y = 180 - ((val - min) / range) * 150;
          return \`<circle cx="\${x}" cy="\${y}" r="4" fill="\${color}" />\`;
        }).join('')}
      \`;
    }

    function setupConverter() {
      const amount = document.getElementById('convAmount');
      const from = document.getElementById('convFrom');
      const to = document.getElementById('convTo');
      const res = document.getElementById('convResult');
      function calc() {
        const amt = parseFloat(amount.value) || 0;
        const inUSD = amt / FX[from.value];
        const out = inUSD * FX[to.value];
        res.textContent = out.toFixed(2) + ' ' + to.value;
      }
      [amount, from, to].forEach(el => el.addEventListener('input', calc));
      calc();
    }

    init();
  </script>
</body>
</html>`;
}
