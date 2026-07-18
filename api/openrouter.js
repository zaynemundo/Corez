const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
const DEFAULT_OPENROUTER_REASONING_EFFORT = 'xhigh';
const ALLOWED_REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

function getReasoningEffort() {
  const effort = (process.env.OPENROUTER_REASONING_EFFORT || DEFAULT_OPENROUTER_REASONING_EFFORT)
    .trim()
    .toLowerCase();

  return ALLOWED_REASONING_EFFORTS.has(effort) ? effort : DEFAULT_OPENROUTER_REASONING_EFFORT;
}

function buildSystemPrompt(intent) {
  const intentSummary = intent?.summary || 'Understand the public user goal and give a useful next step.';
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

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: 'OpenRouter is not configured.' });
    return;
  }

  try {
    const body = typeof request.body === 'string'
      ? JSON.parse(request.body || '{}')
      : request.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const intent = body.intent && typeof body.intent === 'object' ? body.intent : null;
    const model = typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
    const reasoningEffort = getReasoningEffort();

    if (!prompt) {
      sendJson(response, 400, { error: 'Prompt is required.' });
      return;
    }

    const openRouterResponse = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Corez'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(intent) },
          { role: 'user', content: prompt }
        ],
        reasoning_effort: reasoningEffort,
        temperature: 0.72,
        max_tokens: intent?.type === 'app' ? 3200 : 1800
      })
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      sendJson(response, 502, {
        error: 'OpenRouter request failed.',
        status: openRouterResponse.status,
        detail: errorText.slice(0, 500)
      });
      return;
    }

    const data = await openRouterResponse.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      sendJson(response, 502, { error: 'OpenRouter returned an empty response.' });
      return;
    }

    sendJson(response, 200, { content, model });
  } catch (error) {
    sendJson(response, 500, {
      error: 'Unable to generate AI response.',
      detail: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
