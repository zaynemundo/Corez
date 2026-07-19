const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-pro';
const WORKERS_AI_MODEL = '@cf/moonshotai/kimi-k2.7-code';
const DEEPSEEK_MODEL = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';
const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const SDXL_LIGHTNING_MODEL = '@cf/bytedance/stable-diffusion-xl-lightning';

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

function safeErrorDetail(error) {
  const raw = error instanceof Error
    ? error.message
    : typeof error?.message === 'string'
      ? error.message
      : String(error);

  return raw
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(api[_-]?key|token|secret|password)\b(\s*[:=]\s*)([^\s&,;]+)/gi, '$1$2[REDACTED]')
    .slice(0, 500);
}

function buildSystemPrompt(intent) {
  const intentSummary = intent?.summary
    || 'Understand the public user goal and give a useful next step.';
  const intentType = intent?.type || 'general';

  return `You are COREZ AI, powered by Kimi 2.7 Code.

You possess 4 core AI engineering skills:

1. GAME DEVELOPMENT SKILL:
   - Build complete, playable 2D/3D web games with real-time game loops, physics/controls (keyboard/mouse/touch), collision detection, score tracking, state management (start, pause, game over), visual feedback, and restart controls.

2. CODE REVIEW & TESTING SKILL:
   - Pair every code review with testing. Evaluate correctness, boundary edge cases, input validation, runtime performance, error recovery, and unit test coverage. Never declare success without verification.

3. MODERN FRONT-END DESIGN SKILL:
   - Create modern, state-of-the-art web designs (dark theme, glassmorphism, fluid responsive layouts, crisp unified typography, micro-interactions). Avoid generic browser default styling.

4. BACK-END ARCHITECTURE & DESIGN HIERARCHY SKILL:
   - Enforce strict back-end design hierarchy:
     - Level 1: SECURITY (highest priority) - Input sanitization, rate limiting, authentication/authorization, secret safety, zero exposure.
     - Level 2: FUNCTIONALITY - Reliable API contracts, data validation, clean modular design, error recovery, and high availability.

Guidelines for Output:
- If the user asks for ANY game, application, landing page, dashboard, tool, simulator, widget, or prototype, generate a complete, rich, runnable HTML document with embedded CSS and JavaScript inside a single \`\`\`html ... \`\`\` code block.
- Always write complete, production-ready, working code.

Inferred intent: ${intentType} - ${intentSummary}`;
}

async function handleAi(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
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

  // 1. Try OpenRouter API if OPENROUTER_API_KEY is configured
  const openRouterKey = env?.OPENROUTER_API_KEY || (typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : null);
  if (openRouterKey) {
    try {
      const openRouterResp = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'https://corez.ai',
          'X-Title': 'COREZ AI',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: DEFAULT_OPENROUTER_MODEL,
          reasoning_effort: 'xhigh',
          reasoning: { effort: 'high' },
          messages: [
            { role: 'system', content: buildSystemPrompt(intent) },
            { role: 'user', content: prompt }
          ]
        })
      });

      if (openRouterResp.ok) {
        const data = await openRouterResp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content && typeof content === 'string' && content.trim()) {
          return jsonResponse(200, { content: content.trim(), model: DEFAULT_OPENROUTER_MODEL });
        }
      }
    } catch (orErr) {
      console.warn('OpenRouter request failed, falling back to Cloudflare Workers AI:', safeErrorDetail(orErr));
    }
  }

  // 2. Cloudflare Workers AI Fallback
  if (!env.AI || typeof env.AI.run !== 'function') {
    return jsonResponse(503, { error: 'Workers AI is not configured.' });
  }

  try {
    let result;
    let usedModel = WORKERS_AI_MODEL;

    try {
      result = await env.AI.run(WORKERS_AI_MODEL, {
        messages: [
          { role: 'system', content: buildSystemPrompt(intent) },
          { role: 'user', content: prompt }
        ]
      });
    } catch (primaryError) {
      console.warn('Primary Workers AI model failed, attempting DeepSeek fallback:', safeErrorDetail(primaryError));
      usedModel = DEEPSEEK_MODEL;
      result = await env.AI.run(DEEPSEEK_MODEL, {
        messages: [
          { role: 'system', content: buildSystemPrompt(intent) },
          { role: 'user', content: prompt }
        ]
      });
    }

    const content = result?.choices?.[0]?.message?.content;
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) {
      return jsonResponse(502, { error: 'Workers AI returned an empty response.' });
    }

    return jsonResponse(200, {
      content: normalizedContent,
      model: usedModel
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Workers AI generation failed',
      error: safeErrorDetail(error)
    }));
    return jsonResponse(502, { error: 'Unable to generate AI response.' });
  }
}

async function handleImage(request, env) {
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

  try {
    let result;
    let usedModel = FLUX_MODEL;

    try {
      result = await env.AI.run(FLUX_MODEL, {
        prompt: prompt,
        num_steps: 4
      });
    } catch (fluxErr) {
      console.warn('FLUX model failed, attempting SDXL Lightning fallback:', safeErrorDetail(fluxErr));
      usedModel = SDXL_LIGHTNING_MODEL;
      result = await env.AI.run(SDXL_LIGHTNING_MODEL, {
        prompt: prompt
      });
    }

    if (!result) {
      return jsonResponse(502, { error: 'Workers AI returned empty image data.' });
    }

    // Handle object with base64 property
    if (typeof result === 'object' && result !== null && typeof result.image === 'string') {
      const b64 = result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
      return jsonResponse(200, { image: b64, model: usedModel });
    }

    // Handle ArrayBuffer, View, Response, or Stream
    let arrayBuffer;
    if (result instanceof ArrayBuffer) {
      arrayBuffer = result;
    } else if (ArrayBuffer.isView(result)) {
      arrayBuffer = result.buffer;
    } else if (typeof result?.arrayBuffer === 'function') {
      arrayBuffer = await result.arrayBuffer();
    } else if (typeof Response !== 'undefined' && (result instanceof Response || typeof result?.getReader === 'function')) {
      arrayBuffer = await new Response(result).arrayBuffer();
    } else {
      const str = String(result);
      if (str.startsWith('data:image')) {
        return jsonResponse(200, { image: str, model: usedModel });
      }
      return jsonResponse(502, { error: 'Unexpected Workers AI image format.' });
    }

    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);

    return jsonResponse(200, {
      image: `data:image/png;base64,${base64}`,
      model: usedModel
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: 'Image generation failed',
      error: safeErrorDetail(error)
    }));
    return jsonResponse(502, { error: `Unable to generate image: ${safeErrorDetail(error)}` });
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/ai') {
      return handleAi(request, env);
    }
    if (pathname === '/api/image') {
      return handleImage(request, env);
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return env.ASSETS.fetch(request);
  }
};
