/**
 * Dynamic Model Router — Two-Stage Media Pipeline for corez.pro
 *
 * 1) MiMo V2.5 (mimo-v2.5) — vision + multimodal file understanding.
 *    Every user attachment (image/*, video/*, audio/*, pdf, text, generic file)
 *    is first described by MiMo V2.5 via worker/mimo.js. MiMo runs on the same
 *    OpenCode Zen Go gateway as Muse (same endpoint + key, different model).
 * 2) Muse Spark 1.2 (muse-spark-1.2-contributor) — the unified site-wide
 *    builder for visual tasks, backend logic, algorithms, scripting, general
 *    chat, writing, data and Q&A. It receives MiMo's textual description as
 *    grounded system context and does the final generation.
 *
 * Text-only Muse benefits from MiMo's hidden vision reasoning: MiMo is the
 * eyes/ears, Muse is the hands. See worker/mimo.js for the pre-pass.
 */

export const MODEL_VISUAL = 'muse-spark-1.2-contributor';
export const MODEL_DEFAULT = 'muse-spark-1.2-contributor';

const VISUAL_SKILL_IDS = new Set([
  'visual-creative',
  'frontend-design',
  'frontend-modern-design',
  'apple-design'
]);

const VISUAL_INTENT_TYPES = new Set([
  'design_task',
  'visual_inspection',
  'svg_creation',
  'image_analysis'
]);

const VISUAL_KEYWORDS_PATTERN = /\b(ui|ux|css|styling|styles|layout|design|color|theme|dark mode|light mode|glassmorphism|aesthetic|visual|svg|canvas particle|animation|look|banner|poster|wireframe|mockup|button style|gradient|typography)\b/i;

/**
 * Determines whether a user request requires visual capability (vision, UI/UX layout, CSS styling, SVGs, canvas).
 * 
 * @param {Object} options
 * @param {string} options.prompt User prompt text
 * @param {Object} [options.intent] Intent classification object
 * @param {Object} [options.fineIntent] Fine intent classification object
 * @param {Array} [options.skills] Resolved skills array
 * @param {Array} [options.messages] Chat history messages
 * @returns {boolean}
 */
export function isVisualRequest({ prompt = '', intent = null, fineIntent = null, skills = [], messages = [] } = {}) {
  // 1. Check for image attachments or multimodal vision input
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (Array.isArray(msg?.attachments) && msg.attachments.some(a => a?.type?.startsWith('image/') || (typeof a?.thumb === 'string' && a.thumb.startsWith('data:image/')))) {
        return true;
      }
      if (Array.isArray(msg?.content) && msg.content.some(c => c?.type === 'image_url' || c?.image_url)) {
        return true;
      }
      if (typeof msg?.content === 'string' && /data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(msg.content)) {
        return true;
      }
    }
  }

  // 2. Check for active visual skills
  if (Array.isArray(skills) && skills.some(s => VISUAL_SKILL_IDS.has(s?.id || s))) {
    return true;
  }

  // 3. Check for visual intents
  const primary = intent?.primaryIntent || fineIntent?.primaryIntent || fineIntent?.type || intent?.type;
  if (primary && VISUAL_INTENT_TYPES.has(primary)) {
    return true;
  }

  // 4. Check prompt keywords and intent goal/summary
  const combinedText = `${prompt} ${intent?.goal || ''} ${intent?.summary || ''}`.toLowerCase();
  return VISUAL_KEYWORDS_PATTERN.test(combinedText);
}

/**
 * Selects the optimal model for a given request:
 * - Muse Spark 1.2 for all tasks (unified model)
 * 
 * @param {Object} options Request options (prompt, intent, skills, messages)
 * @param {Object} [env] Worker environment variables
 * @returns {string} Selected model identifier
 */
export function selectModelForRequest(options = {}, env = {}) {
  if (options.model) {
    return options.model;
  }

  const isVisual = isVisualRequest(options);
  if (isVisual) {
    return env?.OPENCODE_VISUAL_MODEL || env?.OPENCODE_BUILD_MODEL || MODEL_VISUAL;
  }

  return env?.OPENCODE_LOGIC_MODEL || env?.OPENCODE_DEFAULT_MODEL || env?.OPENCODE_MODEL || MODEL_DEFAULT;
}

/**
 * Complexity-aware reasoning & temperature selection for Muse Spark 1.2.
 *
 * Reasoning models benefit from explicit effort hints: trivial prompts should
 * not waste reasoning tokens, while high/epic tasks (games, apps, research)
 * need thorough hidden reasoning. Temperature is decoupled: creative tasks
 * need higher randomness, factual/code tasks need lower.
 */
const REASONING_BY_COMPLEXITY = Object.freeze({
  trivial: 'low',
  low: 'low',
  medium: 'medium',
  high: 'high',
  epic: 'xhigh'
});

const TEMPERATURE_BY_COMPLEXITY = Object.freeze({
  trivial: 0.22,
  low: 0.28,
  medium: 0.42,
  high: 0.58,
  epic: 0.64
});

const TEMPERATURE_BY_INTENT = Object.freeze({
  'code-help': 0.22,
  'app': 0.32,
  'game_creation': 0.32,
  'website_creation': 0.32,
  'design_task': 0.38,
  'research-report': 0.28,
  'data-analysis': 0.15,
  'live-data-utilities': 0.15,
  'writing': 0.68,
  'creative-writing': 0.72,
  'marketing-copywriting': 0.70,
  'explanation': 0.45,
  'general': 0.48
});

export function selectReasoningConfig(options = {}, env = {}) {
  if (env?.OPENCODE_REASONING_EFFORT) {
    const eff = String(env.OPENCODE_REASONING_EFFORT).trim().toLowerCase();
    if (['low', 'medium', 'high', 'xhigh'].includes(eff)) {
      const t = Number(env.OPENCODE_TEMPERATURE);
      return {
        reasoning: { effort: eff, exclude: true },
        temperature: Number.isFinite(t) ? Math.max(0, Math.min(2, t)) : undefined
      };
    }
  }
  if (options.reasoning || options.temperature !== undefined) {
    return {
      reasoning: options.reasoning || undefined,
      temperature: options.temperature
    };
  }

  const complexity = String(options.complexity || options.intent?.complexity || options.fineIntent?.complexity || 'medium').toLowerCase();
  const intentType = String(options.intent?.type || options.fineIntent?.type || options.primaryIntent || 'general').toLowerCase();
  const primaryIntent = String(options.primaryIntent || options.intent?.primaryIntent || options.fineIntent?.primaryIntent || '').toLowerCase();
  const skillIds = Array.isArray(options.skills) ? options.skills.map(s => typeof s === 'string' ? s : s.id) : [];

  // Reasoning effort from complexity, with env override via AI_REASONING_EFFORT
  let effort = REASONING_BY_COMPLEXITY[complexity] || 'medium';
  if (env?.AI_REASONING_EFFORT) {
    const e = String(env.AI_REASONING_EFFORT).toLowerCase();
    if (['low', 'medium', 'high', 'xhigh'].includes(e)) effort = e;
  }
  // Hard reasoning for creation harness planning/review and high-stakes skills
  const hasHighReasoningSkill = skillIds.some(id => ['research-report', 'data-analysis', 'live-data-utilities', 'business-planning'].includes(id));
  if (hasHighReasoningSkill && ['low', 'medium'].includes(effort)) effort = 'high';
  if (primaryIntent === 'game_creation' && effort === 'low') effort = 'medium';

  // Temperature: intent takes precedence, then complexity
  let temperature;
  const skillTemp = skillIds.find(id => TEMPERATURE_BY_INTENT[id] !== undefined);
  if (skillTemp) {
    temperature = TEMPERATURE_BY_INTENT[skillTemp];
  } else if (TEMPERATURE_BY_INTENT[primaryIntent] !== undefined) {
    temperature = TEMPERATURE_BY_INTENT[primaryIntent];
  } else if (TEMPERATURE_BY_INTENT[intentType] !== undefined) {
    temperature = TEMPERATURE_BY_INTENT[intentType];
  } else {
    temperature = TEMPERATURE_BY_COMPLEXITY[complexity] ?? 0.42;
  }
  // Creative boost for high/epic complexity on writing tasks
  if (['writing', 'creative-writing'].includes(intentType) && ['high', 'epic'].includes(complexity)) {
    temperature = Math.max(temperature, 0.72);
  }
  // Precision clamp for factual/code tasks
  if (['code-help', 'data-analysis'].includes(intentType) || skillIds.includes('data-analysis')) {
    temperature = Math.min(temperature, 0.32);
  }
  if (env?.AI_TEMPERATURE) {
    const t = Number(env.AI_TEMPERATURE);
    if (Number.isFinite(t)) temperature = Math.max(0, Math.min(2, t));
  }

  return {
    reasoning: { effort, exclude: true },
    temperature: Math.round(temperature * 100) / 100
  };
}
