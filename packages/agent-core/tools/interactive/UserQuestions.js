// UserQuestions: Interactive clarification and decision service for CoreZ AI.
// Inspired by DeepSeek Harness dsh-user-questions / tool-ask-user.
// Allows agents to pause work and ask structured multiple-choice questions or review plans.

import { PERMISSION_CATEGORIES } from '../../permissions/index.js';

export class UserQuestionService {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.provider = options.provider || null;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 30_000;
  }

  setProvider(provider) {
    this.provider = provider;
  }

  /**
   * Prompts the user with structured questions.
   * @param {object} request
   * @param {Array<{ id?: string, question: string, options: string[], is_multi_select?: boolean, detail?: string, intent?: string }>} request.questions
   * @param {number} [request.timeoutMs]
   * @param {AbortSignal} [request.signal]
   * @param {object} [request.defaultFallback]
   * @returns {Promise<{ answers: Array<{ id: string, selected: string[]|string, custom?: string }> }>}
   */
  async ask(request = {}) {
    const { questions, timeoutMs: _timeoutMs = this.defaultTimeoutMs, signal, defaultFallback } = request;

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('ask_question requires at least one question in the questions array.');
    }

    // Normalize question IDs
    const normalizedQuestions = questions.map((q, idx) => ({
      id: q.id || `q_${idx + 1}`,
      question: q.question,
      options: Array.isArray(q.options) ? q.options : [],
      is_multi_select: q.is_multi_select === true,
      detail: q.detail || null,
      intent: q.intent || 'clarification'
    }));

    if (this.eventBus) {
      this.eventBus.emit({
        type: 'interaction.question_asked',
        questions: normalizedQuestions,
        timeoutMs: _timeoutMs,
        timestamp: new Date().toISOString()
      });
    }

    if (typeof this.provider === 'function') {
      return this.provider({ questions: normalizedQuestions, timeoutMs: _timeoutMs, signal });
    }

    if (this.provider && typeof this.provider.ask === 'function') {
      return this.provider.ask({ questions: normalizedQuestions, timeoutMs: _timeoutMs, signal });
    }

    // If defaultFallback is provided, resolve immediately (for automation/headless)
    if (defaultFallback) {
      return defaultFallback;
    }

    // Default automated fallback: pick the first recommended or default option
    const answers = normalizedQuestions.map(q => ({
      id: q.id,
      selected: q.options.length > 0 ? (q.is_multi_select ? [q.options[0]] : q.options[0]) : 'confirmed'
    }));

    return { answers };
  }
}

/**
 * Creates the ask_question tool definition for CoreZ ToolRegistry.
 */
export function createAskQuestionTool(userQuestionService) {
  return {
    name: 'ask_question',
    category: PERMISSION_CATEGORIES.READ,
    description: 'Ask the user one or more structured multiple-choice questions to clarify underspecified requirements, solicit design feedback, or review a proposed plan.',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: 'The list of questions to ask.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Optional unique ID for the question' },
              question: { type: 'string', description: 'The question title/prompt' },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Selectable answer options'
              },
              is_multi_select: { type: 'boolean', description: 'True to allow selecting multiple options' },
              detail: { type: 'string', description: 'Optional supporting context or plan detail' },
              intent: {
                type: 'string',
                enum: ['clarification', 'plan-review', 'choice'],
                description: 'Presentation intent for the UI'
              }
            },
            required: ['question', 'options']
          }
        }
      },
      required: ['questions']
    },
    execute: async (args) => {
      try {
        const response = await userQuestionService.ask({
          questions: args.questions
        });
        return {
          success: true,
          answers: response.answers,
          summary: `User answered ${response.answers.length} question(s).`
        };
      } catch (err) {
        return {
          success: false,
          error: err.message || 'User interaction failed.'
        };
      }
    }
  };
}
