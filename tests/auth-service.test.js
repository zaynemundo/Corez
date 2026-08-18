// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  signUp,
  logIn,
  logInWithVerifiedEmail,
  getCurrentSession,
  getCurrentUser,
  logOut,
  getRegisteredUsers,
  hashPassword,
  AUTH_USERS_KEY,
  AUTH_SESSION_KEY
} from '../src/services/authService.js';

describe('Authentication Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hashes passwords consistently with salt', async () => {
    const hash1 = await hashPassword('secret123');
    const hash2 = await hashPassword('secret123');
    const hashDiff = await hashPassword('other123');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiff);
  });

  it('signs up a new user successfully and establishes an active session', async () => {
    const session = await signUp({
      displayName: 'Jane Creator',
      email: 'jane@corez.pro',
      password: 'password123'
    });

    expect(session).toBeDefined();
    expect(session.token).toMatch(/^sess_/);
    expect(session.user.displayName).toBe('Jane Creator');
    expect(session.user.email).toBe('jane@corez.pro');
    expect(session.user.handle).toBe('@janecreator');

    // Stored in registered users
    const users = getRegisteredUsers();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('jane@corez.pro');

    // Stored in current session
    const current = getCurrentUser();
    expect(current?.email).toBe('jane@corez.pro');
  });

  it('rejects signup with invalid email or short password', async () => {
    await expect(signUp({ displayName: 'Test', email: 'notanemail', password: '123456' }))
      .rejects.toThrow(/valid email/i);

    await expect(signUp({ displayName: 'Test', email: 'test@example.com', password: '123' }))
      .rejects.toThrow(/at least 6 characters/i);
  });

  it('rejects duplicate email registrations', async () => {
    await signUp({ displayName: 'User1', email: 'user@example.com', password: 'password123' });
    await expect(signUp({ displayName: 'User2', email: 'user@example.com', password: 'password456' }))
      .rejects.toThrow(/already exists/i);
  });

  it('logs in an existing user with correct credentials and rejects invalid passwords', async () => {
    await signUp({ displayName: 'Dev', email: 'dev@corez.pro', password: 'mypassword' });
    logOut();
    expect(getCurrentUser()).toBeNull();

    // Wrong password
    await expect(logIn({ email: 'dev@corez.pro', password: 'wrongpassword' }))
      .rejects.toThrow(/incorrect password/i);

    // Correct password
    const session = await logIn({ email: 'dev@corez.pro', password: 'mypassword' });
    expect(session.user.email).toBe('dev@corez.pro');
    expect(getCurrentUser()?.email).toBe('dev@corez.pro');
  });

  it('authenticates and creates verified account via logInWithVerifiedEmail', async () => {
    const session = await logInWithVerifiedEmail('verified@corez.pro');
    expect(session.user.email).toBe('verified@corez.pro');
    expect(session.user.emailVerified).toBe(true);
    expect(session.user.emailVerifiedAt).toBeDefined();
  });

  it('clears session on logout', async () => {
    await signUp({ displayName: 'Alex', email: 'alex@example.com', password: 'password123' });
    expect(getCurrentUser()).not.toBeNull();

    logOut();
    expect(getCurrentUser()).toBeNull();
    expect(getCurrentSession()).toBeNull();
  });
});
