/**
 * Canonical OpenCode Go model identifiers — the single source of truth.
 *
 * CoreZ's text pipeline runs one primary model: DeepSeek V4.1 Flash, served by
 * the OpenCode Go gateway as `deepseek-v4.1-flash`. Muse Spark 1.3 Contributor
 * remains on the allow-list as the explicit rollback model, so an operator can
 * switch back without editing code.
 *
 * Rule: never inline a model id. Import from here so a future rename is one
 * edit and can be covered by a catalog test.
 */

/** OpenCode Go gateway provider id. */
export const OPENCODE_GO_PROVIDER = 'opencode-go';

/**
 * DeepSeek V4.1 Flash — the primary text model for chat, planning, review,
 * builds, the swarm, the agent core and the CLI.
 */
export const DEEPSEEK_V4_1_FLASH = 'deepseek-v4.1-flash';

/** Previous primary model, retained as an explicit rollback option. */
export const MUSE_SPARK_1_3_CONTRIBUTOR = 'muse-spark-1.3-contributor';

/** Default text model. */
export const DEFAULT_TEXT_MODEL = DEEPSEEK_V4_1_FLASH;

/**
 * The complete allow-list of models the text pipeline may request. Anything
 * outside this list is rejected or clamped, so a stale env var or a typo can
 * never silently route text traffic to a different model.
 */
export const ALLOWED_TEXT_MODELS = Object.freeze([
  DEEPSEEK_V4_1_FLASH,
  MUSE_SPARK_1_3_CONTRIBUTOR,
]);

/** True when `model` is an id the text pipeline is permitted to use. */
export function isAllowedTextModel(model) {
  return typeof model === 'string' && ALLOWED_TEXT_MODELS.includes(model.trim());
}

/**
 * Normalizes a candidate model id: returns it when allowed, otherwise the
 * default. Never returns an unroutable or unapproved id.
 *
 * @param {unknown} candidate Model id from config, env or a caller.
 * @returns {string} An allowed model id.
 */
export function resolveTextModel(candidate) {
  return isAllowedTextModel(candidate) ? candidate.trim() : DEFAULT_TEXT_MODEL;
}
