import { CorezError, ERROR_CODES } from '../contracts/errors.js';
import { createEvent } from '../contracts/events.js';
import { decodeSse } from './sse.js';

function providerError(code, message, details) {
  return new CorezError(code, message, details);
}

export class OpenAICompatibleProvider {
  constructor({ apiKey, endpoint, headers = {}, fetchImpl = globalThis.fetch, timeoutMs = 30_000 }) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.headers = headers;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async *stream({ model, messages = [], tools = [], signal } = {}) {
    if (!this.apiKey) {
      throw providerError(ERROR_CODES.AUTH_MISSING, 'A provider API credential is required.', {
        endpoint: this.endpoint
      });
    }
    if (typeof this.fetchImpl !== 'function') {
      throw providerError(ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'No fetch implementation is available.');
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal.reason);
    if (signal?.aborted) {
      abortFromCaller();
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true });
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('Provider request timed out.'));
    }, this.timeoutMs);

    try {
      let response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...this.headers
          },
          body: JSON.stringify({
            model,
            messages,
            tools: tools.length ? tools : undefined,
            stream: true,
            temperature: 0.2
          }),
          signal: controller.signal
        });
      } catch (error) {
        if (timedOut) {
          throw providerError(ERROR_CODES.PROVIDER_TIMEOUT, 'Provider request timed out.', {
            endpoint: this.endpoint,
            timeoutMs: this.timeoutMs
          });
        }
        if (signal?.aborted) throw error;
        throw providerError(ERROR_CODES.PROVIDER_HTTP_ERROR, 'Provider request failed.', {
          endpoint: this.endpoint,
          cause: error?.message
        });
      }

      if (!response?.ok) {
        throw providerError(ERROR_CODES.PROVIDER_HTTP_ERROR, 'Provider returned an HTTP error.', {
          status: response?.status,
          statusText: response?.statusText,
          endpoint: this.endpoint
        });
      }
      if (!response.body) {
        throw providerError(ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'Provider response did not include a stream body.');
      }

      const toolCalls = new Map();
      let finishReason;
      for await (const data of decodeSse(response.body)) {
        let payload;
        try {
          payload = JSON.parse(data);
        } catch (_error) {
          throw providerError(ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'Provider stream contained invalid JSON.', { data });
        }

        const choice = payload?.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta || {};
        if (typeof delta.content === 'string' && delta.content) {
          yield createEvent('assistant.delta', { text: delta.content });
        }

        for (const call of delta.tool_calls || []) {
          if (!Number.isInteger(call.index)) {
            throw providerError(ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'Tool call was missing its index.', { call });
          }
          const assembled = toolCalls.get(call.index) || { id: undefined, name: undefined, arguments: '' };
          if (call.id) assembled.id = call.id;
          if (call.function?.name) assembled.name = call.function.name;
          if (typeof call.function?.arguments === 'string') {
            assembled.arguments += call.function.arguments;
          }
          toolCalls.set(call.index, assembled);
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
          if (choice.finish_reason === 'tool_calls') {
            for (const [index, call] of [...toolCalls.entries()].sort(([left], [right]) => left - right)) {
              if (!call.id || !call.name) {
                throw providerError(ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'Tool call was incomplete.', { index, call });
              }
              let argumentsValue;
              try {
                argumentsValue = JSON.parse(call.arguments);
              } catch (_error) {
                throw providerError(ERROR_CODES.PROVIDER_RESPONSE_INVALID, 'Tool call arguments were invalid JSON.', {
                  index,
                  id: call.id,
                  name: call.name
                });
              }
              yield createEvent('tool.requested', {
                id: call.id,
                name: call.name,
                arguments: argumentsValue
              });
            }
            toolCalls.clear();
          }
        }
      }

      yield createEvent('assistant.completed', { reason: finishReason });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}
