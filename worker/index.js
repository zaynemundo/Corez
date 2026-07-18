const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
const DEFAULT_OPENROUTER_REASONING_EFFORT = 'xhigh';
const ALLOWED_REASONING_EFFORTS = new Set([
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh'
]);

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

function getReasoningEffort(env) {
  const effort = (
    env.OPENROUTER_REASONING_EFFORT || DEFAULT_OPENROUTER_REASONING_EFFORT
  ).trim().toLowerCase();
  return ALLOWED_REASONING_EFFORTS.has(effort)
    ? effort
    : DEFAULT_OPENROUTER_REASONING_EFFORT;
}

function buildSystemPrompt(intent) {
  const intentSummary = intent?.summary
    || 'Understand the public user goal and give a useful next step.';
  const intentType = intent?.type || 'general';

  return `You are Corez AI inside a public web app.

Your job is to understand what the public user is trying to do and answer with more detail than a short chatbot reply.

Response style:
- Be detailed, structured, and practical.
- Start with the direct answer.
- Add useful context, steps, examples, or tradeoffs when they help.
- For plans, include concrete ordered steps and likely risks.
- For explanations, define the idea plainly, then show a small example.
- For writing tasks, provide a usable draft and explain the tone or structure briefly.
- For code help, identify the likely cause, show a corrected snippet when possible, and mention how to verify it.
- Avoid vague filler.
- If the user asks to build a website, landing page, dashboard, app, game, widget, or tool, return one complete runnable HTML document inside a fenced html code block.
- Keep generated apps minimalist, monochrome, responsive, and self-contained.

Inferred intent: ${intentType} - ${intentSummary}`;
}

async function handleOpenRouter(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  if (!env.OPENROUTER_API_KEY) {
    return jsonResponse(503, { error: 'OpenRouter is not configured.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' });
  }

  const intent = body.intent && typeof body.intent === 'object'
    ? body.intent
    : null;
  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim()
    : env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;

  try {
    const upstream = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Corez'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(intent) },
          { role: 'user', content: prompt }
        ],
        reasoning_effort: getReasoningEffort(env),
        temperature: 0.72,
        max_tokens: intent?.type === 'app' ? 3200 : 1800
      })
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      return jsonResponse(502, {
        error: 'OpenRouter request failed.',
        status: upstream.status,
        detail
      });
    }

    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return jsonResponse(502, { error: 'OpenRouter returned an empty response.' });
    }

    return jsonResponse(200, { content, model });
  } catch {
    return jsonResponse(500, { error: 'Unable to generate AI response.' });
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/openrouter') {
      return handleOpenRouter(request, env);
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return env.ASSETS.fetch(request);
  }
};
