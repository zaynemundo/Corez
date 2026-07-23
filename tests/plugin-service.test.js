// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPlugins,
  getEnabledPlugins,
  togglePlugin,
  registerCustomPlugin,
  uninstallPlugin,
  resetPluginsToDefault
} from '../src/services/pluginService.js';

describe('Plugin Service', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPluginsToDefault();
  });

  it('should load default built-in plugins', () => {
    const plugins = getPlugins();
    expect(plugins.length).toBeGreaterThanOrEqual(4);
    expect(plugins.some(p => p.id === 'market-quote-plugin')).toBe(true);
    expect(plugins.some(p => p.id === 'math-calculator-plugin')).toBe(true);
  });

  it('should return only enabled plugins', () => {
    const enabled = getEnabledPlugins();
    expect(Array.isArray(enabled)).toBe(true);
    expect(enabled.every(p => p.enabled === true)).toBe(true);
  });

  it('should toggle plugin enabled state and persist in localStorage', () => {
    const targetId = 'math-calculator-plugin';
    const initial = getPlugins().find(p => p.id === targetId);
    const initialStatus = initial.enabled;

    const updated = togglePlugin(targetId);
    expect(updated.find(p => p.id === targetId).enabled).toBe(!initialStatus);

    // Check persistence
    const reloaded = getPlugins();
    expect(reloaded.find(p => p.id === targetId).enabled).toBe(!initialStatus);
  });

  it('should register a valid custom plugin', () => {
    const customPlugin = {
      name: 'Custom Weather Widget',
      description: 'Display live weather metrics',
      category: 'productivity',
      type: 'sandboxed-widget',
      code: '<div>Weather Widget</div>'
    };

    const registered = registerCustomPlugin(customPlugin);
    expect(registered.id).toBeDefined();
    expect(registered.id).toContain('custom-');
    expect(registered.enabled).toBe(true);

    const allPlugins = getPlugins();
    expect(allPlugins.some(p => p.id === registered.id)).toBe(true);
  });

  it('should throw an error when registering an invalid plugin', () => {
    expect(() => registerCustomPlugin({ name: '' })).toThrow();
  });

  it('should uninstall a custom plugin', () => {
    const custom = registerCustomPlugin({
      name: 'Temp Plugin',
      description: 'Temp',
      type: 'client-extension'
    });

    expect(getPlugins().some(p => p.id === custom.id)).toBe(true);
    uninstallPlugin(custom.id);
    expect(getPlugins().some(p => p.id === custom.id)).toBe(false);
  });
});
