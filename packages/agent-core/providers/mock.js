import { CorezError, ERROR_CODES } from '../contracts/errors.js';

export class MockProvider {
  constructor({ turns = [] } = {}) {
    this.turns = [...turns];
  }

  async *stream(_request) {
    if (this.turns.length === 0) {
      throw new CorezError(
        ERROR_CODES.PROVIDER_RESPONSE_INVALID,
        'Mock provider script is exhausted.'
      );
    }

    const turn = this.turns.shift();
    const events = Array.isArray(turn) ? turn : turn?.events;
    if (!Array.isArray(events)) {
      throw new CorezError(
        ERROR_CODES.PROVIDER_RESPONSE_INVALID,
        'Mock provider turn must contain an events array.'
      );
    }

    for (const event of events) yield event;
  }
}
