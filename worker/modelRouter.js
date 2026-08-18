/**
 * Dynamic Model Router
 * 
 * Routes visual tasks (images, vision inspection, UI/UX, CSS styling, SVGs, canvas art)
 * to Mimo V2.5 (mimo-v2.5), and all other tasks (backend logic, algorithms, scripting,
 * general chat, writing, data, Q&A) to DeepSeek V4 Flash (deepseek-v4-flash).
 */

export const MODEL_VISUAL = 'mimo-v2.5';
export const MODEL_DEFAULT = 'deepseek-v4-flash';

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
 * - Mimo V2.5 for visual tasks (UI/UX, CSS, images, SVGs, canvas)
 * - DeepSeek V4 Flash for everything else (logic, backend, general chat, writing, data)
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
