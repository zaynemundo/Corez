/**
 * Account & User Profile Service
 * Manages user profile identity, design preferences, usage metrics,
 * and data backup/export in local storage with privacy protection.
 */

export const ACCOUNT_STORAGE_KEY = 'corez_account_profile';

export const DEFAULT_AVATAR_COLORS = Object.freeze([
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4'  // Cyan
]);

export const DEFAULT_ACCOUNT_PROFILE = Object.freeze({
  id: 'user_local_creator',
  displayName: 'Creator',
  handle: '@creator',
  bio: 'Building AI-crafted web apps & games with CoreZ',
  avatarUrl: '',
  avatarColor: '#3b82f6',
  email: '',
  emailVerified: false,
  emailVerifiedAt: null,
  verifiedEmail: '',
  tier: 'Pro Creator', // 'Free' | 'Pro Creator' | 'Team'
  preferences: {
    defaultArchetype: 'linear-dark',
    defaultViewport: 'desktop',
    autoRunPreview: true,
    compactSidebar: false
  },
  createdAt: '2026-08-18T00:00:00.000Z',
  updatedAt: '2026-08-18T00:00:00.000Z'
});

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

/**
 * Loads the current account profile from local storage or returns the default profile.
 */
export function loadAccountProfile() {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_ACCOUNT_PROFILE };
  }
  try {
    const raw = storage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ACCOUNT_PROFILE };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_ACCOUNT_PROFILE };

    return {
      ...DEFAULT_ACCOUNT_PROFILE,
      ...parsed,
      preferences: {
        ...DEFAULT_ACCOUNT_PROFILE.preferences,
        ...(parsed.preferences || {})
      }
    };
  } catch (err) {
    console.warn('Failed to load account profile:', err);
    return { ...DEFAULT_ACCOUNT_PROFILE };
  }
}

/**
 * Saves updates to the account profile in local storage.
 */
export function saveAccountProfile(updates = {}) {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_ACCOUNT_PROFILE, ...updates };
  }
  try {
    const current = loadAccountProfile();
    const updated = {
      ...current,
      ...updates,
      preferences: {
        ...current.preferences,
        ...(updates.preferences || {})
      },
      updatedAt: new Date().toISOString()
    };
    storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to save account profile:', err);
    return { ...DEFAULT_ACCOUNT_PROFILE, ...updates };
  }
}

/**
 * Computes live usage statistics across sessions and published items.
 */
export function computeAccountStats(sessions = []) {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const totalMessages = safeSessions.reduce((acc, s) => acc + (Array.isArray(s?.messages) ? s.messages.length : 0), 0);

  let publishedCount = 0;
  const storage = getStorage();
  if (storage) {
    try {
      const registryRaw = storage.getItem('corez_published_creations');
      if (registryRaw) {
        const parsed = JSON.parse(registryRaw);
        if (Array.isArray(parsed)) publishedCount = parsed.length;
      }
    } catch {
      publishedCount = 0;
    }
  }

  return {
    totalSessions: safeSessions.length,
    totalMessages,
    publishedCreations: publishedCount,
    tier: 'Pro Creator',
    storageEstimateKb: Math.max(1, Math.round(JSON.stringify(safeSessions).length / 1024))
  };
}

/**
 * Generates an exportable JSON payload containing full account profile and conversation history.
 */
export function exportFullUserData(sessions = []) {
  const profile = loadAccountProfile();
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    profile,
    sessions: Array.isArray(sessions) ? sessions : []
  };
}

/**
 * Resets the local account profile to fresh defaults.
 */
export function resetAccountProfile() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(ACCOUNT_STORAGE_KEY);
  }
  return { ...DEFAULT_ACCOUNT_PROFILE };
}
