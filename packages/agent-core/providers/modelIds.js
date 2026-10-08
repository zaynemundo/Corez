/**
 * Canonical OpenCode Go model identifiers — the single source of truth.
 *
 * CoreZ runs one text model: Muse Spark 1.3 Contributor, served by the
 * OpenCode Go gateway as `muse-spark-1.3-contributor`. It replaced DeepSeek
 * V4.1 Flash, whose id was duplicated across the worker, the agent core, the
 * CLI and every `.opencode/agents/*.md` binding; a stale unversioned alias
 * once made the entire specialist swarm unroutable ("Model unavailable:
 * opencode-go/…") while the code still appeared correct.
 *
 * Rule: never inline a model id. Import from here so a future rename is one
 * edit and can be covered by a catalog test.
 */

/** OpenCode Go gateway provider id. */
export const OPENCODE_GO_PROVIDER = 'opencode-go';

/**
 * Muse Spark 1.3 Contributor — the newest Muse Spark text model on the
 * gateway and the only model CoreZ's text pipeline is allowed to request.
 */
export const MUSE_SPARK_1_3_CONTRIBUTOR = 'muse-spark-1.3-contributor';

/**
 * Default (and only allowed) text model for chat, planning, review, builds,
 * the swarm, the agent core and the CLI.
 */
export const DEFAULT_TEXT_MODEL = MUSE_SPARK_1_3_CONTRIBUTOR;

/**
 * The complete allow-list of models the text pipeline may request. Anything
 * outside this list is rejected or clamped, so a stale env var or a typo can
 * never silently route text traffic to a different model.
 */
export const ALLOWED_TEXT_MODELS = Object.freeze([MUSE_SPARK_1_3_CONTRIBUTOR]);

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
