import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function apiDevPlugin() {
  const models = [
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-chat',
    'deepseek/deepseek-r1'
  ];

  return {
    name: 'api-dev-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/ai' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const env = loadEnv(server.config.mode, process.cwd(), '');
              const openRouterKey = env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

              if (!openRouterKey) {
                res.statusCode = 503;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'OPENROUTER_API_KEY is not set in environment or .env file.' }));
                return;
              }

              const parsed = JSON.parse(body || '{}');
              const prompt = parsed.prompt || '';
              const intent = parsed.intent || null;
              const history = Array.isArray(parsed.messages) ? parsed.messages : [];

              const systemPrompt = `You are COREZ AI.

Identity & Persona:
- Your name is COREZ AI.
- NEVER mention what underlying AI model, provider, vendor, or engine powers you (do NOT mention DeepSeek, Kimi, OpenAI, Anthropic, Gemini, FLUX, Cloudflare, OpenRouter, etc.).
- When greeted with simple phrases like "hi", "hello", "hey", or "who are you", respond simply and directly: "Hello! I'm COREZ AI. How can I help you today?"
- Never list bullet points, technical skills, or specializations when giving greetings or introductions unless explicitly requested.

Guidelines for Output:
- When writing code or building apps, components, tools, dashboards, widgets, or games, write clean, modern React/JSX components (using \`\`\`jsx ... \`\`\` code blocks) starting with "export default function App()". DO NOT wrap React code inside HTML boilerplate (<!DOCTYPE html>, <head>, <script type="text/babel">, or ReactDOM.createRoot()) because the preview canvas compiles and renders React/JSX code automatically!
- Always write complete, production-ready, working code tailored specifically to the prompt topic. Never output generic fallback code.
Inferred intent: ${intent?.type || 'app'} - ${intent?.summary || 'Create a public-facing interactive experience'}`;

              const apiMessages = [
                { role: 'system', content: systemPrompt }
              ];
              for (const m of history) {
                if (m.role && m.content && typeof m.content === 'string') {
                  apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
                }
              }
              if (!apiMessages.some(m => m.role === 'user' && m.content === prompt)) {
                apiMessages.push({ role: 'user', content: prompt });
              }

              let lastError = null;
              for (const modelId of models) {
                try {
                  const openRouterResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${openRouterKey}`,
                      'HTTP-Referer': 'https://corez.ai',
                      'X-Title': 'COREZ AI',
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      model: modelId,
                      reasoning: { effort: 'high' },
                      messages: apiMessages
                    })
                  });

                  if (openRouterResp.ok) {
                    const data = await openRouterResp.json();
                    const content = data?.choices?.[0]?.message?.content || '';
                    if (content.trim()) {
                      res.statusCode = 200;
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ content: content.trim(), model: modelId }));
                      return;
                    }
                  } else {
                    lastError = await openRouterResp.text();
                  }
                } catch (e) {
                  lastError = e.message;
                }
              }

              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `OpenRouter error: ${lastError}` }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else if (req.url === '/api/image' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const env = loadEnv(server.config.mode, process.cwd(), '');
              const openRouterKey = env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

              if (!openRouterKey) {
                res.statusCode = 503;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'OPENROUTER_API_KEY is not set in environment or .env file.' }));
                return;
              }

              const parsed = JSON.parse(body || '{}');
              const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
              if (!prompt) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Prompt is required.' }));
                return;
              }

              const imageResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openRouterKey}`,
                  'HTTP-Referer': 'https://corez.ai',
                  'X-Title': 'COREZ AI',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: 'black-forest-labs/flux-1-schnell',
                  messages: [{ role: 'user', content: prompt }]
                })
              });

              if (!imageResp.ok) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `OpenRouter image error: ${imageResp.status}` }));
                return;
              }

              const data = await imageResp.json();
              const message = data?.choices?.[0]?.message;
              let image = null;
              if (Array.isArray(message?.images) && message.images[0]?.url) {
                image = message.images[0].url;
              } else if (typeof message?.content === 'string' && message.content) {
                const urlMatch = message.content.match(/https?:\/\/[^\s)"']+\.(?:png|jpg|jpeg|webp)/i)
                  || message.content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
                if (urlMatch) image = urlMatch[1] || urlMatch[0];
                if (!image && message.content.startsWith('data:image')) image = message.content;
              }

              if (!image) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'OpenRouter image generation returned no usable image.' }));
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ image, model: 'black-forest-labs/flux-1-schnell' }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  server: {
    port: 3000,
    host: true
  }
})
