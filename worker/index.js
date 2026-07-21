const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
function getTargetModels(intentType, hasMedia) {
  if (hasMedia) {
    return ['xiaomi/mimo-v2.5'];
  }
  return ['deepseek/deepseek-v4-flash'];
}
const WORKERS_AI_MODEL = '@cf/moonshotai/kimi-k2.7-code';
const DEEPSEEK_MODEL = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';
const FLUX_PRIMARY_MODEL = '@cf/black-forest-labs/flux-1-dev';
const FLUX_FALLBACK_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const CANONICAL_INTENT_TYPES = new Set([
  'app',
  'code-help',
  'writing',
  'explanation',
  'general',
  'swarm'
]);

function normalizeIntentType(intentType) {
  return CANONICAL_INTENT_TYPES.has(intentType) ? intentType : 'general';
}

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
  const intentType = normalizeIntentType(intent?.type);

  let adaptiveInstructions = '';
  if (intentType === 'code-help') {
    adaptiveInstructions = `
Adaptive Routing - Coding Path:
- Inspect relevant architecture and naming conventions before providing code.
- Do NOT hallucinate file paths or modify unrelated files.
- Always include: exact files changed, a reasoning summary, and clear test instructions.
- Ensure the code is practical, direct, and ready for production.`;
  } else if (intentType === 'swarm') {
    adaptiveInstructions = `
Adaptive Routing - Complex Path:
- Use step-by-step reasoning and careful planning.
- Consider multiple agents/skills and orchestration strategies if necessary.
- Provide a robust architectural overview before diving into specific code.`;
  } else if (intentType === 'app') {
    adaptiveInstructions = `
Adaptive Routing - App Creation Path:
- Build a complete, rich, runnable experience rather than a partial scaffold.
- Keep the implementation self-contained and ready for the preview canvas.
- Prioritise usability, responsive behaviour, and clear interaction states.`;
  } else if (intentType === 'writing') {
    adaptiveInstructions = `
Adaptive Routing - Writing Path:
- Deliver polished copy in the requested format and tone.
- Match the audience and purpose without adding unnecessary technical commentary.
- Keep the result immediately reusable.`;
  } else if (intentType === 'explanation') {
    adaptiveInstructions = `
Adaptive Routing - Explanation Path:
- Explain the subject directly in plain language.
- Use a practical example when it improves understanding.
- End with the most useful next step rather than unnecessary follow-up questions.`;
  } else {
    adaptiveInstructions = `
Adaptive Routing - Fast Path:
- Do not over-plan or ask unnecessary clarification questions.
- Answer directly and immediately with practical information or calculations.
- Make safe assumptions and proceed.`;
  }

  return `You are COREZ AI.

Identity & Persona:
- Your name is COREZ AI.
- NEVER mention what underlying AI model, provider, vendor, or engine powers you (do NOT mention DeepSeek, Kimi, OpenAI, Anthropic, Gemini, FLUX, Cloudflare, OpenRouter, etc.).
- When greeted with simple phrases like "hi", "hello", "hey", or "who are you", respond simply and directly: "Hello! I'm COREZ AI. How can I help you today?"
- Never list bullet points, technical skills, or specializations when giving greetings or introductions unless explicitly requested.

Guidelines for Output:
- If the user asks for ANY game, application, landing page, dashboard, tool, simulator, widget, website, prototype, or an ENEMY BOT, generate a complete, rich, runnable HTML document with embedded CSS and JavaScript inside a single \`\`\`html ... \`\`\` code block.
- You MUST start your response with a concise summary or brief explaining what you are building and how it works, BEFORE generating the code block.
- Always write complete, production-ready, working code.
- If the user asks to generate, create, or modify an image, you MUST output ONLY a tag in the exact format [IMAGE_PROMPT: <full detailed prompt for image generation>] and nothing else. For modifications, incorporate the previous image's context into the new detailed description to ensure the subject stays the same (e.g., if they say "make it green", rewrite the original image prompt replacing the color but keeping everything else identical).
${adaptiveInstructions}

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

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const apiMessages = [
    { role: 'system', content: buildSystemPrompt(intent) }
  ];

  let hasAppendedPrompt = false;
  let hasMedia = false;
  for (const m of messages) {
    if (m.role && m.content) {
      if (Array.isArray(m.content)) {
        for (const item of m.content) {
          if (item.type === 'image_url' || item.type === 'audio_url' || item.type === 'video_url') {
            hasMedia = true;
          }
        }
      }
      apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      if (typeof m.content === 'string' && m.content === prompt && m.role === 'user') {
        hasAppendedPrompt = true;
      }
    }
  }
  
  if (!hasAppendedPrompt) {
    apiMessages.push({ role: 'user', content: prompt });
  }

  // 1. Try OpenRouter API if OPENROUTER_API_KEY is configured
  const targetModels = getTargetModels(intent?.type || 'general', hasMedia);
  const openRouterKey = env?.OPENROUTER_API_KEY || (typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : null);
  if (openRouterKey) {
    for (const modelId of targetModels) {
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
            model: modelId,
            reasoning: { effort: 'high' },
            messages: apiMessages
          })
        });

        if (openRouterResp.ok) {
          const data = await openRouterResp.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content && typeof content === 'string' && content.trim()) {
            return jsonResponse(200, { content: content.trim(), model: modelId });
          }
        }
      } catch (orErr) {
        console.warn(`OpenRouter model ${modelId} request failed:`, safeErrorDetail(orErr));
      }
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
        messages: apiMessages
      });
    } catch (primaryError) {
      console.warn('Primary Workers AI model failed, attempting DeepSeek fallback:', safeErrorDetail(primaryError));
      usedModel = DEEPSEEK_MODEL;
      result = await env.AI.run(DEEPSEEK_MODEL, {
        messages: apiMessages
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
    let usedModel = FLUX_PRIMARY_MODEL;

    try {
      result = await env.AI.run(FLUX_PRIMARY_MODEL, {
        prompt: prompt
      });
    } catch (mainErr) {
      console.warn('Primary FLUX model failed, attempting fallback FLUX model:', safeErrorDetail(mainErr));
      usedModel = FLUX_FALLBACK_MODEL;
      result = await env.AI.run(FLUX_FALLBACK_MODEL, {
        prompt: prompt,
        num_steps: 4
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