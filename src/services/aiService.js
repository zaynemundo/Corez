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
  app: /\b(build|make|create|generate|design|launch|prototype|develop|ship)\b.*\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator|preview|html)\b|\b(app|tool|website|site|landing page|dashboard|portal|widget|calculator|timer|game|simulator)\b.*\b(build|make|create|generate|design|launch|prototype|develop|ship)\b/i,
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
    return `Hello! I'm **COREZ**, a minimalist AI assistant built for public users.\n\nI can help you understand ideas, write clearer content, debug code, analyze documents, plan products, or generate live monochrome web apps that open in the preview canvas. Tell me what you want to make or understand, and I’ll infer the goal, explain the useful context, and give you a practical next step.`;
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
    let appTitle;
    let appBody;

    if (lower.includes('timer') || lower.includes('stopwatch')) {
      appTitle = "Stopwatch & Timer";
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
            running = !running; startBtn.textContent = running ? 'Pause' : 'Start';
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
      appTitle = "Particle Simulator";
      appBody = `
        <canvas id="c" style="width:100%; height:200px; background:#050505; border:1px solid #222; border-radius:6px; margin-top:0.5rem;"></canvas>
        <script>
          const canvas = document.getElementById('c'); const ctx = canvas.getContext('2d');
          canvas.width = canvas.offsetWidth; canvas.height = 200;
          let particles = Array.from({length: 120}, () => ({
            x: Math.random()*canvas.width, y: Math.random()*canvas.height,
            vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2
          }));
          let m = {x: canvas.width/2, y: canvas.height/2};
          canvas.addEventListener('mousemove', e => {
            const r = canvas.getBoundingClientRect(); m.x = e.clientX - r.left; m.y = e.clientY - r.top;
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
      appTitle = "Custom Tool";
      appBody = `
        <div class="counter" id="val">0</div>
        <button class="action-btn" id="actBtn">Execute</button>
        <script>
          let v = 0;
          document.getElementById('actBtn').addEventListener('click', () => {
            v += 1; document.getElementById('val').textContent = v;
          });
        </script>`;
    }

    return `I've built that for you. Click below to open it on the right side.\n\n\`\`\`html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${appTitle}</title>\n  <style>\n    :root { --bg: #000; --card: #0d0d0d; --text: #fff; --border: rgba(255,255,255,0.15); }\n    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }\n    body { background: var(--bg); color: var(--text); padding: 1.5rem; display: flex; align-items: center; justify-content: center; min-height: 100vh; }\n    .app-card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1.5rem; width: 100%; max-width: 440px; text-align: center; }\n    h1 { font-size: 1.2rem; font-weight: 800; margin-bottom: 0.5rem; text-transform: uppercase; }\n    .action-btn { background: #fff; color: #000; border: none; padding: 0.5rem 1rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; }\n    .action-btn:hover { background: #ccc; }\n    .counter { font-size: 2rem; font-weight: 900; margin: 0.75rem 0; color: #fff; }\n  </style>\n</head>\n<body>\n  <div class="app-card">\n    <h1>${appTitle}</h1>\n    ${appBody}\n  </div>\n</body>\n</html>\n\`\`\``;
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
