// Gateway endpoint routing.
//
// OpenCode Go/Zen serves the chat-completions API (the default) and the
// retired responses API when an endpoint override explicitly selects it.
// Prefer an explicit `api: 'chat' | 'responses'`; the URL is only sniffed as
// a documented fallback for legacy endpoint values.

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
