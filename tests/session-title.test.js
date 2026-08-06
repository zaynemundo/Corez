import { describe, it, expect } from 'vitest';
import { generateSessionTitle } from '../src/services/aiService.js';

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
    expect(generateSessionTitle('check AAPL stock price')).toBe('Check AAPL stock price');
    expect(generateSessionTitle('what is a black rose')).toBe('What is a black rose');
    expect(generateSessionTitle('refactor the payment service')).toBe('Refactor payment service');
  });

  it('falls back gracefully', () => {
    expect(generateSessionTitle('')).toBe('New Conversation');
    expect(generateSessionTitle(null)).toBe('New Conversation');
  });
});
