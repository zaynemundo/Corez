// Corez AI Service Engine - Handles Streaming, API calls & Canvas Code Extraction

export const MODELS = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT-4o',
    provider: 'OpenAI',
    badgeClass: 'chatgpt',
    color: '#ffffff',
    description: 'Versatile reasoning & high-precision monochrome code generation.'
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini 2.0 Flash',
    provider: 'Google AI',
    badgeClass: 'gemini',
    color: '#e4e4e7',
    description: 'Ultra-fast multimodal model with expansive context.'
  },
  claude: {
    id: 'claude',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    badgeClass: 'claude',
    color: '#a1a1aa',
    description: 'Nuanced writing, complex logic & clean architecture.'
  }
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

// Simulated AI response streamer with realistic delay & dynamic monochrome app creation
export async function streamAIResponse(prompt, modelId, onChunk, options = {}) {
  const model = MODELS[modelId] || MODELS.chatgpt;
  const lowerPrompt = prompt.toLowerCase();
  
  let responseText = "";

  const isAppRequest = lowerPrompt.includes('build') || lowerPrompt.includes('create') || lowerPrompt.includes('app') || lowerPrompt.includes('widget') || lowerPrompt.includes('game') || lowerPrompt.includes('tool') || lowerPrompt.includes('calculator') || lowerPrompt.includes('dashboard') || lowerPrompt.includes('html');

  if (isAppRequest) {
    responseText = `Here is your custom monochrome application built for **Corez**. You can run it live right now in the **Live Canvas Sandbox** on the right!

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Corez Custom Tool</title>
  <style>
    :root {
      --bg: #000000;
      --card: #0d0d0d;
      --accent: #ffffff;
      --text: #ffffff;
      --muted: #888888;
      --border: rgba(255,255,255,0.15);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .app-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 2rem; width: 100%; max-width: 480px; text-align: center; }
    .badge { background: #ffffff; color: #000000; padding: 4px 12px; border-radius: 99px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 900; margin-bottom: 0.5rem; letter-spacing: -0.03em; }
    p { color: var(--muted); font-size: 0.875rem; margin-bottom: 1.5rem; line-height: 1.5; }
    .action-btn { background: #ffffff; color: #000000; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 800; font-size: 0.9rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.2s; }
    .action-btn:hover { background: #cccccc; }
    .counter { font-size: 2.8rem; font-weight: 900; margin: 1rem 0; color: #ffffff; letter-spacing: -0.04em; }
  </style>
</head>
<body>
  <div class="app-card">
    <div class="badge">COREZ // ${model.name}</div>
    <h1>Monochrome Interactive Tool</h1>
    <p>Target: "${prompt.slice(0, 45)}..."</p>
    <div class="counter" id="count">0</div>
    <button class="action-btn" id="btn">Trigger Action</button>
  </div>

  <script>
    let c = 0;
    const btn = document.getElementById('btn');
    const count = document.getElementById('count');
    btn.addEventListener('click', () => {
      c++;
      count.textContent = c;
    });
  </script>
</body>
</html>
\`\`\`

Click **"Run in Canvas"** to test and interact with the application!`;
  } else {
    responseText = `As **${model.name}** running inside **Corez**, I am ready to assist you.

Regarding **"${prompt}"**:

1. **Architecture & Logic**: Keeping user interfaces minimalist and state predictable ensures bulletproof performance.
2. **Interactive Code Sandbox**: To generate a live application, widget, or visualization, simply tell me what tool or app you'd like to build!

Let me know what you would like to construct next.`;
  }

  const chunks = responseText.split(/(?<=\s)/);
  let accumulated = "";

  for (let i = 0; i < chunks.length; i++) {
    accumulated += chunks[i];
    onChunk(accumulated);
    await new Promise(r => setTimeout(r, 20));
  }

  return accumulated;
}
