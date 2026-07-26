import { OpenAICompatibleProvider } from './openai-compatible.js';

export class OpenCodeGoProvider extends OpenAICompatibleProvider {
  constructor({ apiKey, fetchImpl, timeoutMs }) {
    super({
      apiKey,
      fetchImpl,
      timeoutMs,
      endpoint: 'https://api.opencode.ai/v1/chat/completions'
    });
  }
}
