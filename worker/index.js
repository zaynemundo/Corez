import { handleMarket } from './market.js';
import { safeErrorDetail, readBoundedJson, jsonResponse, createRateLimiter } from './utils.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENCODE_DEFAULT_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_V4_FLASH_MODEL = 'deepseek-v4-flash';
const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const WORKERS_AI_MODEL = '@cf/moonshotai/kimi-k2.7-code';
const DEEPSEEK_MODEL = '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b';
const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
const RERANK_MODEL = '@cf/baai/bge-reranker-base';

function getTargetModels() {
  return [DEEPSEEK_V4_FLASH_MODEL];
}

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

const aiRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 20 });
const imageRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 });

function buildSystemPrompt(options = {}) {
  const intent = typeof options.intent === 'object' ? options.intent : null;
  const legacyIntent = options.legacyIntent || (typeof options.intent === 'string' ? options.intent : intent?.type);
  const skills = Array.isArray(options.skills) ? options.skills : [];
  const contract = options.contract && typeof options.contract === 'object' ? options.contract : null;
  const executionPlan = typeof options.executionPlan === 'string' ? options.executionPlan : null;

  const intentType = normalizeIntentType(legacyIntent || intent?.type);
  const primaryIntent = intent?.primaryIntent || intent?.type || intentType;
  const secondaryIntent = intent?.secondaryIntent ? ` (secondary: ${intent.secondaryIntent})` : '';

  let adaptiveInstructions;
  if (intentType === 'code-help' || ['bug_fix', 'code_refactor', 'feature_implementation', 'simple_edit'].includes(primaryIntent)) {
    adaptiveInstructions = `
Adaptive Routing - Coding Path:
- Inspect relevant architecture and naming conventions before providing code.
- Do NOT hallucinate file paths or modify unrelated files.
- Preserve existing public API contracts, method signatures, and component props.
- Do NOT modify usage limits, rate limits, token limits, subscription plans, billing, or provider routing.
- Include exact files changed, a reasoning summary, and clear verification steps.`;
  } else if (intentType === 'swarm' || primaryIntent === 'swarm') {
    adaptiveInstructions = `
Adaptive Routing - Complex Path:
- Use step-by-step reasoning and careful task graph planning.
- Provide a robust architectural overview before diving into specific code.`;
  } else if (intentType === 'app' || ['website_creation', 'game_creation', 'design_task'].includes(primaryIntent)) {
    const isExplicitDesignRequest = skills.some(s => s.id === 'frontend-modern-design') || /\b(glassmorphism|dark mode|awwwards|luxury|neon|aesthetic)\b/i.test(intent?.goal || '');
    const designStyle = isExplicitDesignRequest
      ? '- VISUAL DESIGN: Build with luxury dark mode glassmorphism (background: #090A0F, surface: rgba(18, 20, 29, 0.75), glowing borders, Outfit/Inter typography).'
      : '- VISUAL DESIGN: Follow clean, responsive, user-specified design instructions; preserve user explicit styling preferences.';

    adaptiveInstructions = `
Adaptive Routing - App & Game Creation Path (Awwwards Site of the Day Quality):
- DeepSeek V4 Flash handles logic, vision, UI layout, art direction, and game design.
- Use FLUX 1 Schnell (@cf/black-forest-labs/flux-1-schnell) for fast background image generation and visual graphics.
${designStyle}
- Build a complete, rich, runnable experience ready for the preview canvas.
- Word Games Requirement: When generating word games (Scrabble, Wordle, Crosswords, etc.), embed a full dictionary of valid English words and implement strict word validation logic.`;
  } else if (intentType === 'writing') {
    adaptiveInstructions = `
Adaptive Routing - Writing Path:
- Deliver polished copy in the requested format and tone.
- Match audience and purpose without technical commentary.`;
  } else if (intentType === 'explanation') {
    adaptiveInstructions = `
Adaptive Routing - Explanation Path:
- Explain directly in plain language using practical examples.`;
  } else {
    adaptiveInstructions = `
Adaptive Routing - Fast Path:
- Answer directly and immediately with practical information.`;
  }

  const imageRequestInstructions = `
- IMAGE REQUESTS: If the user explicitly requests an image, picture, photo, illustration, artwork, logo, or wallpaper, respond with EXACTLY ONE line containing \`[IMAGE_PROMPT: concise detailed description of the requested image]\` and nothing else. Never output raw SVG markup for image requests — the platform renders the image for you.`;

  // Format full skill instructions (bounded so input tokens stay compact)
  let formattedSkills = '(none — direct execution path)';
  if (skills.length > 0) {
    formattedSkills = skills.map(s => {
      const id = typeof s === 'string' ? s : (s.id || s.name);
      const name = typeof s === 'object' ? (s.name || s.id) : s;
      const phase = typeof s === 'object' ? (s.phase || 'IMPLEMENTING') : 'EXECUTION';
      const instructions = typeof s === 'object' && s.instructions ? s.instructions : (s.description || 'Execute skill requirements');
      const reason = typeof s === 'object' && s.reasonSelected ? `\n    Reason: ${String(s.reasonSelected).slice(0, 150)}` : '';
      const constraints = typeof s === 'object' && Array.isArray(s.constraints) && s.constraints.length ? `\n    Constraints: ${s.constraints.join(' | ').slice(0, 300)}` : '';
      return `\n- [${phase}] ${name} (${id})${reason}\n    Instructions: ${String(instructions).slice(0, 300)}${constraints}`;
    }).join('');
  }

  // Format intent contract & preservation constraints (bounded)
  let formattedContract = '';
  if (contract) {
    const mustAchieve = Array.isArray(contract.mustAchieve) && contract.mustAchieve.length ? `\n- Must Achieve: ${contract.mustAchieve.join('; ').slice(0, 600)}` : '';
    const mustPreserve = Array.isArray(contract.mustPreserve) && contract.mustPreserve.length ? `\n- Must Preserve: ${contract.mustPreserve.join('; ').slice(0, 600)}` : '';
    const mustNotInvent = Array.isArray(contract.mustNotInvent) && contract.mustNotInvent.length ? `\n- Must Not Change / Invent: ${contract.mustNotInvent.join('; ').slice(0, 600)}` : '';
    formattedContract = `\n\nIntent Contract & Preservation Rules:${mustAchieve}${mustPreserve}${mustNotInvent}`;
  }

  // Format Execution Plan (bounded)
  const formattedPlan = executionPlan ? `\n\n${String(executionPlan).slice(0, 800)}` : '';

  return `You are COREZ AI.

Identity & Persona:
- Your name is COREZ AI.
- STRICT MODEL ANONYMITY RULE: NEVER mention what underlying AI model, provider, vendor, architecture, or engine powers you in public chat or user responses. Always identify yourself strictly as COREZ AI.
- When greeted with simple phrases like "hi", "hello", "hey", or "who are you", respond simply: "Hello! I'm COREZ AI. How can I help you today?"
- Never list bullet points or technical specializations when giving greetings unless requested.

Guidelines for Output:
- DEFAULT FORMAT (React/JSX): When writing code or building apps, components, tools, dashboards, or games without an explicitly requested format, default to clean, modern React/JSX components (using \`\`\`jsx ... \`\`\` code blocks). ALWAYS name your main top-level component "export default function App()".
- REQUESTED FORMATS (HTML/CSS/JS): If the user explicitly requests HTML, CSS, vanilla JS, or plain web code, output complete single-file HTML/CSS/JS inside ONE SINGLE \`\`\`html ... \`\`\` code block.
- PROPER LAYERING: Ensure proper visual layering (Background z-index:0 -> Content z-index:10 -> HUD/Toolbars z-index:20-30 -> Modals z-index:40-50+).
- CRITICAL SINGLE-FILE MANDATE: Output all code as ONE SINGLE self-contained file in ONE SINGLE code block.
- Always start your response with a brief summary explaining your implementation choices before the code block.
${adaptiveInstructions}

Fine-Grained Intent: ${primaryIntent}${secondaryIntent}
Target Goal: ${intent?.goal || 'Assist user with requested deliverable'}
Deliverable: ${intent?.deliverable || 'Response'}
Complexity: ${intent?.complexity || 'medium'} | Confidence: ${Math.round((intent?.confidence || 0.8) * 100)}%${formattedContract}

Active Skills & Instructions:${formattedSkills}${formattedPlan}
${imageRequestInstructions}
Inferred intent: ${intentType} - ${intent?.summary || intent?.goal || 'Understand the public user goal and give a useful next step.'}`;
}

function extractContentText(content) {
  if (typeof content === 'string') return content;
  // Multimodal responses can wrap text in content parts: [{ type, text }]
  if (Array.isArray(content)) {
    return content
      .map(part => (part && typeof part === 'object' && typeof part.text === 'string') ? part.text : '')
      .join('');
  }
  return '';
}

async function handleAi(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const retryAfter = aiRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(429, { error: 'Too many requests. Try again shortly.' }, { 'Retry-After': String(retryAfter) });
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    body = {};
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse(400, { error: 'Prompt is required.' });
  }

  // Greeting fast-path: common greetings get the mandated persona reply
  // instantly without paying an LLM round-trip.
  const GREETING_PATTERN = /^(hi|hello|hey|yo|sup|howdy|greetings|good\s+(morning|afternoon|evening|day)|who\s+(are|r)\s+you|what\s+(are|r)\s+you|whats?\s+(is\s+)?your\s+name)\b[.?!]*$/i;
  if (prompt.length <= 60 && GREETING_PATTERN.test(prompt)) {
    return jsonResponse(200, {
      content: "Hello! I'm COREZ AI. How can I help you today?",
      model: 'corez-greeting'
    });
  }

  const intent = body.intent && typeof body.intent === 'object' && !Array.isArray(body.intent) ? body.intent : null;
  const legacyIntent = body.legacyIntent || (typeof intent === 'string' ? intent : intent?.type);
  const contract = body.contract && typeof body.contract === 'object' ? body.contract : null;
  const skills = Array.isArray(body.skills) ? body.skills : [];
  const executionPlan = typeof body.executionPlan === 'string' ? body.executionPlan : null;

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const systemPrompt = buildSystemPrompt({ intent, legacyIntent, skills, contract, executionPlan });
  const apiMessages = [
    { role: 'system', content: systemPrompt }
  ];

  let hasAppendedPrompt = false;
  for (const m of messages) {
    if (m.role && m.content) {
      apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      if (typeof m.content === 'string' && m.content === prompt && m.role === 'user') {
        hasAppendedPrompt = true;
      }
    }
  }
  
  if (!hasAppendedPrompt) {
    apiMessages.push({ role: 'user', content: prompt });
  }

  // 1. OpenCode Go API first if OPENCODE_GO_API_KEY / OPENCODE_API_KEY is
  // configured (serves the latest DeepSeek V4 Flash builds)
  let targetModels = getTargetModels();
  if (body.model && typeof body.model === 'string' && body.model.trim()) {
    const customModel = body.model.trim();
    targetModels = [customModel, ...targetModels.filter(m => m !== customModel)];
  }
  const opencodeKey = env?.OPENCODE_GO_API_KEY || env?.OPENCODE_API_KEY;
  const opencodeEndpoint = env?.OPENCODE_ENDPOINT || OPENCODE_DEFAULT_ENDPOINT;
  if (opencodeKey) {
    for (const modelId of targetModels) {
      try {
        const opencodeResp = await fetch(opencodeEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${opencodeKey}`,
            'HTTP-Referer': 'https://corez.ai',
            'X-Title': 'COREZ AI',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            messages: apiMessages
          }),
          signal: AbortSignal.timeout(30_000)
        });

        if (opencodeResp.ok) {
          const data = await opencodeResp.json();
          const content = extractContentText(data?.choices?.[0]?.message?.content);
          if (content && content.trim()) {
            return jsonResponse(200, { content: content.trim(), model: `opencode:${modelId}` });
          }
        }
      } catch (opencodeErr) {
        console.warn(`OpenCode Go model ${modelId} request failed:`, safeErrorDetail(opencodeErr));
      }
    }
  }

  // 2. Official DeepSeek API if DEEPSEEK_API_KEY is configured
  const deepSeekKey = env?.DEEPSEEK_API_KEY;
  if (deepSeekKey) {
    const deepSeekEndpoint = env?.DEEPSEEK_ENDPOINT || DEEPSEEK_ENDPOINT;
    const deepSeekModel = env?.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
    try {
      const deepSeekResp = await fetch(deepSeekEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deepSeekKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: deepSeekModel,
          messages: apiMessages,
          stream: false
        }),
        signal: AbortSignal.timeout(60_000)
      });

      if (deepSeekResp.ok) {
        const data = await deepSeekResp.json();
        const content = extractContentText(data?.choices?.[0]?.message?.content);
        if (content && content.trim()) {
          return jsonResponse(200, { content: content.trim(), model: `deepseek:${deepSeekModel}` });
        }
      } else {
        const errText = await deepSeekResp.text().catch(() => '');
        console.warn(`DeepSeek API returned HTTP ${deepSeekResp.status}:`, safeErrorDetail(errText));
      }
    } catch (deepSeekErr) {
      console.warn('DeepSeek API request failed:', safeErrorDetail(deepSeekErr));
    }
  }

  // 3. Try OpenRouter API if OPENROUTER_API_KEY is configured
  const openRouterKey = env?.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const requestComplexity = String(
      body?.complexity || body?.fineIntent?.complexity || intent?.enriched?.complexity || ''
    ).toLowerCase();
    const reasoningEffort = ['high', 'epic'].includes(requestComplexity) ? 'high' : 'medium';
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
            reasoning: { effort: reasoningEffort },
            messages: apiMessages
          }),
          signal: AbortSignal.timeout(30_000)
        });

        if (openRouterResp.ok) {
          const data = await openRouterResp.json();
          const content = extractContentText(data?.choices?.[0]?.message?.content);
          if (content && content.trim()) {
            return jsonResponse(200, { content: content.trim(), model: modelId });
          }
        }
      } catch (orErr) {
        console.warn(`OpenRouter model ${modelId} request failed:`, safeErrorDetail(orErr));
      }
    }
  }

  // 4. Cloudflare Workers AI Fallback
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
      // An empty primary response is as useless as a thrown error: try the
      // DeepSeek fallback model before giving up.
      if (!extractContentText(result?.choices?.[0]?.message?.content).trim()) {
        console.warn('Primary Workers AI model returned an empty response, attempting DeepSeek fallback.');
        usedModel = DEEPSEEK_MODEL;
        result = await env.AI.run(DEEPSEEK_MODEL, {
          messages: apiMessages
        });
      }
    } catch (primaryError) {
      console.warn('Primary Workers AI model failed, attempting DeepSeek fallback:', safeErrorDetail(primaryError));
      usedModel = DEEPSEEK_MODEL;
      result = await env.AI.run(DEEPSEEK_MODEL, {
        messages: apiMessages
      });
    }

    const content = extractContentText(result?.choices?.[0]?.message?.content);
    const normalizedContent = content.trim();
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
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (response.ok) {
      const data = await response.json();
      const message = data?.choices?.[0]?.message;
      if (Array.isArray(message?.images) && message.images[0]?.url) {
        return message.images[0].url;
      }
      const content = message?.content || '';
      const urlMatch = content.match(/https?:\/\/[^\s)"']+\.(?:png|jpg|jpeg|webp)/i) || content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
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

  const retryAfter = imageRateLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(429, { error: 'Too many requests. Try again shortly.' }, { 'Retry-After': String(retryAfter) });
  }

  let body;
  try {
    body = await readBoundedJson(request);
  } catch (bodyErr) {
    const message = bodyErr?.message || 'Invalid JSON payload.';
    return jsonResponse(400, { error: `Request body rejected: ${message}` });
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
  const openRouterKey = env?.OPENROUTER_API_KEY;
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
    console.error('Image generation failed:', safeErrorDetail(error));
    return jsonResponse(502, { error: 'Unable to generate image.' });
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
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const ALLOWED_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'];
    const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

    const key = typeof body?.key === 'string' ? body.key.replace(/^\/+/, '') : `asset_${Date.now()}`;
    const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'image/png';

    if (!dataUrl) {
      return jsonResponse(400, { error: 'dataUrl is required.' });
    }
    if (!SAFE_KEY.test(key)) {
      return jsonResponse(400, { error: 'Invalid asset key: use letters, digits, dots, dashes or underscores.' });
    }
    if (!ALLOWED_ASSET_TYPES.includes(mimeType)) {
      return jsonResponse(400, { error: `Unsupported content type "${mimeType}".` });
    }
    // The data URL must be a base64 data URL whose declared image type matches
    // the stored content type; arbitrary bytes are never stored as-is.
    const expectedPrefix = `data:${mimeType};base64,`;
    if (!dataUrl.startsWith(expectedPrefix)) {
      return jsonResponse(400, { error: 'dataUrl must be a base64 data URL matching the declared content type.' });
    }

    let bytes;
    try {
      const parts = dataUrl.split(',');
      const bstr = atob(parts[1] || '');
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      bytes = u8arr.buffer;
    } catch {
      return jsonResponse(400, { error: 'Invalid base64 payload.' });
    }

    await env.ASSET_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: mimeType }
    });

    return jsonResponse(200, {
      success: true,
      key,
      url: `/api/assets/${key}`
    });
  }

  if (request.method === 'GET' && pathname.startsWith('/api/assets/')) {
    const key = decodePathSegment(pathname.replace('/api/assets/', ''));
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
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'no-referrer');
    // SVG can carry <script>; sandbox it so it never executes as a document.
    if ((headers.get('content-type') || '').includes('svg')) {
      headers.set('Content-Security-Policy', "sandbox; default-src 'none'");
    }

    return new Response(object.body, { headers });
  }

  if (request.method === 'DELETE' && pathname.startsWith('/api/assets/')) {
    const key = decodePathSegment(pathname.replace('/api/assets/', ''));
    if (!key || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(key)) {
      return jsonResponse(400, { error: 'Invalid asset key.' });
    }

    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, deletedKey: key });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

async function handleR2Apps(request, env) {
  if (!env?.ASSET_BUCKET) {
    return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. POST /api/apps/store - Store or update an app under a session
  if (pathname === '/api/apps/store' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
    const appId = typeof body?.appId === 'string' ? body.appId.trim() : `app_${Date.now()}`;
    const title = typeof body?.title === 'string' ? body.title : 'Untitled Application';
    const code = typeof body?.code === 'string' ? body.code : '';
    const html = typeof body?.html === 'string' ? body.html : '';

    if (!sessionId) {
      return jsonResponse(400, { error: 'sessionId is required.' });
    }
    if (!code && !html) {
      return jsonResponse(400, { error: 'code or html content is required.' });
    }

    const appRecord = {
      sessionId,
      appId,
      title,
      code,
      html,
      updatedAt: new Date().toISOString(),
      metadata: body?.metadata || {}
    };

    const key = `apps/${sessionId}/${appId}.json`;
    await env.ASSET_BUCKET.put(key, JSON.stringify(appRecord), {
      httpMetadata: { contentType: 'application/json' }
    });

    return jsonResponse(200, {
      success: true,
      sessionId,
      appId,
      key,
      url: `/api/apps/${sessionId}/${appId}`
    });
  }

  // 2. GET /api/apps/:sessionId/:appId - Fetch a specific app
  if (request.method === 'GET' && pathname.match(/^\/api\/apps\/[^/]+\/[^/]+$/)) {
    const parts = pathname.replace('/api/apps/', '').split('/');
    const sessionId = decodePathSegment(parts[0]);
    const appId = decodePathSegment(parts[1]);
    if (sessionId === null || appId === null) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `apps/${sessionId}/${appId}.json`;
    const object = await env.ASSET_BUCKET.get(key);
    if (!object) {
      return jsonResponse(404, { error: 'App not found in R2 storage.' });
    }

    const text = await object.text();
    let appData;
    try {
      appData = JSON.parse(text);
    } catch {
      return jsonResponse(500, { error: 'Failed to parse stored app payload.' });
    }

    if (url.searchParams.get('format') === 'html') {
      return new Response(appData.html || appData.code, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          // Apps are AI-generated user content: sandbox them as documents and
          // forbid all subresources so a generated app cannot exfiltrate data.
          'Content-Security-Policy': "sandbox; default-src 'none'; script-src 'unsafe-inline'"
        }
      });
    }

    return jsonResponse(200, appData);
  }

  // 3. GET /api/apps/:sessionId - List all apps stored for a chat session
  if (request.method === 'GET' && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const sessionId = decodePathSegment(pathname.replace('/api/apps/', ''));
    if (sessionId === null) {
      return jsonResponse(400, { error: 'Invalid session id in path.' });
    }
    const prefix = `apps/${sessionId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    const apps = [];
    if (list && Array.isArray(list.objects)) {
      for (const obj of list.objects) {
        if (obj.key.endsWith('.json')) {
          const item = await env.ASSET_BUCKET.get(obj.key);
          if (item) {
            try {
              const data = JSON.parse(await item.text());
              apps.push({
                appId: data.appId,
                title: data.title,
                updatedAt: data.updatedAt,
                url: `/api/apps/${sessionId}/${data.appId}`
              });
            } catch { /* ignore invalid cache entries */ }
          }
        }
      }
    }

    return jsonResponse(200, { sessionId, apps });
  }

  // 4. DELETE /api/apps/:sessionId/:appId - Delete a specific app
  if (request.method === 'DELETE' && pathname.match(/^\/api\/apps\/[^/]+\/[^/]+$/)) {
    const parts = pathname.replace('/api/apps/', '').split('/');
    const sessionId = decodePathSegment(parts[0]);
    const appId = decodePathSegment(parts[1]);
    if (sessionId === null || appId === null) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `apps/${sessionId}/${appId}.json`;
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, sessionId, appId });
  }

  // 5. DELETE /api/apps/:sessionId - Delete ALL apps associated with a chat session
  if (request.method === 'DELETE' && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const sessionId = decodePathSegment(pathname.replace('/api/apps/', ''));
    if (sessionId === null) {
      return jsonResponse(400, { error: 'Invalid session id in path.' });
    }
    const prefix = `apps/${sessionId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    let count = 0;
    if (list && Array.isArray(list.objects)) {
      for (const obj of list.objects) {
        await env.ASSET_BUCKET.delete(obj.key);
        count++;
      }
    }

    return jsonResponse(200, { success: true, sessionId, deletedCount: count });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

function extractEmbedding(result) {
  if (!result) return null;
  // OpenAI-style: { data: [{ embedding: [...] }] }
  if (Array.isArray(result.data) && result.data[0] && Array.isArray(result.data[0].embedding)) {
    return result.data[0].embedding;
  }
  // Workers AI style: { shape: [1, dim], data: [[...]] }
  if (Array.isArray(result.data) && Array.isArray(result.data[0]) && result.data[0].length > 0) {
    return result.data[0];
  }
  if (Array.isArray(result) && Array.isArray(result[0]) && result[0].length > 0) {
    return result[0];
  }
  return null;
}

async function embedText(env, text) {
  if (!env?.AI || typeof env.AI.run !== 'function') return null;
  try {
    const result = await env.AI.run(EMBEDDING_MODEL, { text: [String(text).slice(0, 2000)] });
    const embedding = extractEmbedding(result);
    if (!embedding || embedding.length === 0) return null;
    return embedding;
  } catch (err) {
    console.warn('Memory embedding failed; using keyword search fallback:', safeErrorDetail(err));
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractRerankScores(result) {
  if (!result) return null;
  const raw = Array.isArray(result.result) ? result.result
    : Array.isArray(result.data) ? result.data
    : Array.isArray(result.results) ? result.results
    : null;
  if (!raw) return null;
  return raw.map(d => ({ index: d.index, score: d.relevance_score ?? d.score ?? 0 }));
}

async function rerankDocuments(env, query, documents) {
  if (!env?.AI || typeof env.AI.run !== 'function') return null;
  if (!Array.isArray(documents) || documents.length === 0) return null;
  try {
    const result = await env.AI.run(RERANK_MODEL, {
      query: String(query).slice(0, 500),
      contexts: documents.map(d => ({ text: String(d).slice(0, 2000) })),
      top_k: 5
    });
    const scores = extractRerankScores(result);
    if (!scores || scores.length === 0) return null;
    return scores.filter(s => Number.isFinite(s.index) && s.index >= 0 && s.index < documents.length);
  } catch (err) {
    console.warn('Memory rerank failed; using embedding ranking fallback:', safeErrorDetail(err));
    return null;
  }
}

function publicMemoryRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const publicRecord = { ...record };
  // Embeddings are server-side only: never expose raw vectors to clients.
  delete publicRecord.embedding;
  delete publicRecord.embeddingModel;
  return publicRecord;
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

async function handleR2Memory(request, env) {
  if (!env?.ASSET_BUCKET) {
    return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
  }

  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. POST /api/memory/store - Store or update a memory entry
  if (pathname === '/api/memory/store' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const userId = typeof body?.userId === 'string' ? body.userId.trim() : 'default_user';
    const keyName = typeof body?.key === 'string' ? body.key.trim() : `mem_${Date.now()}`;
    const category = typeof body?.category === 'string' ? body.category.trim() : 'general';
    const text = typeof body?.text === 'string' ? body.text : (typeof body?.value === 'string' ? body.value : '');

    if (!text) {
      return jsonResponse(400, { error: 'text or value content is required for memory storage.' });
    }

    const now = new Date().toISOString();
    const embedding = await embedText(env, text);
    const memoryRecord = {
      userId,
      key: keyName,
      category,
      text,
      metadata: body?.metadata || {},
      tags: Array.isArray(body?.tags) ? body.tags : [],
      updatedAt: now,
      createdAt: body?.createdAt || now,
      ...(embedding ? { embedding, embeddingModel: EMBEDDING_MODEL } : {})
    };

    const key = `memory/${userId}/${keyName}.json`;
    await env.ASSET_BUCKET.put(key, JSON.stringify(memoryRecord), {
      httpMetadata: { contentType: 'application/json' }
    });

    return jsonResponse(200, {
      success: true,
      userId,
      key: keyName,
      r2Key: key,
      embeddingStored: Boolean(embedding),
      record: publicMemoryRecord(memoryRecord)
    });
  }

  // 2. POST /api/memory/search - Search relevant memories
  if (pathname === '/api/memory/search' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }

    const userId = typeof body?.userId === 'string' ? body.userId.trim() : 'default_user';
    const query = typeof body?.query === 'string' ? body.query.trim().toLowerCase() : '';
    const categoryFilter = typeof body?.category === 'string' ? body.category.trim().toLowerCase() : '';

    const prefix = `memory/${userId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    const matches = [];
    if (list && Array.isArray(list.objects)) {
      for (const obj of list.objects) {
        if (obj.key.endsWith('.json')) {
          const item = await env.ASSET_BUCKET.get(obj.key);
          if (item) {
            try {
              const data = JSON.parse(await item.text());
              const catLower = String(data.category || '').toLowerCase();

              if (!categoryFilter || catLower === categoryFilter) {
                matches.push(data);
              }
            } catch {
              /* ignore invalid cache entries */
            }
          }
        }
      }
    }

    if (!query) {
      return jsonResponse(200, { userId, query, matches, source: 'keyword' });
    }

    // 1. Semantic path: embed the query, rank by cosine similarity, then rerank
    // the top candidates with the BGE reranker. Requires stored embeddings and a
    // working AI binding; otherwise falls back to substring matching.
    const queryEmbedding = await embedText(env, query);
    if (queryEmbedding) {
      const withVectors = matches.filter(m => Array.isArray(m.embedding) && m.embedding.length > 0);
      if (withVectors.length > 0) {
        const ranked = withVectors
          .map(m => ({ memory: m, similarity: cosineSimilarity(queryEmbedding, m.embedding) }))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 20);

        const reranked = await rerankDocuments(env, query, ranked.map(r => r.memory.text || ''));
        if (reranked && reranked.length > 0) {
          const top = reranked
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(r => ({ ...publicMemoryRecord(ranked[r.index].memory), score: Math.round(r.score * 1000) / 1000 }));
          return jsonResponse(200, { userId, query, matches: top, source: 'semantic', rerank: true });
        }

        const top = ranked
          .slice(0, 5)
          .map(r => ({ ...publicMemoryRecord(r.memory), similarity: Math.round(r.similarity * 1000) / 1000 }));
        return jsonResponse(200, { userId, query, matches: top, source: 'semantic', rerank: false });
      }
    }

    // 2. Keyword fallback (also catches memories stored without embeddings)
    const keywordMatches = matches.filter(m => {
      const textLower = String(m.text || '').toLowerCase();
      const keyLower = String(m.key || '').toLowerCase();
      const catLower = String(m.category || '').toLowerCase();
      return textLower.includes(query) || keyLower.includes(query) || catLower.includes(query);
    }).map(publicMemoryRecord);

    return jsonResponse(200, { userId, query, matches: keywordMatches, source: 'keyword' });
  }

  // 3. GET /api/memory/:userId - List all memories for a user
  if (request.method === 'GET' && pathname.match(/^\/api\/memory\/[^/]+$/)) {
    const encodedUserId = pathname.replace('/api/memory/', '');
    const userId = decodePathSegment(encodedUserId);
    if (userId === null) {
      return jsonResponse(400, { error: 'Invalid user id in path.' });
    }
    const prefix = `memory/${userId}/`;
    const list = await env.ASSET_BUCKET.list({ prefix });

    const memories = [];
    if (list && Array.isArray(list.objects)) {
      for (const obj of list.objects) {
        if (obj.key.endsWith('.json')) {
          const item = await env.ASSET_BUCKET.get(obj.key);
          if (item) {
            try {
              const data = JSON.parse(await item.text());
              memories.push(publicMemoryRecord(data));
            } catch {
              /* ignore invalid cache entries */
            }
          }
        }
      }
    }

    return jsonResponse(200, { userId, memories });
  }

  // 4. DELETE /api/memory/:userId/:key - Delete a memory
  if (request.method === 'DELETE' && pathname.match(/^\/api\/memory\/[^/]+\/[^/]+$/)) {
    const parts = pathname.replace('/api/memory/', '').split('/');
    const userId = decodePathSegment(parts[0]);
    const keyName = decodePathSegment(parts[1]);
    if (userId === null || keyName === null) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `memory/${userId}/${keyName}.json`;
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, userId, key: keyName });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

async function runJsonSafe(operation) {
  try {
    return await operation();
  } catch (err) {
    console.error('Storage handler error:', safeErrorDetail(err));
    return jsonResponse(500, { error: 'Storage operation failed.' });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

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
      return runJsonSafe(() => handleR2Assets(request, env));
    }
    if (pathname.startsWith('/api/apps')) {
      return runJsonSafe(() => handleR2Apps(request, env));
    }
    if (pathname.startsWith('/api/memory')) {
      return runJsonSafe(() => handleR2Memory(request, env));
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return typeof env.ASSETS?.fetch === 'function' ? env.ASSETS.fetch(request) : jsonResponse(503, { error: 'Static assets not configured.' });
  }
};
