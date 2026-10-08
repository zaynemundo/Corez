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
