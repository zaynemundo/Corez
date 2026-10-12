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
 * Additional `include` paths a visible Responses request needs.
 *
 * `include: ['reasoning.encrypted_content']` is the documented way to carry
 * the model's reasoning back to a stateless client. It keeps the key a
 * decision of the caller (`responsesStoreEnabled`): storing responses may be
 * disabled in some deployments, and a gateway that rejects the parameter
 * still gets a one-shot retry without it (see worker/opencodeClient.js and
 * the agent-core adapter).
 */
export function responsesReasoningIncludes(reasoning, { storeEnabled = true } = {}) {
  if (!wantsResponsesReasoning(reasoning)) return [];
  return storeEnabled ? ['reasoning.encrypted_content'] : [];
}

/**
 * Visibility/transport fields for one Responses request. Merges the base body
 * with the visible-reasoning extras without mutating the caller's payload:
 * `store: true` is required for the OpenAI Responses API to emit reasoning
 * summaries, and `include` carries the encrypted reasoning content. Existing
 * caller values win (an explicit `store: false` is respected).
 */
export function withResponsesReasoningPayload(body, reasoning, { storeEnabled = true } = {}) {
  const base = body && typeof body === 'object' ? body : {};
  const includes = responsesReasoningIncludes(reasoning, { storeEnabled });
  if (includes.length === 0) return base;
  const existing = Array.isArray(base.include) ? base.include : [];
  const merged = [...existing];
  for (const item of includes) {
    if (!merged.includes(item)) merged.push(item);
  }
  return {
    ...base,
    ...(base.store === undefined && storeEnabled ? { store: true } : {}),
    ...(merged.length > 0 ? { include: merged } : {}),
  };
}
