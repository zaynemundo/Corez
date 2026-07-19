import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function apiDevPlugin() {
  const models = [
    'deepseek/deepseek-chat',
    'deepseek/deepseek-r1',
    'meta-llama/llama-3.3-70b-instruct'
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

              const systemPrompt = `You are COREZ AI.
Guidelines:
- If the user asks for ANY game, application, landing page, dashboard, tool, simulator, widget, website, or prototype, generate a complete, rich, unique, runnable HTML document with embedded CSS and JavaScript inside a single \`\`\`html ... \`\`\` code block.
- Always write complete, production-ready, working code tailored specifically to the prompt topic. Never output generic fallback code.
Inferred intent: ${intent?.type || 'app'} - ${intent?.summary || 'Create a public-facing interactive experience'}`;

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
                      messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                      ]
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
