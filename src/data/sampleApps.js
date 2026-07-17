export const SAMPLE_APPS = [
  {
    id: 'dashboard',
    title: '📊 Interactive Executive Dashboard',
    description: 'Real-time revenue metrics, interactive SVG charts, dynamic data table with live search.',
    model: 'chatgpt',
    prompt: 'Build me an interactive executive analytics dashboard with live KPI cards, interactive chart toggles, and search filterable data.',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #6366f1;
      --accent-green: #10b981;
      --border: rgba(255,255,255,0.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1.5rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .title { font-size: 1.4rem; font-weight: 700; }
    .badge { background: rgba(99, 102, 241, 0.2); color: #818cf8; padding: 4px 10px; border-radius: 99px; font-size: 0.8rem; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .metric-card { background: var(--card); border: 1px solid var(--border); padding: 1.25rem; border-radius: 12px; }
    .metric-title { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem; }
    .metric-val { font-size: 1.6rem; font-weight: 800; }
    .trend { font-size: 0.8rem; color: var(--accent-green); margin-top: 0.4rem; font-weight: 600; }
    
    .chart-container { background: var(--card); border: 1px solid var(--border); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; }
    .chart-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
    .svg-chart { width: 100%; height: 160px; overflow: visible; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
    th { color: var(--text-muted); font-weight: 600; background: rgba(0,0,0,0.2); }
    .search-input { background: var(--bg); border: 1px solid var(--border); padding: 0.5rem 0.8rem; border-radius: 6px; color: var(--text); outline: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">🚀 OmniAnalytics Overview</div>
    <span class="badge">Live Sync Active</span>
  </div>
  
  <div class="grid">
    <div class="metric-card">
      <div class="metric-title">Total Revenue</div>
      <div class="metric-val">$142,850</div>
      <div class="trend">↑ +18.4% vs last month</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Active Subscribers</div>
      <div class="metric-val">8,492</div>
      <div class="trend">↑ +12.1% new users</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Conversion Rate</div>
      <div class="metric-val">4.62%</div>
      <div class="trend">↑ +0.8% optimized</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Avg Order Value</div>
      <div class="metric-val">$84.50</div>
      <div class="trend">↑ +3.2% cart size</div>
    </div>
  </div>

  <div class="chart-container">
    <div class="chart-header">
      <h3 style="font-size: 1rem;">Monthly Revenue Growth Trend</h3>
      <input type="text" id="searchInput" class="search-input" placeholder="Search customer records..." onkeyup="filterTable()">
    </div>
    <svg class="svg-chart" viewBox="0 0 500 150">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <path d="M0,130 Q75,40 150,80 T300,30 T450,70 T500,20 L500,150 L0,150 Z" fill="url(#grad)" />
      <path d="M0,130 Q75,40 150,80 T300,30 T450,70 T500,20" fill="none" stroke="#6366f1" stroke-width="3" />
      <circle cx="150" cy="80" r="5" fill="#818cf8" />
      <circle cx="300" cy="30" r="5" fill="#818cf8" />
      <circle cx="500" cy="20" r="5" fill="#10b981" />
    </svg>
  </div>

  <div class="metric-card">
    <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">Recent Client Transactions</h3>
    <table id="dataTable">
      <thead>
        <tr>
          <th>Client Name</th>
          <th>Plan</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Acme Corp</td><td>Enterprise</td><td>$4,500</td><td style="color:#10b981">Paid</td></tr>
        <tr><td>Starlight Media</td><td>Pro Team</td><td>$1,200</td><td style="color:#10b981">Paid</td></tr>
        <tr><td>Nexus Labs</td><td>Enterprise</td><td>$3,800</td><td style="color:#f59e0b">Pending</td></tr>
        <tr><td>CyberPulse Inc</td><td>Growth</td><td>$650</td><td style="color:#10b981">Paid</td></tr>
      </tbody>
    </table>
  </div>

  <script>
    function filterTable() {
      const query = document.getElementById('searchInput').value.toLowerCase();
      const rows = document.querySelectorAll('#dataTable tbody tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`
  },
  {
    id: 'game',
    title: '🎮 2D Canvas Physics Gravity Sandbox',
    description: 'Interactive particle gravity physics simulation with mouse attraction and custom controls.',
    model: 'claude',
    prompt: 'Build me an interactive 2D physics particle simulation with mouse gravity attractor and customizable controls.',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #090d16; color: white; font-family: system-ui; overflow: hidden; height: 100vh; }
    canvas { width: 100vw; height: 100vh; display: block; }
    .controls { position: absolute; top: 1rem; left: 1rem; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); padding: 1rem; border-radius: 12px; display: flex; flex-direction: column; gap: 0.6rem; width: 220px; }
    .label { font-size: 0.8rem; color: #94a3b8; display: flex; justify-content: space-between; }
    input[type=range] { width: 100%; accent-color: #6366f1; }
    button { background: #6366f1; border: none; color: white; padding: 0.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
    button:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="controls">
    <div class="label"><span>Particles:</span><span id="pVal">150</span></div>
    <input type="range" id="pRange" min="50" max="400" value="150">
    <div class="label"><span>Gravity Force:</span><span id="gVal">0.5</span></div>
    <input type="range" id="gRange" min="0.1" max="1.5" step="0.1" value="0.5">
    <button onclick="resetParticles()">Reset Physics</button>
  </div>

  <canvas id="canvas"></canvas>

  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    let mouse = { x: width/2, y: height/2, active: false };
    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    });

    let particles = [];
    let particleCount = 150;
    let gravityForce = 0.5;

    document.getElementById('pRange').addEventListener('input', (e) => {
      particleCount = parseInt(e.target.value);
      document.getElementById('pVal').textContent = particleCount;
      resetParticles();
    });

    document.getElementById('gRange').addEventListener('input', (e) => {
      gravityForce = parseFloat(e.target.value);
      document.getElementById('gVal').textContent = gravityForce;
    });

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.radius = Math.random() * 3 + 2;
        this.color = \`hsl(\${Math.random() * 60 + 220}, 90%, 65%)\`;
      }
      update() {
        if (mouse.active) {
          let dx = mouse.x - this.x;
          let dy = mouse.y - this.y;
          let dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 5 && dist < 300) {
            let force = (300 - dist) / 300 * gravityForce;
            this.vx += (dx / dist) * force;
            this.vy += (dy / dist) * force;
          }
        }
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
      }
    }

    function resetParticles() {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    }

    resetParticles();

    function animate() {
      ctx.fillStyle = 'rgba(9, 13, 22, 0.25)';
      ctx.fillRect(0, 0, width, height);

      particles.forEach(p => {
        p.update();
        p.draw();
      });

      requestAnimationFrame(animate);
    }
    animate();
  </script>
</body>
</html>`
  },
  {
    id: 'calculator',
    title: '📈 Financial ROI & Investment Calculator',
    description: 'Dynamic investment compound interest growth calculator with SVG chart rendering.',
    model: 'gemini',
    prompt: 'Build a financial ROI calculator app with real-time compound interest breakdown and growth visualizer.',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { background: #0f172a; color: #f8fafc; font-family: system-ui; padding: 1.5rem; }
    .card { background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem; max-width: 550px; margin: auto; }
    .title { font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem; color: #818cf8; }
    .field { margin-bottom: 1rem; }
    label { font-size: 0.85rem; color: #94a3b8; display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
    input[type=range] { width: 100%; accent-color: #6366f1; }
    .res-box { background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 1rem; text-align: center; margin-top: 1rem; }
    .total-val { font-size: 2rem; font-weight: 800; color: #10b981; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">💰 Investment Compound ROI Calculator</div>
    
    <div class="field">
      <label><span>Initial Principal ($):</span><b id="pText">$10,000</b></label>
      <input type="range" id="pInput" min="1000" max="100000" step="1000" value="10000">
    </div>
    <div class="field">
      <label><span>Annual Return Rate (%):</span><b id="rText">8%</b></label>
      <input type="range" id="rInput" min="1" max="20" step="0.5" value="8">
    </div>
    <div class="field">
      <label><span>Investment Period (Years):</span><b id="yText">10 Years</b></label>
      <input type="range" id="yInput" min="1" max="30" step="1" value="10">
    </div>

    <div class="res-box">
      <div style="font-size:0.85rem; color:#94a3b8;">Estimated Future Balance</div>
      <div class="total-val" id="futureVal">$21,589</div>
      <div style="font-size:0.8rem; color:#818cf8; margin-top:0.4rem;" id="profitVal">Total Gain: +$11,589 (+115.9%)</div>
    </div>
  </div>

  <script>
    function calculate() {
      const p = parseFloat(document.getElementById('pInput').value);
      const r = parseFloat(document.getElementById('rInput').value) / 100;
      const y = parseInt(document.getElementById('yInput').value);

      document.getElementById('pText').textContent = '$' + p.toLocaleString();
      document.getElementById('rText').textContent = (r * 100).toFixed(1) + '%';
      document.getElementById('yText').textContent = y + ' Years';

      const future = p * Math.pow((1 + r), y);
      const profit = future - p;
      const roi = (profit / p) * 100;

      document.getElementById('futureVal').textContent = '$' + Math.round(future).toLocaleString();
      document.getElementById('profitVal').textContent = 'Total Gain: +$' + Math.round(profit).toLocaleString() + ' (+' + roi.toFixed(1) + '%)';
    }

    ['pInput', 'rInput', 'yInput'].forEach(id => {
      document.getElementById(id).addEventListener('input', calculate);
    });
    calculate();
  </script>
</body>
</html>`
  }
];
