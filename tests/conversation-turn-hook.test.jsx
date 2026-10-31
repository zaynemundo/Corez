// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const hostedCalls = [];
vi.mock('../src/services/aiService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateSessionTitle: () => 'Hello conversation',
    generateHostedAIResponse: vi.fn(
      async (prompt, intent, history, signal, options) => {
        hostedCalls.push({ prompt, history: history.map((message) => ({ ...message })), options });
        options?.onDelta?.('Hello ');
        options?.onDelta?.('there');
        return 'Hello there';
      },
    ),
  };
});

const appendCalls = [];
vi.mock('../src/services/chatService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createChat: vi.fn(async () => ({
      id: 'conv1',
      title: 'Hello conversation',
      chatMode: 'conversation',
      personas: [],
      createdAt: 1,
      updatedAt: 1,
      titleUpdatedAt: 1,
      active: true,
    })),
    getChat: vi.fn(async () => ({ messages: [] })),
    appendMessage: vi.fn(async (_id, payload) => {
      appendCalls.push(payload);
      return payload;
    }),
  };
});

import { useConversationTurnExecution } from '../src/hooks/useConversationTurnExecution.js';

const personas = [
  { id: 'p1', name: 'John', handle: 'john', instructions: 'Warm.' },
  { id: 'p2', name: 'Scarlett', handle: 'scarlett', instructions: 'Bright.' },
];

function setup() {
  let sessions = [];
  const setSessions = vi.fn((updater) => {
    sessions =
      typeof updater === 'function' ? updater(sessions) : updater;
  });
  const setters = {
    isThinking: false,
    setIsThinking: vi.fn(),
    setSwarmVisible: vi.fn(),
    setBuildPhase: vi.fn(),
    setStreamingSessionId: vi.fn(),
    setStreamingContent: vi.fn(),
    setStreamingThinking: vi.fn(),
    setStreamingSpeaker: vi.fn(),
    setIsThinkingOpen: vi.fn(),
    setAttachments: vi.fn(),
    setChatInput: vi.fn(),
    navigate: vi.fn(),
  };
  const refs = {
    streamingThinkingRef: { current: '' },
    thinkingStartedAtRef: { current: 0 },
    abortControllerRef: { current: null },
  };
  const { result } = renderHook(() =>
    useConversationTurnExecution({
      activeSessionId: null,
      activeSession: null,
      setSessions,
      newConversationPersonas: personas,
      ...setters,
      ...refs,
    }),
  );
  return { result, getSessions: () => sessions, ...setters };
}

beforeEach(() => {
  hostedCalls.length = 0;
  appendCalls.length = 0;
});

describe('conversation turn orchestration', () => {
  it('creates one turn and streams both AI replies in order', async () => {
    const ctx = setup();
    await act(async () => {
      await ctx.result.current.handleSendMessage('Hello');
    });

    expect(hostedCalls).toHaveLength(2);
    expect(hostedCalls[0].prompt).toContain('You are John');
    expect(hostedCalls[1].prompt).toContain('You are Scarlett');
    expect(hostedCalls[0].history).toEqual([
      { role: 'user', content: 'Hello' },
    ]);
    expect(hostedCalls[1].history).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'John: Hello there' },
    ]);

    const messages = ctx.getSessions()[0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      speakerName: 'John',
      content: 'Hello there',
      modelId: 'deepseek-v4.1-flash',
    });
    expect(messages[2]).toMatchObject({
      role: 'assistant',
      speakerName: 'Scarlett',
      content: 'Hello there',
    });

    expect(appendCalls.filter((call) => call.role === 'user')).toHaveLength(1);
    expect(appendCalls.filter((call) => call.role === 'assistant')).toHaveLength(2);
  });

  it('only calls the mentioned persona', async () => {
    const ctx = setup();
    await act(async () => {
      await ctx.result.current.handleSendMessage('@scarlett are you there?');
    });
    expect(hostedCalls).toHaveLength(1);
    expect(hostedCalls[0].prompt).toContain('You are Scarlett');
    expect(hostedCalls[0].history).toEqual([
      { role: 'user', content: '@scarlett are you there?' },
    ]);
  });
});
