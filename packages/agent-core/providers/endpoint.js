// Gateway endpoint routing.
//
// OpenCode Go serves the Responses API at /zen/go/v1/responses (the default —
// required by the configured Muse Spark model) and the chat-completions API
// at /zen/go/v1/chat/completions for explicit endpoint overrides. Prefer an
// explicit `api: 'chat' | 'responses'`; the URL is only sniffed as a
// documented fallback for legacy endpoint values.

export function resolveApiMode({ endpoint, api } = {}) {
  if (api === 'chat' || api === 'responses') return api;
  if (
    typeof endpoint === 'string' &&
    /\/responses(?:$|[?#/])/i.test(endpoint.trim())
  ) {
    return 'responses';
  }
  return 'chat';
}

/**
 * Reasoning wire shape per API mode.
 *
 * Callers keep one canonical shape, `{ effort, exclude }` (`exclude: true`
 * means hidden/internal-only, `exclude: false` means visible in the live
 * thinking panel). The Responses API has no `exclude` field and returns no
 * reasoning text unless a summary is requested, so:
 *   - hidden  -> `{ effort }` (no summary: zero reasoning bytes ship)
 *   - visible -> `{ effort, summary: 'auto' }` (summaries stream back as
 *     `response.reasoning_summary_text.delta` events)
 * Chat-completions keeps the OpenRouter-style `{ effort, exclude }` shape
 * untouched. Non-object values pass through for the caller to shape.
 */
export function toGatewayReasoning(reasoning, api) {
  if (!reasoning || typeof reasoning !== 'object') return reasoning;
  if (api !== 'responses') return reasoning;
  const out = {};
  if (typeof reasoning.effort === 'string' && reasoning.effort.trim()) {
    out.effort = reasoning.effort.trim().toLowerCase();
  }
  const wantsSummary =
    reasoning.exclude === false ||
    (reasoning.exclude === undefined && reasoning.summary === 'auto');
  if (wantsSummary) out.summary = 'auto';
  return out;
}

/**
 * True when a canonical reasoning config asks for user-visible reasoning
 * (`exclude: false`) or already carries the Responses summary request.
 */
export function wantsResponsesReasoning(reasoning) {
  if (!reasoning || typeof reasoning !== 'object') return false;
  return reasoning.exclude === false || reasoning.summary === 'auto';
}

/**
 * Strict boolean for the positive "response storage enabled" setting.
 *
 * `OPENCODE_RESPONSES_STORE` is documented as `false` to opt OUT of storing
 * responses. Parsing it with a "feature disabled" helper inverts it
 * (`!isDisabled('false') === true`), which silently enabled storage exactly
 * when the deployment asked to disable it. Only explicit true-like values
 * enable; unset and anything unrecognised default to the safe documented
 * default (enabled, because the live thinking panel needs the summary).
 */
export function parseResponsesStore(value) {
  if (value === undefined || value === null) return true;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return true;
}

/**
 * Additional `include` paths a visible Responses request needs.
 *
 * `include: ['reasoning.encrypted_content']` is the documented way to carry
 * the model's reasoning back to a stateless client. Storing responses may be
 * disabled in some deployments; the caller keeps that decision and a gateway
 * that rejects the parameter still gets a one-shot retry without it (see
 * worker/opencodeClient.js and the agent-core adapter).
 */
export function responsesReasoningIncludes(reasoning, { storeEnabled = true } = {}) {
  if (!wantsResponsesReasoning(reasoning)) return [];
  return storeEnabled ? ['reasoning.encrypted_content'] : [];
}

/**
 * Visibility/transport fields for one Responses request. Merges the base body
 * with the visible-reasoning extras without mutating the caller's payload:
 * `store: true` is required for the OpenAI Responses API to emit reasoning
 * summaries, `include` carries the encrypted reasoning content, and a
 * disabled store is sent as an explicit `store: false` — never as an omitted
 * field that the gateway may default back to true. A caller-supplied `store`
 * value always wins; the opt-out cannot silently re-enable it.
 */
export function withResponsesReasoningPayload(
  body,
  reasoning,
  { storeEnabled = true, includeReasoningContent = storeEnabled } = {},
) {
  const base = body && typeof body === 'object' ? body : {};
  if (!wantsResponsesReasoning(reasoning)) return base;
  const includes = responsesReasoningIncludes(reasoning, {
    storeEnabled: includeReasoningContent,
  });
  const existing = Array.isArray(base.include) ? base.include : [];
  const merged = [...existing];
  for (const item of includes) {
    if (!merged.includes(item)) merged.push(item);
  }
  return {
    ...base,
    store: base.store !== undefined ? base.store : storeEnabled,
    ...(merged.length > 0 ? { include: merged } : {}),
  };
}

/**
 * Carry a deployment's storage opt-out onto any Responses request body.
 *
 * `OPENCODE_RESPONSES_STORE=false` is a privacy requirement, not one of the
 * optional reasoning fields: a body that simply omits `store` leaves the gateway
 * free to default it back on, so the opt-out has to be an explicit
 * `store: false` on EVERY outgoing attempt — including the plain fallback and
 * requests that never asked for a visible reasoning summary. Those are exactly
 * the paths that used to drop it.
 *
 * Only the opt-out is stamped. An enabled store keeps the existing shape (the
 * field is added by the reasoning payload, or left to the gateway's default)
 * rather than asserting `store: true` where the deployment never asked for it.
 * A caller-supplied `store` still wins.
 */
export function withResponsesStoreOptOut(body, storeEnabled) {
  const base = body && typeof body === 'object' ? body : {};
  if (storeEnabled !== false) return base;
  if (base.store !== undefined) return base;
  return { ...base, store: false };
}

/**
 * True when a gateway 400 names the optional reasoning transport fields
 * (`store` / `include` / encrypted reasoning content). Only that specific
 * rejection justifies the one-shot retry without them; any other error must
 * reach the caller unchanged.
 */
export function rejectsReasoningTransport(status, detail) {
  if (Number(status) !== 400) return false;
  return /\b(store|include|encrypted[\s_-]?content|reasoning)\b/i.test(
    String(detail || ''),
  );
}
