import { handleMarket } from './market.js';
import { handleSearch } from './search.js';
import { fetchAwwwardsInspiration, handleInspiration } from './inspiration.js';
import { safeErrorDetail, readBoundedJson, jsonResponse, createTaskStateStore } from './utils.js';
import { runProviderChain, callOpenRouterImage, FLUX_IMAGE_MODEL } from './providerChain.js';

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

  // Format full skill instructions: every selected skill passes intact so
  // the model never loses applicable guidance.
  let formattedSkills = '(none — direct execution path)';
  if (skills.length > 0) {
    formattedSkills = skills.map(s => {
      const id = typeof s === 'string' ? s : (s.id || s.name);
      const name = typeof s === 'object' ? (s.name || s.id) : s;
      const phase = typeof s === 'object' ? (s.phase || 'IMPLEMENTING') : 'EXECUTION';
      const instructions = typeof s === 'object' && s.instructions ? s.instructions : (s.description || 'Execute skill requirements');
      const reason = typeof s === 'object' && s.reasonSelected ? `\n    Reason: ${String(s.reasonSelected)}` : '';
      const constraints = typeof s === 'object' && Array.isArray(s.constraints) && s.constraints.length ? `\n    Constraints: ${s.constraints.join(' | ')}` : '';
      return `\n- [${phase}] ${name} (${id})${reason}\n    Instructions: ${String(instructions)}${constraints}`;
    }).join('');
  }

  // Format intent contract & preservation constraints in full: these are
  // must-preserve rules, and dropping any part could let the model violate
  // an explicit requirement.
  let formattedContract = '';
  if (contract) {
    const mustAchieve = Array.isArray(contract.mustAchieve) && contract.mustAchieve.length ? `\n- Must Achieve: ${contract.mustAchieve.join('; ')}` : '';
    const mustPreserve = Array.isArray(contract.mustPreserve) && contract.mustPreserve.length ? `\n- Must Preserve: ${contract.mustPreserve.join('; ')}` : '';
    const mustNotInvent = Array.isArray(contract.mustNotInvent) && contract.mustNotInvent.length ? `\n- Must Not Change / Invent: ${contract.mustNotInvent.join('; ')}` : '';
    formattedContract = `\n\nIntent Contract & Preservation Rules:${mustAchieve}${mustPreserve}${mustNotInvent}`;
  }

  // Format Execution Plan in full.
  const formattedPlan = executionPlan ? `\n\n${String(executionPlan)}` : '';

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

async function handleAi(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
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

  // Repository-agent mode: chat requests that target an existing repository
  // must run the full agent cycle (understand, inspect, plan, implement,
  // verify, review, finalise). This deployment has no repository workspace
  // attached unless a WORKSPACE_BINDING is configured, and CoreZ never
  // pretends repository tools ran. Without a workspace the request is
  // reported honestly, unexecuted.
  if (body.mode === 'repository-agent') {
    const workspace = env?.WORKSPACE_BINDING;
    if (!workspace || typeof workspace.cwd !== 'string') {
      return jsonResponse(200, {
        content: 'I can analyse that request, but this deployment has no repository workspace attached, so I cannot modify real files here — nothing was executed. Run CoreZ with a workspace attached (e.g. the local CLI agent against a repository) to get the full evidence-backed loop: inspect, plan, implement, test, lint, build, review, finalise.',
        model: 'corez:no-workspace'
      });
    }
    try {
      // Local/self-hosted scenario with nodejs_compat: run the real agent
      // runtime against the bound workspace. In production Workers without a
      // workspace this branch is unreachable (guarded above).
      const { AgentRuntime } = await import('../packages/agent-core/runtime/index.js');
      const runtime = new AgentRuntime({
        cwd: workspace.cwd,
        mode: 'repository',
        autoApprove: true
      });
      const agentResult = await runtime.runTask(prompt, {
        onStatus: (status) => {
          if (typeof status?.message === 'string') console.warn(`[agent:${status.type}] ${status.message}`);
        }
      });
      const evidence = {
        steps: agentResult.stepsCount,
        inspected: agentResult.inspectedFiles?.length || 0,
        modified: agentResult.modifiedFiles?.length || 0,
        blocked: agentResult.blocked || false
      };
      const suffix = agentResult.blocked
        ? `\n\nThe task stopped because the agent could not make further progress: ${agentResult.blockedReason || 'no new evidence'}.`
        : '';
      return jsonResponse(200, {
        content: `${agentResult.response}${suffix}\n\n[Agent evidence: ${evidence.steps} steps, ${evidence.inspected} files inspected, ${evidence.modified} files modified${agentResult.blocked ? ', blocked' : ''}]`,
        model: 'corez:agent'
      });
    } catch (agentErr) {
      console.warn('Repository agent runtime unavailable:', safeErrorDetail(agentErr));
      return jsonResponse(200, {
        content: `A repository workspace is attached, but the agent runtime could not start here (${safeErrorDetail(agentErr)}). Your request was not executed. Run CoreZ locally against the repository instead.`,
        model: 'corez:no-workspace'
      });
    }
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
  // The client-computed execution prompt carries the design spec (Awwwards
  // principles, layout rules, code format). It must reach the model: it
  // replaces the bare user prompt when present.
  const executionPrompt = typeof body.executionPrompt === 'string' && body.executionPrompt.trim()
    ? body.executionPrompt.trim()
    : null;

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const systemPrompt = buildSystemPrompt({ intent, legacyIntent, skills, contract, executionPlan });
  const apiMessages = [
    { role: 'system', content: systemPrompt }
  ];

  // Live Awwwards inspiration for app/site/game requests: real award-winning
  // site references (title + URL) are injected into the system prompt so the
  // model has concrete visual direction. Best-effort: failure never blocks
  // the request and never fabricates references.
  const appIntent = intent?.type === 'app' || legacyIntent === 'app';
  if (appIntent) {
    try {
      const inspiration = await fetchAwwwardsInspiration(prompt, env?.__INSPIRATION_FETCH);
      if (Array.isArray(inspiration?.sites) && inspiration.sites.length > 0) {
        const refs = inspiration.sites
          .map((site) => `- ${site.title} — ${site.url}`)
          .join('\n');
        apiMessages.push({
          role: 'system',
          content: `Live design inspiration from Awwwards (${inspiration.category} category):\n${refs}\n\nUse these award-winning sites as visual references for layout, typography, colour, and interaction quality. Do NOT claim you visited them; use them as design direction.`
        });
      }
    } catch (error) {
      console.warn('Awwwards inspiration fetch failed (request continues):', safeErrorDetail(error));
    }
  }

  let hasAppendedPrompt = false;
  for (const m of messages) {
    if (m.role && m.content) {
      apiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
      if (typeof m.content === 'string' && (m.content === prompt || m.content === executionPrompt) && m.role === 'user') {
        hasAppendedPrompt = true;
      }
    }
  }
  
  if (!hasAppendedPrompt) {
    apiMessages.push({ role: 'user', content: executionPrompt || prompt });
  }

  // Provider fallback chain: OpenCode Go is preferred and stays preferred;
  // the official DeepSeek API and OpenRouter are fallbacks tried in order
  // only when the preferred provider cannot serve. The same messages travel
  // to every provider, so a fallback resumes the same task — completed work
  // is never restarted.
  //
  // Generations run as long as the model needs and may use as many tokens as
  // it wants: no timeouts and no output caps on the provider calls. The only
  // abort is the client disconnecting (Stop button, tab close), which must
  // not leave paid generations running.
  const clientDisconnectSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  })();

  const result = await runProviderChain(apiMessages, {
    env,
    signal: clientDisconnectSignal,
    store: createTaskStateStore(env),
    sleep: retrySleepFor(env)
  });

  if (result.status === 'retry-scheduled') {
    // The provider could not recover within this request's practical window;
    // the retry schedule is persisted and the task resumes on a later call.
    return jsonResponse(200, {
      taskId: result.taskId,
      status: 'retry-scheduled',
      retryAfterSeconds: result.retryAfterSeconds
    });
  }

  if (result.status === 'cancelled') {
    return jsonResponse(499, { error: 'AI request cancelled.' });
  }

  if (result.content) {
    return jsonResponse(200, { content: result.content, model: result.model });
  }

  console.error(JSON.stringify({
    message: 'AI generation failed',
    error: result.error || 'all providers returned no usable response'
  }));
  return jsonResponse(502, {
    error: 'Unable to generate AI response.',
    detail: result.error || 'all providers returned no usable response'
  });
}

// Test-only sleep override: contract suites drive the worker with real
// fetches and a real clock, so retry backoffs can be collapsed to a fixed
// duration (0 for instant). Unset in production, where backoff runs normally.
function retrySleepFor(env) {
  const overrideMs = Number(env?.__COREZ_RETRY_SLEEP_MS);
  if (!Number.isFinite(overrideMs) || overrideMs < 0) return undefined;
  return () => new Promise((resolve) => setTimeout(resolve, overrideMs));
}

async function saveToR2IfAvailable(env, key, buffer, mimeType = 'image/png') {
  if (env.ASSET_BUCKET && typeof env.ASSET_BUCKET.put === 'function') {
    try {
      await env.ASSET_BUCKET.put(key, buffer, {
        httpMetadata: { contentType: mimeType }
      });
      return `/api/assets/${key}`;
    } catch {
      // R2 is optional: the provider URL is returned when storage fails.
    }
  }
  return null;
}

async function handleImage(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
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

  const openRouterKey = env?.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    // Honest 503: no image provider is configured. Text providers are never
    // routed as fake image providers.
    return jsonResponse(503, {
      error: 'Image generation is unavailable: no image provider is configured on this deployment (set OPENROUTER_API_KEY to enable FLUX image generation).'
    });
  }

  const r2Key = `flux_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;

  // Image generation runs as long as it needs; only a client disconnect
  // aborts (Stop button, tab close).
  const imageClientSignal = (() => {
    const controller = new AbortController();
    if (request.signal) {
      if (request.signal.aborted) controller.abort();
      else request.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  })();

  // FLUX 1 Schnell via OpenRouter: images[0].url, content URLs and
  // data:image payloads are all accepted.
  const imageUrl = await callOpenRouterImage(openRouterKey, prompt, imageClientSignal);
  if (!imageUrl) {
    return jsonResponse(503, {
      error: 'Image generation is unavailable: the image provider did not return an image.'
    });
  }

  try {
    let buffer;
    let mimeType = 'image/png';
    if (imageUrl.startsWith('data:')) {
      const parts = imageUrl.split(',');
      mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(parts[1] || '');
      const u8arr = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      buffer = u8arr.buffer;
    } else {
      const imgResp = await fetch(imageUrl, { signal: imageClientSignal });
      if (imgResp.ok) {
        mimeType = imgResp.headers.get('content-type') || 'image/png';
        buffer = await imgResp.arrayBuffer();
      }
    }

    if (buffer) {
      const r2Url = await saveToR2IfAvailable(env, r2Key, buffer, mimeType);
      return jsonResponse(200, { image: r2Url || imageUrl, model: FLUX_IMAGE_MODEL });
    }
  } catch (err) {
    console.warn('Failed to persist image to R2, returning provider URL:', safeErrorDetail(err));
  }
  return jsonResponse(200, { image: imageUrl, model: FLUX_IMAGE_MODEL });
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
    if (pathname === '/api/search') {
      return handleSearch(request, env);
    }
    if (pathname === '/api/inspiration') {
      return handleInspiration(request, env);
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
