/**
 * Authentication Service
 * Manages user registration (Sign Up), authentication (Log In),
 * password hashing via Web Crypto, session token storage, and Magic OTP codes.
 */

export const AUTH_USERS_KEY = 'corez_auth_users';
export const AUTH_SESSION_KEY = 'corez_auth_session';

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

/**
 * Computes a secure SHA-256 hash with salt for local password storage.
 */
export async function hashPassword(password, salt = 'corez_salt_2026') {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + ':' + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback simple hash for non-crypto environments
  let hash = 0;
  const str = password + ':' + salt;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'simple_' + Math.abs(hash).toString(16);
}

/**
 * Loads all registered users from storage.
 */
export function getRegisteredUsers() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(AUTH_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves the registered users list to storage.
 */
function saveRegisteredUsers(users) {
  const storage = getStorage();
  if (storage) {
    storage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
  }
}

/**
 * Registers a new user account.
 */
export async function signUp({ displayName, email, password, emailVerified = true }) {
  if (!displayName || !displayName.trim()) {
    throw new Error('Display name is required.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('A valid email address is required.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const users = getRegisteredUsers();

  if (users.some(u => u.email === cleanEmail)) {
    throw new Error('An account with this email address already exists.');
  }

  const passwordHash = await hashPassword(password);
  const handle = '@' + displayName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15) || '@user';
  
  const newUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    displayName: displayName.trim(),
    email: cleanEmail,
    handle,
    bio: 'CoreZ Creative Member',
    avatarColor: '#3b82f6',
    passwordHash,
    tier: 'Pro Creator',
    emailVerified: Boolean(emailVerified),
    emailVerifiedAt: emailVerified ? new Date().toISOString() : null,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveRegisteredUsers(users);

  // Automatically sign in upon successful registration
  return createSession(newUser);
}

/**
 * Authenticates a user with email and password.
 */
export async function logIn({ email, password }) {
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const users = getRegisteredUsers();
  const user = users.find(u => u.email === cleanEmail);

  if (!user) {
    throw new Error('No account found with this email address.');
  }

  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    throw new Error('Incorrect password. Please try again.');
  }

  return createSession(user);
}

/**
 * Authenticates or completes login using a verified email from verification@corez.pro.
 */
export async function logInWithVerifiedEmail(email) {
  const cleanEmail = email.trim().toLowerCase();
  const users = getRegisteredUsers();
  let user = users.find(u => u.email === cleanEmail);

  if (!user) {
    // Create quick account for verified email
    const displayName = cleanEmail.split('@')[0];
    user = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
      email: cleanEmail,
      handle: `@${displayName.replace(/[^a-z0-9_]/g, '')}`,
      bio: 'CoreZ Creative Member',
      avatarColor: '#6366f1',
      tier: 'Pro Creator',
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveRegisteredUsers(users);
  } else {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date().toISOString();
    saveRegisteredUsers(users);
  }

  return createSession(user);
}

/**
 * Creates an active auth session for the user.
 */
export function createSession(user) {
  const storage = getStorage();
  const session = {
    token: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      handle: user.handle,
      bio: user.bio,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      tier: user.tier || 'Pro Creator',
      emailVerified: user.emailVerified || false,
      emailVerifiedAt: user.emailVerifiedAt || null
    },
    createdAt: new Date().toISOString()
  };

  if (storage) {
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    // Also sync with account profile
    storage.setItem('corez_account_profile', JSON.stringify(session.user));
  }

  return session;
}

/**
 * Retrieves the current active user session.
 */
export function getCurrentSession() {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Returns the currently authenticated user profile or null.
 */
export function getCurrentUser() {
  const session = getCurrentSession();
  return session?.user || null;
}

/**
 * Logs out the current user session.
 */
export function logOut() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(AUTH_SESSION_KEY);
  }
  return true;
}
