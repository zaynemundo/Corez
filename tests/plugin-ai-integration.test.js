// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildPluginContextPrompt,
  generateLocalAIResponse
} from '../src/services/aiService.js';
import {
  togglePlugin,
  resetPluginsToDefault,
  registerCustomPlugin
} from '../src/services/pluginService.js';

describe('AI Plugin Context Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPluginsToDefault();
  });

  it('should build plugin context prompt listing active plugins', () => {
    const promptText = buildPluginContextPrompt();
    expect(typeof promptText).toBe('string');
    expect(promptText).toContain('ACTIVE PLUGINS & CAPABILITIES');
    expect(promptText).toContain('Live Financial Market Quotes');
    expect(promptText).toContain('Interactive Math & Graphing Calculator');
  });

  it('should reflect disabled plugins in prompt context', () => {
    togglePlugin('market-quote-plugin');
    const promptText = buildPluginContextPrompt();
    expect(promptText).not.toContain('Live Financial Market Quotes');
    expect(promptText).toContain('Interactive Math & Graphing Calculator');
  });

  it('should include custom registered plugins in AI prompt context', () => {
    registerCustomPlugin({
      name: 'Weather Live Forecast Plugin',
      description: 'Provides weather forecast data',
      type: 'ai-tool'
    });

    const promptText = buildPluginContextPrompt();
    expect(promptText).toContain('Weather Live Forecast Plugin');
    expect(promptText).toContain('Provides weather forecast data');
  });

  it('should incorporate plugin context in local AI response generation', async () => {
    registerCustomPlugin({
      name: 'Unit Conversion Plugin',
      description: 'Converts metric to imperial units',
      type: 'ai-tool'
    });

    const response = await generateLocalAIResponse('help me with unit conversion');
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(10);
  });
});
