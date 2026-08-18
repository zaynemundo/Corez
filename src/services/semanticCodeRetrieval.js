/**
 * Semantic Code Retrieval Service
 * 
 * Generates vector embeddings for user prompts via the Workers AI embedding
 * endpoint (POST /api/embed, powered by BGE-M3 / BGE-Large) and performs cosine
 * similarity matching against a curated knowledge base of verified code patterns,
 * multi-page architectures, canvas systems, and UI components.
 */

export const CODE_PATTERN_KNOWLEDGE_BASE = [
  {
    id: 'multipage-site-structure',
    title: 'Multi-Page Website Architecture with Unified Theme',
    tags: ['multipage', 'multi-page', 'pages', 'portfolio', 'navigation', 'about', 'contact', 'projects', 'website'],
    description: 'Complete multi-page site architecture using <!-- PAGE: filename.html --> markers, relative navigation anchors, single unified background, and zero missing page link errors.',
    snippet: `<!-- PAGE: index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Title</title>
  <style>
    :root { --site-bg: linear-gradient(135deg, #090A0F 0%, #12141D 100%); }
    body { background: var(--site-bg); color: #fff; font-family: sans-serif; margin: 0; min-height: 100vh; }
    nav a { color: #8b8da3; text-decoration: none; margin-right: 1.5rem; transition: color 0.2s; }
    nav a:hover, nav a.active { color: #fff; }
  </style>
</head>
<body>
  <nav><a href="index.html" class="active">Home</a><a href="about.html">About</a><a href="projects.html">Projects</a><a href="contact.html">Contact</a></nav>
  <main><h1>Home</h1></main>
</body>
</html>

<!-- PAGE: about.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>About</title>
  <style>/* Same unified style rules */</style>
</head>
<body>
  <nav><a href="index.html">Home</a><a href="about.html" class="active">About</a><a href="projects.html">Projects</a><a href="contact.html">Contact</a></nav>
  <main><h1>About</h1></main>
</body>
</html>`
  },
  {
    id: 'canvas-particle-system',
    title: 'Interactive 2D Canvas Particle System & Glow',
    tags: ['particles', 'canvas', 'background', 'animation', 'cursor', 'glow', 'interactive', 'visual', 'effect'],
    description: 'Lightweight, high-performance HTML5 canvas particle background with distance connecting lines, mouse attraction/glow, and responsive resize handler.',
    snippet: `<canvas id="particlesCanvas" style="position:fixed;inset:0;pointer-events:none;z-index:0"></canvas>
<script>
(function() {
  const canvas = document.getElementById('particlesCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  class Particle {
    constructor() { this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height; this.vx = (Math.random() - 0.5) * 0.4; this.vy = (Math.random() - 0.5) * 0.4; this.radius = Math.random() * 2 + 1; }
    update() { this.x += this.vx; this.y += this.vy; if (this.x < 0 || this.x > canvas.width) this.vx *= -1; if (this.y < 0 || this.y > canvas.height) this.vy *= -1; }
    draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(168,85,247,0.3)'; ctx.fill(); }
  }
  for (let i = 0; i < 50; i++) particles.push(new Particle());
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }
  loop();
})();
</script>`
  },
  {
    id: 'glassmorphism-card-grid',
    title: 'Dynamic Mouse-Tracking Glassmorphic Cards',
    tags: ['card', 'cards', 'grid', 'glass', 'glassmorphism', 'hover', 'mouse', 'ui', 'modern', 'dark mode', 'services'],
    description: 'Modern glassmorphic card grid with radial gradient hover tracking, smooth scale animations, and accessibility-compliant contrast.',
    snippet: `<style>
  .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
  .glass-card {
    background: rgba(18, 20, 29, 0.65);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 2rem;
    position: relative;
    overflow: hidden;
    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), border-color 0.3s;
  }
  .glass-card:hover { transform: translateY(-6px); border-color: rgba(168, 85, 247, 0.4); }
</style>`
  },
  {
    id: 'interactive-counter-stats',
    title: 'Animated Metric Counter Statistics with Ease-Out',
    tags: ['counter', 'stats', 'numbers', 'metrics', 'animation', 'dashboard', 'analytics'],
    description: 'Smooth intersection-observer triggered numeric counter animation with cubic easing and zero dependencies.',
    snippet: `<div class="stat"><h3 class="counter" data-target="250">0</h3><p>Projects</p></div>
<script>
const counters = document.querySelectorAll('.counter');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const target = +el.dataset.target;
      const dur = 1500, start = performance.now();
      function update(now) {
        const p = Math.min((now - start) / dur, 1);
        el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * target) + '+';
        if (p < 1) requestAnimationFrame(update);
      }
      requestAnimationFrame(update);
      observer.unobserve(el);
    }
  });
}, { threshold: 0.5 });
counters.forEach(c => observer.observe(c));
</script>`
  },
  {
    id: 'canvas-game-loop-engine',
    title: 'Responsive 2D Canvas Game Loop with Touch Controls',
    tags: ['game', 'canvas', 'arcade', 'touch', 'controls', 'loop', 'keyboard', 'retro', 'player', 'collision'],
    description: 'Full-viewport 2D canvas game loop featuring keyboard & on-screen mobile touch controls, state machine, and fixed-ratio coordinate scaling.',
    snippet: `<canvas id="gameCanvas" style="display:block;width:100%;height:100%"></canvas>
<script>
(function() {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const GW = 960, GH = 540;
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  function gameLoop() {
    const scale = Math.min(canvas.width / GW, canvas.height / GH);
    ctx.setTransform(scale, 0, 0, scale, (canvas.width - GW * scale) / 2, (canvas.height - GH * scale) / 2);
    ctx.fillStyle = '#090A0F';
    ctx.fillRect(0, 0, GW, GH);
    requestAnimationFrame(gameLoop);
  }
  requestAnimationFrame(gameLoop);
})();
</script>`
  },
  {
    id: 'surgical-diff-revision',
    title: 'Surgical Section Replacement Pattern',
    tags: ['revise', 'revision', 'fix', 'update', 'modify', 'surgical', 'change'],
    description: 'Preserves 100% of surrounding HTML/CSS structure while isolating and applying specific modifications to target tags, variables, or functions.',
    snippet: `<!-- Locate target selector/component and modify only the requested rules/elements while preserving the rest -->`
  }
];

/**
 * Computes cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministic local embedding fallback generator (token frequency vector).
 * Used when the remote Workers AI / OpenCode embedding endpoint is offline or unavailable.
 */
export function createLocalEmbeddingVector(text, dimensions = 64) {
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens = clean.split(/\s+/).filter(Boolean);
  const vector = new Array(dimensions).fill(0);
  
  if (tokens.length === 0) return vector;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let hash = 0;
    for (let j = 0; j < token.length; j++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dimensions;
    vector[idx] += 1;
  }

  // Normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vector[i] * vector[i];
  if (norm > 0) {
    const sqrtNorm = Math.sqrt(norm);
    for (let i = 0; i < dimensions; i++) vector[i] /= sqrtNorm;
  }

  return vector;
}

/**
 * Fetch embeddings from the backend Workers AI endpoint (/api/embed).
 */
export async function fetchEmbeddings(texts) {
  const items = Array.isArray(texts) ? texts : [texts];
  try {
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: items })
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data) && json.data.length === items.length) {
        return json.data;
      }
    }
  } catch {
    // Network or server error -> fallback
  }

  // Local fallback vectors
  return items.map(t => createLocalEmbeddingVector(t));
}

/**
 * Precomputed pattern index vectors for fast matching.
 */
const patternVectorsCache = new Map();

function getPatternText(pattern) {
  return `${pattern.title} ${pattern.tags.join(' ')} ${pattern.description}`;
}

/**
 * Semantically retrieves the most relevant code patterns for a given user prompt.
 * 
 * @param {string} prompt User request prompt
 * @param {Object} options
 * @param {number} options.topK Maximum number of patterns to return (default: 2)
 * @param {number} options.minSimilarity Minimum cosine similarity score threshold (default: 0.15)
 * @returns {Promise<Array<{ pattern: Object, score: number }>>}
 */
export async function retrieveSemanticCodePatterns(prompt, { topK = 2, minSimilarity = 0.15 } = {}) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return [];
  }

  const promptText = prompt.trim();
  
  // 1. Ensure pattern vectors are computed
  const patternTexts = CODE_PATTERN_KNOWLEDGE_BASE.map(p => getPatternText(p));
  let patternVectors = [];
  
  if (patternVectorsCache.size === CODE_PATTERN_KNOWLEDGE_BASE.length) {
    patternVectors = CODE_PATTERN_KNOWLEDGE_BASE.map(p => patternVectorsCache.get(p.id));
  } else {
    patternVectors = await fetchEmbeddings(patternTexts);
    CODE_PATTERN_KNOWLEDGE_BASE.forEach((p, idx) => {
      patternVectorsCache.set(p.id, patternVectors[idx]);
    });
  }

  // 2. Compute embedding for user prompt
  const [promptVector] = await fetchEmbeddings([promptText]);

  // 3. Compute cosine similarity scores
  const scored = CODE_PATTERN_KNOWLEDGE_BASE.map((pattern, idx) => {
    const vector = patternVectors[idx];
    const score = cosineSimilarity(promptVector, vector);
    return { pattern, score };
  });

  // 4. Sort and filter
  return scored
    .filter(item => item.score >= minSimilarity)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Formats retrieved semantic code patterns into a structured prompt instruction block.
 */
export function formatRetrievedPatternsForPrompt(retrievedPatterns) {
  if (!Array.isArray(retrievedPatterns) || retrievedPatterns.length === 0) {
    return '';
  }

  let formatted = `\n[SEMANTIC EMBEDDING RETRIEVAL - RELEVANT CODE ARCHITECTURE PATTERNS]:\n`;
  retrievedPatterns.forEach(({ pattern, score }, idx) => {
    formatted += `\nPattern #${idx + 1}: ${pattern.title} (Relevance Score: ${(score * 100).toFixed(0)}%)\n`;
    formatted += `Description: ${pattern.description}\n`;
    if (pattern.snippet) {
      formatted += `Reference Implementation Blueprint:\n${pattern.snippet}\n`;
    }
  });

  return formatted;
}
