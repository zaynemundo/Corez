import { handleMarket } from './market.js';
import { safeErrorDetail, readBoundedJson, jsonResponse, createRateLimiter } from './utils.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENCODE_DEFAULT_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_V4_FLASH_MODEL = 'deepseek-v4-flash';

const CONTINUATION_NUDGE = {
  role: 'user',
  content: 'Your previous reply contained only internal reasoning and no final answer. Now respond with the actual complete final answer to the user\'s request (the code, explanation, or text itself). Do not include thinking, reasoning, or <think> blocks.'
};

// Storage key segments are validated identically on every R2-backed endpoint:
// no slashes, no leading dots (blocks ../ traversal), bounded length.
const SAFE_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

// Published creations get a short, human-shareable slug like "asyag23-123"
// served at the bare root path corez.pro/<slug>.
const PUBLISH_SLUG_PATTERN = /^[a-z0-9]{4,8}-[0-9]{1,6}$/;

// Online multiplayer rooms: short lowercase ids used in the WebSocket URL.
const SAFE_ROOM_ID = /^[a-z0-9][a-z0-9-]{2,31}$/;

async function handleGameSocket(request, env) {
  const pathname = new URL(request.url).pathname;
  const roomId = decodePathSegment(pathname.replace('/api/game/ws/', ''));
  if (!roomId || !SAFE_ROOM_ID.test(roomId)) {
    return jsonResponse(400, { error: 'Invalid room id: use lowercase letters, digits and dashes.' });
  }
  if (!env?.GAME_ROOMS || typeof env.GAME_ROOMS.get !== 'function') {
    return jsonResponse(503, { error: 'Multiplayer is not configured.' });
  }
  if (!/websocket/i.test(request.headers.get('Upgrade') || '')) {
    return jsonResponse(400, { error: 'WebSocket upgrade required.' });
  }
  const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(roomId));
  return stub.fetch(request);
}

function generatePublishSlug() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let word = '';
  const len = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < len; i++) {
    word += chars[Math.floor(Math.random() * chars.length)];
  }
  const num = 100 + Math.floor(Math.random() * 900);
  return `${word}-${num}`;
}

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
- Use FLUX 1 Schnell for fast background image generation and visual graphics.
- ONLINE MULTIPLAYER: When the user asks for online multiplayer, use the COREZ multiplayer protocol: connect with \`new WebSocket(\`wss://\${location.host}/api/game/ws/<roomId>\`)\` where <roomId> is a short lowercase id like "dm-123". Send JSON {type:'join',name}, {type:'input',keys:{up,down,left,right}}, {type:'shoot',dx,dy}. Receive {type:'welcome',playerId,players}, {type:'state',players:[{id,name,x,y,color,score}],bullets:[{x,y,ownerId}]} at 20Hz (normalized 0..1 coordinates), {type:'kill',killerId,victimId}, {type:'player_joined'}, {type:'player_left'}. The server moves players and resolves hits authoritatively; render the received state and map 0..1 coordinates to your canvas. Never invent your own server, socket.io, or third-party backend.
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

// Reasoning models can emit their internal thought inline wrapped in
// <think>/<thinking> blocks. Strip those sections so thinking text is never
// presented as the answer. An unclosed block (output truncated mid-thought)
// is reasoning too: everything from the marker onward is dropped, since any
// real answer would only ever follow a closed block.
function stripThinkingBlocks(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<(?:think|thinking)\b[^>]*>[\s\S]*$/gi, '')
    .trim();
}

// The real answer of a chat message is its content field. reasoning_content
// is internal model thought: it is a retry signal, never the answer (surfacing
// it previously handed users raw <think> dumps instead of the requested code).
function answerText(message) {
  if (!message || typeof message !== 'object') return '';
  return stripThinkingBlocks(extractContentText(message.content));
}

function hasReasoning(message) {
  if (!message || typeof message !== 'object') return false;
  const reasoning = extractContentText(message.reasoning_content);
  if (reasoning.trim()) return true;
  return /<(?:think|thinking)\b/i.test(extractContentText(message.content));
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
  // configured (serves the latest DeepSeek V4 Flash builds). The model list
  // is server-controlled: client-supplied body.model is never trusted.
  const targetModels = getTargetModels();
  const opencodeKey = env?.OPENCODE_GO_API_KEY || env?.OPENCODE_API_KEY;
  const opencodeEndpoint = env?.OPENCODE_ENDPOINT || OPENCODE_DEFAULT_ENDPOINT;

  // Generations run as long as the model needs and may use as many tokens
  // as it wants: no timeouts and no output caps on the provider calls. The
  // only abort is the client disconnecting (Stop button, tab close), which
  // must not leave paid generations running.
  const clientDisconnectSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  })();
  const providerFailures = [];
  const recordFailure = (label, reason) => {
    const safe = safeErrorDetail(reason);
    if (safe) providerFailures.push(`${label}: ${safe}`);
  };
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  if (opencodeKey) {
    const callOpenCodeGo = async (modelId, messagesToSend) => {
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
            messages: messagesToSend
          }),
          signal: clientDisconnectSignal
        });

        if (!opencodeResp.ok) {
          const detail = (await opencodeResp.text().catch(() => '')).slice(0, 200);
          console.warn(`OpenCode Go model ${modelId} returned HTTP ${opencodeResp.status}:`, safeErrorDetail(detail));
          return { failure: `HTTP ${opencodeResp.status}: ${safeErrorDetail(detail)}` };
        }
        const data = await opencodeResp.json();
        const message = data?.choices?.[0]?.message;
        return { content: answerText(message), reasoning: hasReasoning(message) };
      } catch (opencodeErr) {
        console.warn(`OpenCode Go model ${modelId} request failed:`, safeErrorDetail(opencodeErr));
        return { failure: safeErrorDetail(opencodeErr) };
      }
    };

    for (const modelId of targetModels) {
      // OpenCode Go is the preferred provider: stay on it as hard as
      // possible. A transient gateway failure gets one retry, and a
      // reasoning-only/empty reply gets the continuation nudge; only then
      // does the request move to DeepSeek / OpenRouter.
      let result = await callOpenCodeGo(modelId, apiMessages);
      let lastFailure = result?.failure || null;
      if (result?.failure) {
        await sleep(750);
        result = await callOpenCodeGo(modelId, apiMessages);
        lastFailure = result?.failure || lastFailure;
      }
      if (result && !result.content) {
        result = await callOpenCodeGo(modelId, [...apiMessages, CONTINUATION_NUDGE]);
        lastFailure = result?.failure || lastFailure;
      }
      if (result && result.content) {
        return jsonResponse(200, { content: result.content, model: `opencode:${modelId}` });
      }
      recordFailure(`opencode:${modelId}`, lastFailure || 'empty or reasoning-only response after continuation');
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
        signal: clientDisconnectSignal
      });

      if (deepSeekResp.ok) {
        const data = await deepSeekResp.json();
        const content = answerText(data?.choices?.[0]?.message);
        if (content) {
          return jsonResponse(200, { content, model: `deepseek:${deepSeekModel}` });
        }
      } else {
        const errText = await deepSeekResp.text().catch(() => '');
        console.warn(`DeepSeek API returned HTTP ${deepSeekResp.status}:`, safeErrorDetail(errText));
        recordFailure(`deepseek HTTP ${deepSeekResp.status}`, errText);
      }
    } catch (deepSeekErr) {
      console.warn('DeepSeek API request failed:', safeErrorDetail(deepSeekErr));
      recordFailure('deepseek', deepSeekErr);
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
          signal: clientDisconnectSignal
        });

        if (openRouterResp.ok) {
          const data = await openRouterResp.json();
          const content = answerText(data?.choices?.[0]?.message);
          if (content) {
            return jsonResponse(200, { content, model: modelId });
          }
        } else {
          const detail = (await openRouterResp.text().catch(() => '')).slice(0, 200);
          recordFailure(`openrouter:${modelId} HTTP ${openRouterResp.status}`, detail);
        }
      } catch (orErr) {
        console.warn(`OpenRouter model ${modelId} request failed:`, safeErrorDetail(orErr));
        recordFailure(`openrouter:${modelId}`, orErr);
      }
    }
  }

  console.error(JSON.stringify({
    message: 'AI generation failed',
    error: providerFailures.join(' | ').slice(0, 500) || 'all providers returned no usable response'
  }));
  const failureDetail = providerFailures.length > 0
    ? providerFailures.slice(0, 3).join(' | ').slice(0, 300)
    : 'all providers returned no usable response';
  return jsonResponse(502, {
    error: 'Unable to generate AI response.',
    detail: failureDetail
  });
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

async function callOpenRouterImage(apiKey, prompt, parentSignal) {
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
      signal: parentSignal
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

  // Image generation runs as long as it needs; only a client disconnect aborts.
  const imageClientSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  })();

  // 1. Try OpenRouter Image Generation if OPENROUTER_API_KEY is present
  const openRouterKey = env?.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const openRouterImg = await callOpenRouterImage(openRouterKey, prompt, imageClientSignal);
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
          const imgResp = await fetch(openRouterImg, {
            signal: imageClientSignal
          });
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

  return jsonResponse(503, {
    error: 'Image generation is unavailable: OPENROUTER_API_KEY is not configured or the image API failed.'
  });
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
    if (!key || !SAFE_STORAGE_SEGMENT.test(key)) {
      return jsonResponse(400, { error: 'Invalid asset key.' });
    }

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
    if (!key || !SAFE_STORAGE_SEGMENT.test(key)) {
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
    if (!SAFE_STORAGE_SEGMENT.test(sessionId)) {
      return jsonResponse(400, { error: 'Invalid sessionId: use letters, digits, dots, dashes or underscores.' });
    }
    if (!SAFE_STORAGE_SEGMENT.test(appId)) {
      return jsonResponse(400, { error: 'Invalid appId: use letters, digits, dots, dashes or underscores.' });
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
    if (sessionId === null || appId === null || !SAFE_STORAGE_SEGMENT.test(sessionId) || !SAFE_STORAGE_SEGMENT.test(appId)) {
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
      // Same originless-sandbox rendering contract as published creations.
      return new Response(appData.html || appData.code, {
        headers: publishedPageHeaders()
      });
    }

    return jsonResponse(200, appData);
  }

  // 3. GET /api/apps/:sessionId - List all apps stored for a chat session
  if (request.method === 'GET' && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const sessionId = decodePathSegment(pathname.replace('/api/apps/', ''));
    if (sessionId === null || !SAFE_STORAGE_SEGMENT.test(sessionId)) {
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
    if (sessionId === null || appId === null || !SAFE_STORAGE_SEGMENT.test(sessionId) || !SAFE_STORAGE_SEGMENT.test(appId)) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `apps/${sessionId}/${appId}.json`;
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, sessionId, appId });
  }

  // 5. DELETE /api/apps/:sessionId - Delete ALL apps associated with a chat session
  if (request.method === 'DELETE' && pathname.match(/^\/api\/apps\/[^/]+$/)) {
    const sessionId = decodePathSegment(pathname.replace('/api/apps/', ''));
    if (sessionId === null || !SAFE_STORAGE_SEGMENT.test(sessionId)) {
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
    if (!SAFE_STORAGE_SEGMENT.test(userId)) {
      return jsonResponse(400, { error: 'Invalid userId: use letters, digits, dots, dashes or underscores.' });
    }
    if (!SAFE_STORAGE_SEGMENT.test(keyName)) {
      return jsonResponse(400, { error: 'Invalid memory key: use letters, digits, dots, dashes or underscores.' });
    }

    const now = new Date().toISOString();
    const memoryRecord = {
      userId,
      key: keyName,
      category,
      text,
      metadata: body?.metadata || {},
      tags: Array.isArray(body?.tags) ? body.tags : [],
      updatedAt: now,
      createdAt: body?.createdAt || now
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
      embeddingStored: false,
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

    if (!SAFE_STORAGE_SEGMENT.test(userId)) {
      return jsonResponse(400, { error: 'Invalid userId: use letters, digits, dots, dashes or underscores.' });
    }

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
    if (userId === null || !SAFE_STORAGE_SEGMENT.test(userId)) {
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
    if (userId === null || keyName === null || !SAFE_STORAGE_SEGMENT.test(userId) || !SAFE_STORAGE_SEGMENT.test(keyName)) {
      return jsonResponse(400, { error: 'Invalid path segment.' });
    }

    const key = `memory/${userId}/${keyName}.json`;
    await env.ASSET_BUCKET.delete(key);
    return jsonResponse(200, { success: true, userId, key: keyName });
  }

  return jsonResponse(405, { error: 'Method not allowed.' });
}

function publishedPageHeaders() {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    // Published creations are AI-generated user content: render them in an
    // originless sandbox (no cookies, storage, or same-origin access) but
    // let the app itself run exactly like the in-app preview — inline
    // scripts/styles, CDN libraries, and embedded images/fonts included.
    'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-pointer-lock; default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src data: https: blob:; font-src data: https:; media-src data: https: blob:; connect-src https:"
  };
}

async function handlePublish(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // POST /api/publish - publish (or republish under an explicit slug) a
  // creation so anyone with the link can open it.
  if (pathname === '/api/publish' && request.method === 'POST') {
    let body;
    try {
      body = await readBoundedJson(request);
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON payload.' });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      body = {};
    }

    const html = typeof body?.html === 'string' && body.html.trim()
      ? body.html.trim()
      : (typeof body?.code === 'string' && body.code.trim() ? body.code.trim() : '');
    if (!html) {
      return jsonResponse(400, { error: 'html or code content is required to publish.' });
    }
    if (html.length > 2 * 1024 * 1024) {
      return jsonResponse(400, { error: 'Published content is too large.' });
    }
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
    }

    const title = typeof body?.title === 'string' ? body.title.slice(0, 120) : 'Untitled Application';
    let slug = typeof body?.slug === 'string' && PUBLISH_SLUG_PATTERN.test(body.slug) ? body.slug : null;
    if (!slug) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generatePublishSlug();
        const existing = await env.ASSET_BUCKET.get(`publish/${candidate}.json`);
        if (!existing) {
          slug = candidate;
          break;
        }
      }
    }
    if (!slug) {
      return jsonResponse(503, { error: 'Could not allocate a unique publish slug. Try again.' });
    }

    await env.ASSET_BUCKET.put(`publish/${slug}.json`, JSON.stringify({
      slug,
      title,
      html,
      createdAt: new Date().toISOString()
    }), {
      httpMetadata: { contentType: 'application/json' }
    });

    return jsonResponse(200, { success: true, slug, url: `/${slug}` });
  }

  // GET /<slug> - serve a published creation to anyone (bare root path).
  if (request.method === 'GET' && PUBLISH_SLUG_PATTERN.test(pathname.slice(1))) {
    if (!env?.ASSET_BUCKET) {
      return jsonResponse(530, { error: 'R2 storage (ASSET_BUCKET) is not configured.' });
    }
    const slug = pathname.slice(1);
    const object = await env.ASSET_BUCKET.get(`publish/${slug}.json`);
    if (!object) {
      return jsonResponse(404, { error: 'Published creation not found.' });
    }
    let record;
    try {
      record = JSON.parse(await object.text());
    } catch {
      return jsonResponse(500, { error: 'Failed to parse published payload.' });
    }
    const html = typeof record?.html === 'string' ? record.html : '';
    if (!html) {
      return jsonResponse(404, { error: 'Published creation not found.' });
    }
    return new Response(html, { headers: publishedPageHeaders() });
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
    if (pathname === '/api/publish' || (request.method === 'GET' && PUBLISH_SLUG_PATTERN.test(pathname.slice(1)))) {
      return runJsonSafe(() => handlePublish(request, env));
    }
    if (pathname.startsWith('/api/game/ws/')) {
      return runJsonSafe(() => handleGameSocket(request, env));
    }
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { error: 'API route not found.' });
    }
    return typeof env.ASSETS?.fetch === 'function' ? env.ASSETS.fetch(request) : jsonResponse(503, { error: 'Static assets not configured.' });
  }
};
