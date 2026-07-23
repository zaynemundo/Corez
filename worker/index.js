import { handleMarket } from './market.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
function getTargetModels(intentType, hasMedia, prompt = '') {
  return ['tencent/hy3-preview'];
}
const WORKERS_AI_MODEL = '@cf/moonshotai/kimi-k2.7-code';
const DEEPSEEK_MODEL = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';
const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';
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
Adaptive Routing - App & Game Creation Path:
- DeepSeek V4 Flash handles logic, vision, UI layout, art direction, and game design.
- Use FLUX 1 Schnell (@cf/black-forest-labs/flux-1-schnell) for fast background image generation and visual graphics.
- Build a complete, rich, runnable experience rather than a partial scaffold.
- 8-BIT & SVG GAME ASSETS REQUIREMENT (itch.io Quality): When generating SVG graphics, retro game sprites, icons, tilesets, weapons, items, characters, or 8-bit artwork, build clean, high-quality vector SVGs in authentic 8-bit pixel art style (inspired by itch.io game asset packs). Use shape-rendering="crispEdges", crisp pixel grid alignment (e.g. 16x16, 24x24, 32x32, or 64x64 resolution), vibrant 8-bit color palettes (PICO-8, NES, Game Boy, Fantasy retro), dark 1-pixel outlines, specular highlight pixels, inner shading, drop shadow dithering, and sprite sheet / animation frame layouts!
- 8-BIT STYLED BACKGROUNDS REQUIREMENT: ALL generated backgrounds, environment backdrops, game scenes, canvas wallpapers, and image generation prompts ([IMAGE_PROMPT: ...]) MUST be explicitly 8-bit retro pixel art styled (e.g. "8-bit pixel art background, retro 8-bit game landscape, pixelated starfield, 8-bit dungeon/arcade backdrop, crisp pixel edges"). Never generate plain or non-pixelated backgrounds for retro 8-bit asset requests!
- WORD GAMES REQUIREMENT: When generating word games (such as Scrabble, Wordle, Anagrams, Crosswords, or Boggle), you MUST embed a comprehensive dictionary of valid words (300+ words in a Set/Array) and implement strict word verification logic so the game actively validates words, accepts valid entries, rejects invalid entries, and calculates scores!
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
- STRICT MODEL ANONYMITY RULE: NEVER mention what underlying AI model, provider, vendor, architecture, or engine powers you in public chat or user responses (do NOT mention DeepSeek, Kimi, OpenAI, Anthropic, Gemini, Cloudflare, OpenRouter, FLUX, etc.). Always identify yourself strictly as COREZ AI.
- Visual & SVG Engine: COREZ AI uses DeepSeek V4 Flash for logic, layout inspection, art direction, and SVG generation.
- Background Image Engine: COREZ AI uses FLUX 1 Schnell (@cf/black-forest-labs/flux-1-schnell) for fast background image generation and artwork rendering.
- When greeted with simple phrases like "hi", "hello", "hey", or "who are you", respond simply and directly: "Hello! I'm COREZ AI. How can I help you today?"
- Never list bullet points, technical skills, or specializations when giving greetings or introductions unless explicitly requested.

Guidelines for Output:
- If the user asks for ANY game, application, landing page, dashboard, tool, simulator, widget, website, prototype, or an ENEMY BOT, generate a complete, rich, runnable HTML document with embedded CSS and JavaScript inside a single \`\`\`html ... \`\`\` code block.
- For Word Games (Scrabble, Wordle, Crosswords, etc.): ALWAYS embed a full dictionary of valid English words and implement strict word validation logic so valid words are recognized and accepted!
- You MUST start your response with a concise summary or brief explaining what you are building and how it works, BEFORE generating the code block.
- Always write complete, production-ready, working code.
- If the user asks to generate, create, or modify an image, you MUST output ONLY a tag in the exact format [IMAGE_PROMPT: <full detailed prompt for image generation>] and nothing else (which triggers FLUX 1 for free background/image rendering).
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
  const targetModels = getTargetModels(intent?.type || 'general', hasMedia, prompt);
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

async function saveToR2IfAvailable(env, key, buffer, mimeType = 'image/png') {
  if (env.ASSET_BUCKET && typeof env.ASSET_BUCKET.put === 'function') {
    try {
      await env.ASSET_BUCKET.put(key, buffer, {
        httpMetadata: { contentType: mimeType }
      });
      return `/api/assets/${key}`;
    } catch (err) {
      console.warn('R2 Bucket save failed, using fallback data URI:', safeErrorDetail(err));
    }
  }
  return null;
}

async function callOpenRouterImage(apiKey, prompt) {
  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://corez.ai',
        'X-Title': 'COREZ AI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'black-forest-labs/flux-1-schnell',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const message = data?.choices?.[0]?.message;
      if (Array.isArray(message?.images) && message.images[0]?.url) {
        return message.images[0].url;
      }
      const content = message?.content || '';
      const urlMatch = content.match(/https?:\/\/[^\s\)"']+\.(?:png|jpg|jpeg|webp)/i) || content.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
      if (urlMatch) return urlMatch[1] || urlMatch[0];
      if (content.startsWith('data:image')) return content;
    }
  } catch (err) {
    console.warn('OpenRouter image generation attempt failed:', safeErrorDetail(err));
  }
  return null;
}

async function handleImage(request, env) {
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

  const r2Key = `flux_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;

  // 1. Try OpenRouter Image Generation if OPENROUTER_API_KEY is present
  const openRouterKey = env?.OPENROUTER_API_KEY || (typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : null);
  if (openRouterKey) {
    const openRouterImg = await callOpenRouterImage(openRouterKey, prompt);
    if (openRouterImg) {
      try {
        let buffer;
        let mimeType = 'image/png';
        if (openRouterImg.startsWith('data:')) {
          const parts = openRouterImg.split(',');
          mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
          const bstr = atob(parts[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) u8arr[n] = bstr.charCodeAt(n);
          buffer = u8arr.buffer;
        } else {
          const imgResp = await fetch(openRouterImg);
          if (imgResp.ok) {
            mimeType = imgResp.headers.get('content-type') || 'image/png';
            buffer = await imgResp.arrayBuffer();
          }
        }

        if (buffer) {
          const r2Url = await saveToR2IfAvailable(env, r2Key, buffer, mimeType);
          return jsonResponse(200, { image: r2Url || openRouterImg, model: 'black-forest-labs/flux-1-schnell' });
        }
      } catch (e) {
        console.warn('Failed to persist OpenRouter image to R2, returning URL:', safeErrorDetail(e));
      }
      return jsonResponse(200, { image: openRouterImg, model: 'black-forest-labs/flux-1-schnell' });
    }
  }

  // 2. Fallback to Cloudflare Workers AI FLUX model
  if (!env.AI || typeof env.AI.run !== 'function') {
    return jsonResponse(503, { error: 'Workers AI is not configured and OpenRouter key is unavailable.' });
  }

  try {
    const usedModel = FLUX_MODEL;
    const result = await env.AI.run(FLUX_MODEL, {
      prompt: prompt,
      num_steps: 4
    });

    if (!result) {
      return jsonResponse(502, { error: 'Workers AI returned empty image data.' });
    }

    // Handle object with base64 property
    if (typeof result === 'object' && result !== null && typeof result.image === 'string') {
      const b64 = result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
      const rawB64 = b64.split(',')[1] || b64;
      const binaryStr = atob(rawB64);
      let len = binaryStr.length;
      const u8arr = new Uint8Array(len);
      while (len--) {
        u8arr[len] = binaryStr.charCodeAt(len);
      }

      const r2Url = await saveToR2IfAvailable(env, r2Key, u8arr.buffer, 'image/png');
      return jsonResponse(200, { image: r2Url || b64, model: usedModel });
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

    const r2Url = await saveToR2IfAvailable(env, r2Key, arrayBuffer, 'image/png');
    if (r2Url) {
      return jsonResponse(200, { image: r2Url, model: usedModel });
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

async function handleR2Assets(request, env) {
  if (!env.ASSET_BUCKET || typeof env.ASSET_BUCKET.put !== 'function') {
    return jsonResponse(503, { error: 'Cloudflare R2 ASSET_BUCKET is not configured.' });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/api/assets/upload' && request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const key = typeof body?.key === 'string' ? body.key.replace(/^\/+/, '') : `asset_${Date.now()}`;
    const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/png';

    if (!dataUrl) {
      return jsonResponse(400, { error: 'dataUrl is required.' });
    }

    const parts = dataUrl.split(',');
    const bstr = atob(parts[1] || parts[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    await env.ASSET_BUCKET.put(key, u8arr.buffer, {
      httpMetadata: { contentType: mimeType }
    });

    return jsonResponse(200, {
      success: true,
      key,
      url: `/api/assets/${key}`
    });
  }

  if (request.method === 'GET' && pathname.startsWith('/api/assets/')) {
    const key = pathname.replace('/api/assets/', '');
    if (!key) return jsonResponse(400, { error: 'Asset key is required.' });

    const object = await env.ASSET_BUCKET.get(key);
    if (!object) {
      return jsonResponse(404, { error: 'Asset not found in R2 bucket.' });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  }

  if (request.method === 'DELETE' && pathname.startsWith('/api/assets/')) {
    const key = pathname.replace('/api/assets/', '');
    if (!key) return jsonResponse(400, { error: 'Asset key is required.' });

    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, deletedKey: key });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
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
    if (pathname === '/api/market') {
      return handleMarket(request, env);
    }
    if (pathname.startsWith('/api/assets')) {
      return handleR2Assets(request, env);
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return env.ASSETS.fetch(request);
  }
};
