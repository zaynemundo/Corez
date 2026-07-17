// Corez AI Service Engine - Intelligent Intent & Context Analysis Engine

export const MODEL = {
  id: 'corez',
  name: 'Corez AI',
  description: 'High-precision minimalist reasoning & executable canvas application generator.'
};

// Extract executable code block (HTML/CSS/JS) from AI message
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

// Generate intelligent AI response with intent analysis
export async function generateAIResponse(prompt) {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();

  // Simulated natural thinking delay (0.9 to 1.4 seconds)
  await new Promise(r => setTimeout(r, 1100));

  // 1. GREETING INTENT
  const isGreeting = /^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup|who are you|what can you do)(\s|\!|\.|\?|$)/i.test(lower);
  if (isGreeting) {
    if (lower.includes('who are you') || lower.includes('what can you do')) {
      return `Hello! I'm **Corez**, a minimalist AI assistant designed for clean conversation and live application development.\n\nHere is what I can do for you:\n- **Answer Questions & Explain Concepts**: Deep technical explanations, advice, and problem solving.\n- **Construct Interactive Web Apps**: Tell me to build a tool, game, dashboard, or calculator, and I'll generate a live app executable in the right-side Canvas.\n- **Refine & Debug Code**: Provide code snippets for optimization or formatting.\n\nWhat would you like to work on today?`;
    }
    return `Hello! How can I assist you today? Feel free to ask me any question, or describe an interactive web app or game you'd like me to construct for you.`;
  }

  // 2. GRATITUDE INTENT
  if (/^(thanks|thank you|awesome|great|cool|nice|perfect)(\s|\!|\.|$)/i.test(lower)) {
    return `You're welcome! Let me know if you need anything else or want to build another application.`;
  }

  // 3. APPLICATION / GAME / TOOL CREATION INTENT
  const isAppRequest = lower.includes('build') || lower.includes('create') || lower.includes('make') || lower.includes('generate') || lower.includes('app') || lower.includes('widget') || lower.includes('game') || lower.includes('tool') || lower.includes('calculator') || lower.includes('dashboard') || lower.includes('timer') || lower.includes('stopwatch') || lower.includes('html');

  if (isAppRequest) {
    // Generate custom dynamic HTML app code tailored to prompt
    let appTitle = "Monochrome App";
    let appBody = "";

    if (lower.includes('timer') || lower.includes('stopwatch')) {
      appTitle = "Digital Stopwatch & Timer";
      appBody = `
        <div class="counter" id="timer">00:00.0</div>
        <div style="display:flex; gap:0.5rem; justify-content:center; margin-top:1rem;">
          <button class="action-btn" id="startBtn">Start</button>
          <button class="action-btn" style="background:#333; color:#fff;" id="resetBtn">Reset</button>
        </div>
        <script>
          let running = false, time = 0, timerId = null;
          const timer = document.getElementById('timer');
          const startBtn = document.getElementById('startBtn');
          const resetBtn = document.getElementById('resetBtn');
          
          startBtn.addEventListener('click', () => {
            running = !running;
            startBtn.textContent = running ? 'Pause' : 'Start';
            if (running) {
              timerId = setInterval(() => {
                time += 100;
                let ms = Math.floor((time % 1000) / 100);
                let sec = Math.floor((time / 1000) % 60);
                let min = Math.floor(time / 60000);
                timer.textContent = (min<10?'0':'')+min+':'+(sec<10?'0':'')+sec+'.'+ms;
              }, 100);
            } else clearInterval(timerId);
          });
          resetBtn.addEventListener('click', () => {
            clearInterval(timerId); running = false; time = 0;
            startBtn.textContent = 'Start'; timer.textContent = '00:00.0';
          });
        </script>`;
    } else if (lower.includes('game')) {
      appTitle = "Particle Attraction Sandbox";
      appBody = `
        <p>Move your cursor across the canvas to attract particles.</p>
        <canvas id="c" style="width:100%; height:220px; background:#050505; border:1px solid #222; border-radius:6px; margin-top:1rem;"></canvas>
        <script>
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          canvas.width = canvas.offsetWidth; canvas.height = 220;
          let particles = Array.from({length: 100}, () => ({
            x: Math.random()*canvas.width, y: Math.random()*canvas.height,
            vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2
          }));
          let m = {x: canvas.width/2, y: canvas.height/2};
          canvas.addEventListener('mousemove', e => {
            const r = canvas.getBoundingClientRect();
            m.x = e.clientX - r.left; m.y = e.clientY - r.top;
          });
          function draw() {
            ctx.fillStyle = 'rgba(5,5,5,0.3)'; ctx.fillRect(0,0,canvas.width,canvas.height);
            particles.forEach(p => {
              let dx = m.x - p.x, dy = m.y - p.y, dist = Math.sqrt(dx*dx+dy*dy);
              if (dist < 180) { p.vx += (dx/dist)*0.2; p.vy += (dy/dist)*0.2; }
              p.vx *= 0.97; p.vy *= 0.97; p.x += p.vx; p.y += p.vy;
              if (p.x<0||p.x>canvas.width) p.vx*=-1;
              if (p.y<0||p.y>canvas.height) p.vy*=-1;
              ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
            });
            requestAnimationFrame(draw);
          }
          draw();
        </script>`;
    } else {
      appTitle = "Interactive Corez Tool";
      appBody = `
        <p>Custom tool constructed for: <i>"${cleanPrompt.slice(0, 50)}"</i></p>
        <div class="counter" id="val">0</div>
        <button class="action-btn" id="actBtn">Execute Action</button>
        <script>
          let v = 0;
          document.getElementById('actBtn').addEventListener('click', () => {
            v += 1; document.getElementById('val').textContent = v;
          });
        </script>`;
    }

    return `I have designed and constructed your application for **${appTitle}**.\n\n\`\`\`html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${appTitle}</title>\n  <style>\n    :root { --bg: #000; --card: #0d0d0d; --text: #fff; --muted: #888; --border: rgba(255,255,255,0.15); }\n    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }\n    body { background: var(--bg); color: var(--text); padding: 1.5rem; display: flex; align-items: center; justify-content: center; min-height: 100vh; }\n    .app-card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem; width: 100%; max-width: 460px; text-align: center; }\n    .badge { background: #fff; color: #000; padding: 3px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 0.75rem; }\n    h1 { font-size: 1.25rem; font-weight: 900; margin-bottom: 0.4rem; letter-spacing: -0.03em; text-transform: uppercase; }\n    p { color: var(--muted); font-size: 0.825rem; margin-bottom: 1rem; line-height: 1.4; }\n    .action-btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; transition: background 0.2s; }\n    .action-btn:hover { background: #ccc; }\n    .counter { font-size: 2.2rem; font-weight: 900; margin: 0.75rem 0; color: #fff; }\n  </style>\n</head>\n<body>\n  <div class="app-card">\n    <div class="badge">COREZ APP</div>\n    <h1>${appTitle}</h1>\n    ${appBody}\n  </div>\n</body>\n</html>\n\`\`\``;
  }

  // 4. GENERAL QUESTION & CONCEPT EXPLANATION INTENT
  return `Regarding **"${cleanPrompt}"**:\n\nWhen exploring this topic, key principles include maintaining clarity, structure, and minimal complexity. \n\nIf you'd like me to build a live interactive demonstration, widget, or simulation for this concept, simply let me know what kind of application you'd like to see!`;
}
