// Corez AI Service Engine - Direct Response Generator

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

// Generate complete AI response with simulated thinking delay (no text streaming)
export async function generateAIResponse(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  
  // Simulated thinking delay (1.2 seconds)
  await new Promise(r => setTimeout(r, 1200));

  const isAppRequest = lowerPrompt.includes('build') || lowerPrompt.includes('create') || lowerPrompt.includes('app') || lowerPrompt.includes('widget') || lowerPrompt.includes('game') || lowerPrompt.includes('tool') || lowerPrompt.includes('calculator') || lowerPrompt.includes('dashboard') || lowerPrompt.includes('html');

  if (isAppRequest) {
    return `I have generated your monochrome application for **Corez**.\n\n\`\`\`html\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Corez Custom Tool</title>\n  <style>\n    :root {\n      --bg: #000000;\n      --card: #0d0d0d;\n      --accent: #ffffff;\n      --text: #ffffff;\n      --muted: #888888;\n      --border: rgba(255,255,255,0.15);\n    }\n    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }\n    body { background: var(--bg); color: var(--text); padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }\n    .app-card { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 2rem; width: 100%; max-width: 480px; text-align: center; }\n    .badge { background: #ffffff; color: #000000; padding: 3px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 1rem; }\n    h1 { font-size: 1.3rem; font-weight: 900; margin-bottom: 0.5rem; letter-spacing: -0.03em; text-transform: uppercase; }\n    p { color: var(--muted); font-size: 0.825rem; margin-bottom: 1.5rem; line-height: 1.5; }\n    .action-btn { background: #ffffff; color: #000000; border: none; padding: 0.65rem 1.25rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.2s; }\n    .action-btn:hover { background: #cccccc; }\n    .counter { font-size: 2.5rem; font-weight: 900; margin: 0.85rem 0; color: #ffffff; letter-spacing: -0.04em; }\n  </style>\n</head>\n<body>\n  <div class="app-card">\n    <div class="badge">COREZ AI</div>\n    <h1>Monochrome Custom App</h1>\n    <p>Target: "${prompt.slice(0, 45)}..."</p>\n    <div class="counter" id="count">0</div>\n    <button class="action-btn" id="btn">Trigger Action</button>\n  </div>\n\n  <script>\n    let c = 0;\n    const btn = document.getElementById('btn');\n    const count = document.getElementById('count');\n    btn.addEventListener('click', () => {\n      c++;\n      count.textContent = c;\n    });\n  </script>\n</body>\n</html>\n\`\`\``;
  }

  return `Welcome to **Corez**.\n\nRegarding **"${prompt}"**:\n\n1. **Architecture & Logic**: Keeping user interfaces minimalist and state predictable ensures bulletproof performance.\n2. **Interactive Code Sandbox**: To generate a live application, widget, or visualization, simply describe what tool or app you'd like to build!`;
}
