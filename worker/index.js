const WORKERS_AI_MODEL = '@cf/zai-org/glm-5.2';

function jsonResponse(status, body) {
  return Response.json(body, { status });
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

async function handleAi(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }
  if (!env.AI || typeof env.AI.run !== 'function') {
    return jsonResponse(503, { error: 'Workers AI is not configured.' });
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

  const intent = body.intent
    && typeof body.intent === 'object'
    && !Array.isArray(body.intent)
    ? body.intent
    : null;

  try {
    const result = await env.AI.run(WORKERS_AI_MODEL, {
      messages: [
        { role: 'system', content: buildSystemPrompt(intent) },
        { role: 'user', content: prompt }
      ],
      reasoning_effort: 'high',
      temperature: 0.72,
      max_completion_tokens: intent?.type === 'app' ? 3200 : 1800
    });

    const content = result?.choices?.[0]?.message?.content;
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) {
      return jsonResponse(502, { error: 'Workers AI returned an empty response.' });
    }

    return jsonResponse(200, {
      content: normalizedContent,
      model: WORKERS_AI_MODEL
    });
  } catch {
    return jsonResponse(502, { error: 'Unable to generate AI response.' });
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/ai') {
      return handleAi(request, env);
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return env.ASSETS.fetch(request);
  }
};
