import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function apiDevPlugin() {
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

              const systemPrompt = `You are COREZ AI.
Guidelines:
- If the user asks for ANY game, application, landing page, dashboard, tool, simulator, widget, or prototype, generate a complete, rich, runnable HTML document with embedded CSS and JavaScript inside a single \`\`\`html ... \`\`\` code block.
- Always write complete, production-ready, working code.
Inferred intent: ${intent?.type || 'app'} - ${intent?.summary || 'Create a public-facing interactive experience'}`;

              const openRouterResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openRouterKey}`,
                  'HTTP-Referer': 'https://corez.ai',
                  'X-Title': 'COREZ AI',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: 'deepseek/deepseek-v4-pro',
                  messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                  ]
                })
              });

              if (!openRouterResp.ok) {
                const errText = await openRouterResp.text();
                res.statusCode = openRouterResp.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `OpenRouter error: ${errText}` }));
                return;
              }

              const data = await openRouterResp.json();
              const content = data?.choices?.[0]?.message?.content || '';

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ content: content.trim(), model: 'deepseek/deepseek-v4-pro' }));
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
