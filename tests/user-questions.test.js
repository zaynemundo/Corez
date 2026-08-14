import { describe, it, expect } from 'vitest';
import { UserQuestionService, createAskQuestionTool } from '../packages/agent-core/tools/interactive/UserQuestions.js';
import { ToolRegistry } from '../packages/agent-core/tools/index.js';
import { EventBus } from '../packages/agent-core/harness/EventBus.js';

describe('Interactive Clarification & ask_question Tool', () => {
  it('emits question event on event bus and resolves via provider', async () => {
    const eventBus = new EventBus();
    const emittedEvents = [];
    eventBus.subscribe(e => emittedEvents.push(e));

    const service = new UserQuestionService({
      eventBus,
      provider: async ({ questions }) => {
        return {
          answers: [
            { id: questions[0].id, selected: 'Option B' }
          ]
        };
      }
    });

    const response = await service.ask({
      questions: [
        {
          id: 'q_palette',
          question: 'Which color palette do you prefer?',
          options: ['Option A (Dark Modern)', 'Option B (Clean Light)', 'Option C (High Contrast)']
        }
      ]
    });

    expect(response.answers[0].id).toBe('q_palette');
    expect(response.answers[0].selected).toBe('Option B');
    expect(emittedEvents.some(e => e.type === 'interaction.question_asked')).toBe(true);
  });

  it('provides safe automatic fallback when running without UI provider in headless/batch mode', async () => {
    const service = new UserQuestionService();
    const response = await service.ask({
      questions: [
        {
          id: 'q1',
          question: 'Select database engine',
          options: ['PostgreSQL', 'SQLite', 'MongoDB'],
          is_multi_select: false
        }
      ]
    });

    expect(response.answers[0].selected).toBe('PostgreSQL');
  });

  it('integrates seamlessly with ToolRegistry', async () => {
    const service = new UserQuestionService({
      provider: async () => ({
        answers: [{ id: 'q_arch', selected: ['REST API', 'GraphQL'] }]
      })
    });

    const registry = new ToolRegistry();
    const askTool = createAskQuestionTool(service);
    registry.registerTool(askTool);

    expect(registry.getTool('ask_question')).toBeDefined();

    const res = await registry.executeTool('ask_question', {
      questions: [
        {
          id: 'q_arch',
          question: 'Select API architecture',
          options: ['REST API', 'GraphQL', 'gRPC'],
          is_multi_select: true
        }
      ]
    }, { autoApprove: true });

    expect(res.success).toBe(true);
    expect(res.answers[0].selected).toContain('REST API');
  });

  it('rejects empty question arrays', async () => {
    const service = new UserQuestionService();
    await expect(service.ask({ questions: [] })).rejects.toThrow(/at least one question/);
  });
});
