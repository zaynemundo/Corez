import { CorezError, ERROR_CODES } from '../contracts/errors.js';

export class FallbackProvider {
  constructor(primary, fallback) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async *stream(args = {}) {
    if (!this.primary) {
      if (this.fallback) {
        yield* this.fallback.stream(args);
        return;
      }
      throw new CorezError(ERROR_CODES.AUTH_MISSING, 'No valid provider credentials configured.');
    }

    let yieldedAny = false;
    try {
      for await (const event of this.primary.stream(args)) {
        yieldedAny = true;
        yield event;
      }
      if (yieldedAny) return;
    } catch (primaryErr) {
      if (args?.signal?.aborted) throw primaryErr;
      if (this.fallback && !yieldedAny) {
        console.warn('Primary provider (OpenCode Go) failed, falling back to OpenRouter:', primaryErr.message);
        yield* this.fallback.stream(args);
        return;
      }
      throw primaryErr;
    }
  }
}
