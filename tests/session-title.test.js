import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateSessionTitle, generateAISessionTitle } from '../src/services/aiService.js';

describe('generateSessionTitle', () => {
  it('names games by genre and proper name', () => {
    expect(generateSessionTitle('build a mario-style platformer game called Neon Runner'))
      .toBe('Build a platformer game: Neon Runner');
    expect(generateSessionTitle('make a snake game')).toBe('Build a snake game');
    expect(generateSessionTitle('can you please create an rpg adventure game'))
      .toBe('Build a RPG game');
  });

  it('names websites by subject and proper name', () => {
    expect(generateSessionTitle('create a website for my bakery called Sweet Crumb'))
      .toBe('Create a bakery website: Sweet Crumb');
    expect(generateSessionTitle('design a landing page for a fitness app'))
      .toBe('Create a fitness app website');
  });

  it('names image requests by their subject', () => {
    expect(generateSessionTitle('generate a picture of a black rose'))
      .toBe('Generate a black rose image');
  });

  it('keeps market, explanation, and code-task prompts readable', () => {
    expect(generateSessionTitle('check AAPL stock price')).toBe('Check AAPL price');
    expect(generateSessionTitle('what is a black rose')).toBe('What is a black rose');
    expect(generateSessionTitle('refactor the payment service')).toBe('Refactor payment service');
  });

  it('falls back gracefully', () => {
    expect(generateSessionTitle('')).toBe('New Conversation');
    expect(generateSessionTitle(null)).toBe('New Conversation');
  });
});

describe('generateAISessionTitle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests a title-only generation and returns the AI title', async () => {
    const fetchMock = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      expect(body.titleOnly).toBe(true);
      return Response.json({ title: 'Neon Runner platformer' });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateAISessionTitle('build a mario-style platformer game called Neon Runner'))
      .resolves.toBe('Neon Runner platformer');
  });

  it('trims quoted and punctuated titles from the model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ title: '"Black rose art."' })));
    await expect(generateAISessionTitle('generate a picture of a black rose'))
      .resolves.toBe('"Black rose art."');
  });

  it('falls back to the heuristic title when the AI title is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ title: null })));
    await expect(generateAISessionTitle('make a snake game')).resolves.toBe('Build a snake game');
  });

  it('falls back to the heuristic title when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'down' }, { status: 502 })));
    await expect(generateAISessionTitle('make a snake game')).resolves.toBe('Build a snake game');
  });

  it('skips the network for empty prompts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateAISessionTitle('')).resolves.toBe('New Conversation');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
