// Corez AI Service Engine - Versatile General Intelligence Engine

export const MODEL = {
  id: 'corez',
  name: 'Corez AI',
  description: 'Versatile minimalist AI assistant for reasoning, writing, problem-solving, and interactive execution.'
};

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

// Intelligent General Response Generator
export async function generateAIResponse(prompt) {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();

  // Natural thinking latency (0.8s to 1.3s)
  await new Promise(r => setTimeout(r, 1000));

  // 1. GREETING & GENERAL IDENTITY INTENT
  if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening|howdy|sup)(\s|\!|\.|\?|$)/i.test(lower)) {
    return `Hello! How can I help you today? I'm ready to assist you with reasoning, writing, code analysis, creative work, or answering any question you have.`;
  }

  if (lower.includes('who are you') || lower.includes('what can you do')) {
    return `I am **Corez**, a versatile AI assistant designed for clean conversation, analysis, writing, and problem-solving.\n\nI can help you with a wide range of tasks, including:\n- **Writing & Editing**: Essays, emails, creative writing, and documentation.\n- **Programming & Debugging**: Code explanations, bug fixes, algorithm design, and syntax examples.\n- **Analysis & Reasoning**: Mathematics, logic, science, philosophy, and strategy.\n- **Interactive Tools**: Building web apps, widgets, or visual tools when requested.\n\nWhat would you like to explore or work on?`;
  }

  // 2. GRATITUDE INTENT
  if (/^(thanks|thank you|awesome|great|cool|nice|perfect)(\s|\!|\.|$)/i.test(lower)) {
    return `You're very welcome! Let me know if there's anything else I can help you with.`;
  }

  // 3. EXPLICIT APPLICATION / GAME / WIDGET CREATION INTENT
  const isAppRequest = lower.includes('build an app') || lower.includes('create a game') || lower.includes('make a dashboard') || lower.includes('build a widget') || lower.includes('build a calculator') || lower.includes('build a timer') || lower.includes('build a tool') || lower.includes('create a tool') || lower.includes('generate html');

  if (isAppRequest) {
    let appTitle = "Custom Web Tool";
    let appBody = "";

    if (lower.includes('timer') || lower.includes('stopwatch')) {
      appTitle = "Digital Stopwatch & Timer";
      appBody = `
        <div class="counter" id="timer">00:00.0</div>
        <div style="display:flex; gap:0.5rem; justify-content:center; margin-top:1rem;">
          <button class="action-btn" id="startBtn">Start</button>
          <button class="action-btn" style="background:#222; color:#fff;" id="resetBtn">Reset</button>
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
      appTitle = "Particle Physics Sandbox";
      appBody = `
        <p style="font-size:0.8rem; color:#888;">Move cursor to attract particles.</p>
        <canvas id="c" style="width:100%; height:200px; background:#050505; border:1px solid #222; border-radius:6px; margin-top:0.75rem;"></canvas>
        <script>
          const canvas = document.getElementById('c');
          const ctx = canvas.getContext('2d');
          canvas.width = canvas.offsetWidth; canvas.height = 200;
          let particles = Array.from({length: 120}, () => ({
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
      appTitle = "Interactive Web Tool";
      appBody = `
        <p style="font-size:0.8rem; color:#888;">Custom interactive widget constructed for your request.</p>
        <div class="counter" id="val">0</div>
        <button class="action-btn" id="actBtn">Execute Action</button>
        <script>
          let v = 0;
          document.getElementById('actBtn').addEventListener('click', () => {
            v += 1; document.getElementById('val').textContent = v;
          });
        </script>`;
    }

    return `I have constructed the application for **${appTitle}**.\n\n\`\`\`html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${appTitle}</title>\n  <style>\n    :root { --bg: #000; --card: #0d0d0d; --text: #fff; --muted: #888; --border: rgba(255,255,255,0.15); }\n    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }\n    body { background: var(--bg); color: var(--text); padding: 1.5rem; display: flex; align-items: center; justify-content: center; min-height: 100vh; }\n    .app-card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem; width: 100%; max-width: 460px; text-align: center; }\n    .badge { background: #fff; color: #000; padding: 3px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 0.75rem; }\n    h1 { font-size: 1.25rem; font-weight: 900; margin-bottom: 0.4rem; letter-spacing: -0.03em; text-transform: uppercase; }\n    .action-btn { background: #fff; color: #000; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; transition: background 0.2s; }\n    .action-btn:hover { background: #ccc; }\n    .counter { font-size: 2.2rem; font-weight: 900; margin: 0.75rem 0; color: #fff; }\n  </style>\n</head>\n<body>\n  <div class="app-card">\n    <div class="badge">COREZ APP</div>\n    <h1>${appTitle}</h1>\n    ${appBody}\n  </div>\n</body>\n</html>\n\`\`\``;
  }

  // 4. GENERAL INTELLECTUAL CONVERSATION & PROBLEM SOLVING
  // Tailored responses for common topics
  if (lower.includes('code') || lower.includes('python') || lower.includes('javascript') || lower.includes('react') || lower.includes('css') || lower.includes('html')) {
    return `When writing clean, maintainable code, it's best to follow core principles such as **separation of concerns**, **single responsibility**, and **predictable state management**.\n\nIf you have a specific code snippet you'd like me to review, refactor, or debug, paste it here!`;
  }

  if (lower.includes('explain') || lower.includes('what is') || lower.includes('how does')) {
    return `That's an interesting topic! \n\nWhen analyzing **"${cleanPrompt}"**, it helps to look at the foundational concepts first, understand how the key components interact, and evaluate practical real-world applications.\n\nLet me know if you'd like a deep dive into any particular aspect of this topic!`;
  }

  // Fallback for any general open-ended conversation
  return `That's a thoughtful question regarding **"${cleanPrompt}"**.\n\nTo approach this effectively, we should focus on clarity, core fundamentals, and practical outcomes.\n\nHow would you like to proceed with this?`;
}
