import { OpenAICompatibleProvider } from './openai-compatible.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor({ apiKey, fetchImpl, timeoutMs }) {
    super({
      apiKey,
      fetchImpl,
      timeoutMs,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      headers: { 'HTTP-Referer': 'https://corez.app', 'X-Title': 'CoreZ CLI' }
    });
  }
}
