import { describe, it, expect } from 'vitest';
import {
  extractConversationTopics,
  extractUserMemory,
  formatUserMemory,
  inferUserStyle,
} from '../src/utils/conversationMemory.js';

const user = (content) => ({ role: 'user', content });
const assistant = (content) => ({ role: 'assistant', content });

describe('conversation user memory', () => {
  it('extracts stable facts the user actually stated', () => {
    const memory = extractUserMemory([
      user('My name is Sam and I love jazz.'),
      user('I work as a game designer.'),
      user('Remember that I hate cilantro.'),
    ]);
    expect(memory).toEqual(
      expect.arrayContaining([
        { label: 'Name', value: 'Sam' },
        { label: 'Likes', value: 'jazz' },
        { label: 'Work', value: 'a game designer' },
        { label: 'Remembered', value: 'I hate cilantro' },
      ]),
    );
  });

  it('does not learn from assistant messages', () => {
    expect(
      extractUserMemory([assistant('My name is Octopus and I love riddles.')]),
    ).toEqual([]);
  });

  it('formats an honest empty memory instead of inventing facts', () => {
    expect(formatUserMemory([])).toContain('Do not invent');
  });
});

describe('conversation style adaptation', () => {
  it('detects brief casual writing', () => {
    expect(inferUserStyle([user('yo'), user('sup')])).toContain('casual');
  });

  it('asks for concise replies when the user is brief', () => {
    expect(inferUserStyle([user('ok'), user('sure')])).toContain('concise');
  });
});

describe('conversation topic cooldown', () => {
  it('spots a fact the assistant already leaned on', () => {
    const topics = extractConversationTopics([
      assistant('Octopuses have three hearts and blue blood.'),
    ]);
    expect(topics).toContain('octopus');
    expect(topics).toContain('heart');
  });

  it('stays empty when only the user has spoken', () => {
    expect(extractConversationTopics([user('Tell me about octopuses.')])).toEqual(
      [],
    );
  });
});
