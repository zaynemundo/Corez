export const SAMPLE_APPS = [
  {
    id: 'dashboard',
    title: '📊 Monochrome Executive Analytics',
    description: 'Stark high-contrast revenue metrics, minimalist SVG chart, and search-filterable data table.',
    model: 'chatgpt',
    prompt: 'Build an executive analytics dashboard with monochrome styling, stark SVG chart, and live search.',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --bg: #000000;
      --card: #0e0e0e;
      --text: #ffffff;
      --text-muted: #888888;
      --border: rgba(255, 255, 255, 0.15);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 1.5rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
    .title { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.03em; }
    .badge { background: #ffffff; color: #000000; padding: 3px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; }
    
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .metric-card { background: var(--card); border: 1px solid var(--border); padding: 1.25rem; border-radius: 8px; }
    .metric-title { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.4rem; }
    .metric-val { font-size: 1.7rem; font-weight: 900; letter-spacing: -0.04em; }
    .trend { font-size: 0.75rem; color: #aaaaaa; margin-top: 0.4rem; font-weight: 600; }
    
    .chart-container { background: var(--card); border: 1px solid var(--border); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; }
    .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .svg-chart { width: 100%; height: 150px; overflow: visible; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
    th { color: var(--text-muted); font-weight: 700; text-transform: uppercase; font-size: 0.75rem; }
    .search-input { background: var(--bg); border: 1px solid var(--border); padding: 0.5rem 0.8rem; border-radius: 6px; color: var(--text); outline: none; }
    .search-input:focus { border-color: #ffffff; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">COREZ // EXECUTIVE DASHBOARD</div>
    <span class="badge">Monochrome Sync</span>
  </div>
  
  <div class="grid">
    <div class="metric-card">
      <div class="metric-title">Total Revenue</div>
      <div class="metric-val">$184,920</div>
      <div class="trend">+22.4% vs last period</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Active Users</div>
      <div class="metric-val">12,410</div>
      <div class="trend">+14.8% growth</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Conversion Rate</div>
      <div class="metric-val">5.84%</div>
      <div class="trend">+1.2% optimized</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Avg Basket</div>
      <div class="metric-val">$96.20</div>
      <div class="trend">+4.1% size</div>
    </div>
  </div>

  <div class="chart-container">
    <div class="chart-header">
      <h3 style="font-size: 0.95rem; letter-spacing: -0.02em;">REVENUE GROWTH TREND</h3>
      <input type="text" id="searchInput" class="search-input" placeholder="Filter customer logs..." onkeyup="filterTable()">
    </div>
    <svg class="svg-chart" viewBox="0 0 500 150">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <path d="M0,130 Q75,40 150,80 T300,30 T450,70 T500,20 L500,150 L0,150 Z" fill="url(#grad)" />
      <path d="M0,130 Q75,40 150,80 T300,30 T450,70 T500,20" fill="none" stroke="#ffffff" stroke-width="2.5" />
      <circle cx="150" cy="80" r="4" fill="#ffffff" />
      <circle cx="300" cy="30" r="4" fill="#ffffff" />
      <circle cx="500" cy="20" r="4" fill="#ffffff" />
    </svg>
  </div>

  <div class="metric-card">
    <h3 style="font-size: 0.9rem; margin-bottom: 0.5rem; letter-spacing: -0.02em;">CLIENT RECORD SETS</h3>
    <table id="dataTable">
      <thead>
        <tr>
          <th>Client</th>
          <th>Tier</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Acme Corp</td><td>Enterprise</td><td>$5,200</td><td style="color:#ffffff">Verified</td></tr>
        <tr><td>Starlight Labs</td><td>Pro</td><td>$1,800</td><td style="color:#ffffff">Verified</td></tr>
        <tr><td>Nexus Systems</td><td>Enterprise</td><td>$4,100</td><td style="color:#888888">Processing</td></tr>
        <tr><td>CyberPulse</td><td>Growth</td><td>$950</td><td style="color:#ffffff">Verified</td></tr>
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
    title: '🎮 Monochrome Particle Physics Sandbox',
    description: 'Black and white particle gravity simulation with interactive mouse attractor.',
    model: 'claude',
    prompt: 'Build a monochrome 2D particle physics simulation with interactive mouse gravity attractor.',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #000000; color: #ffffff; font-family: system-ui; overflow: hidden; height: 100vh; }
    canvas { width: 100vw; height: 100vh; display: block; }
    .controls { position: absolute; top: 1rem; left: 1rem; background: rgba(15, 15, 15, 0.9); border: 1px solid rgba(255,255,255,0.2); padding: 1rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.6rem; width: 220px; }
    .label { font-size: 0.75rem; color: #888; display: flex; justify-content: space-between; font-weight: 700; text-transform: uppercase; }
    input[type=range] { width: 100%; accent-color: #ffffff; }
    button { background: #ffffff; border: none; color: #000000; padding: 0.5rem; border-radius: 4px; font-weight: 800; cursor: pointer; font-size: 0.8rem; text-transform: uppercase; }
    button:hover { background: #cccccc; }
  </style>
</head>
<body>
  <div class="controls">
    <div class="label"><span>Particle Density:</span><span id="pVal">160</span></div>
    <input type="range" id="pRange" min="50" max="350" value="160">
    <div class="label"><span>Attractor Force:</span><span id="gVal">0.6</span></div>
    <input type="range" id="gRange" min="0.1" max="1.5" step="0.1" value="0.6">
    <button onclick="resetParticles()">Reset Simulator</button>
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
    let particleCount = 160;
    let gravityForce = 0.6;

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
        this.radius = Math.random() * 2.5 + 1.5;
        this.alpha = Math.random() * 0.7 + 0.3;
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
        ctx.fillStyle = \`rgba(255, 255, 255, \${this.alpha})\`;
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
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
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
  }
];
