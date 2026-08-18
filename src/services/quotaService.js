/**
 * Quota & Usage Limit Service
 * Enforces usage limits for unauthenticated (guest) users,
 * while allowing unlimited/elevated quotas for authenticated accounts.
 */

export const GUEST_LIMITS = Object.freeze({
  maxDailyMessages: 5,
  maxDailyPublishes: 1,
  maxDailyImages: 3
});

const GUEST_USAGE_KEY = 'corez_guest_usage';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Retrieves the current day's guest usage record.
 */
export function getGuestUsage() {
  const storage = getStorage();
  const today = getTodayKey();
  const defaultUsage = {
    date: today,
    messagesCount: 0,
    publishesCount: 0,
    imagesCount: 0
  };

  if (!storage) return defaultUsage;

  try {
    const raw = storage.getItem(GUEST_USAGE_KEY);
    if (!raw) return defaultUsage;
    const parsed = JSON.parse(raw);
    if (parsed.date !== today) {
      // New day, reset usage
      storage.setItem(GUEST_USAGE_KEY, JSON.stringify(defaultUsage));
      return defaultUsage;
    }
    return {
      date: today,
      messagesCount: Number(parsed.messagesCount) || 0,
      publishesCount: Number(parsed.publishesCount) || 0,
      imagesCount: Number(parsed.imagesCount) || 0
    };
  } catch {
    return defaultUsage;
  }
}

/**
 * Checks whether an action can be performed based on authentication status and quotas.
 * @param {'message' | 'publish' | 'image'} action
 * @param {boolean} isAuthenticated
 * @returns {{ allowed: boolean, remaining: number, limit: number, used: number }}
 */
export function checkActionQuota(action = 'message', isAuthenticated = false) {
  if (isAuthenticated) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      used: 0,
      isGuest: false
    };
  }

  const usage = getGuestUsage();
  let limit = GUEST_LIMITS.maxDailyMessages;
  let used = usage.messagesCount;

  if (action === 'publish') {
    limit = GUEST_LIMITS.maxDailyPublishes;
    used = usage.publishesCount;
  } else if (action === 'image') {
    limit = GUEST_LIMITS.maxDailyImages;
    used = usage.imagesCount;
  }

  const remaining = Math.max(0, limit - used);
  return {
    allowed: used < limit,
    remaining,
    limit,
    used,
    isGuest: true
  };
}

/**
 * Records a consumed action for a guest user.
 * @param {'message' | 'publish' | 'image'} action
 * @param {boolean} isAuthenticated
 */
export function recordActionUsage(action = 'message', isAuthenticated = false) {
  if (isAuthenticated) return;

  const storage = getStorage();
  const usage = getGuestUsage();

  if (action === 'publish') {
    usage.publishesCount += 1;
  } else if (action === 'image') {
    usage.imagesCount += 1;
  } else {
    usage.messagesCount += 1;
  }

  if (storage) {
    storage.setItem(GUEST_USAGE_KEY, JSON.stringify(usage));
  }
}

/**
 * Resets guest usage (useful for testing or local admin).
 */
export function resetGuestUsage() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(GUEST_USAGE_KEY);
  }
}
