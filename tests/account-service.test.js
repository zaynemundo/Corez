// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadAccountProfile,
  saveAccountProfile,
  computeAccountStats,
  exportFullUserData,
  resetAccountProfile,
  DEFAULT_ACCOUNT_PROFILE,
  ACCOUNT_STORAGE_KEY
} from '../src/services/accountService.js';

describe('Account Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default profile when localStorage is empty', () => {
    const profile = loadAccountProfile();
    expect(profile.displayName).toBe('Creator');
    expect(profile.handle).toBe('@creator');
    expect(profile.tier).toBe('Pro Creator');
    expect(profile.preferences.defaultArchetype).toBe('linear-dark');
  });

  it('saves and loads profile updates in localStorage', () => {
    saveAccountProfile({
      displayName: 'Alex Rivera',
      handle: '@alex',
      bio: 'Fullstack AI builder',
      preferences: {
        defaultArchetype: 'apple-glass',
        defaultViewport: 'mobile'
      }
    });

    const loaded = loadAccountProfile();
    expect(loaded.displayName).toBe('Alex Rivera');
    expect(loaded.handle).toBe('@alex');
    expect(loaded.bio).toBe('Fullstack AI builder');
    expect(loaded.preferences.defaultArchetype).toBe('apple-glass');
    expect(loaded.preferences.defaultViewport).toBe('mobile');
  });

  it('computes live usage statistics across sessions', () => {
    const sessions = [
      { id: 's1', messages: [{ role: 'user' }, { role: 'assistant' }] },
      { id: 's2', messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }] }
    ];
    localStorage.setItem('corez_published_creations', JSON.stringify(['app1', 'app2', 'app3']));

    const stats = computeAccountStats(sessions);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalMessages).toBe(5);
    expect(stats.publishedCreations).toBe(3);
    expect(stats.tier).toBe('Pro Creator');
    expect(stats.storageEstimateKb).toBeGreaterThanOrEqual(1);
  });

  it('generates complete exportable user data JSON', () => {
    saveAccountProfile({ displayName: 'Dev Lead' });
    const sessions = [{ id: 's1', messages: [] }];
    const exported = exportFullUserData(sessions);

    expect(exported.version).toBe('1.0.0');
    expect(exported.profile.displayName).toBe('Dev Lead');
    expect(exported.sessions).toEqual(sessions);
    expect(exported.exportedAt).toBeDefined();
  });

  it('resets local account profile back to fresh defaults', () => {
    saveAccountProfile({ displayName: 'Temporary User' });
    const reset = resetAccountProfile();

    expect(reset.displayName).toBe('Creator');
    expect(localStorage.getItem(ACCOUNT_STORAGE_KEY)).toBeNull();
  });
});
