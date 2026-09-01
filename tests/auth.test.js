import { describe, it, expect, beforeEach } from 'vitest';
import {
  b64urlEncode,
  b64urlDecode,
  hmacSign,
  hmacVerify,
  createJWT,
  verifyJWT,
  getCookie,
  setCookieHeader,
  clearCookieHeader,
  hashPassword,
  verifyPassword,
  validEmail,
  verifySession as _verifySession,
  requireAuth,
  handleAuth,
  SESSION_COOKIE
} from '../worker/auth.js';

function createMockD1() {
  const users = new Map();
  const inviteCodes = new Map([
    ['COREZ-INVITE-2026', { code: 'COREZ-INVITE-2026', used_by: null, used_at: null, max_uses: 5, uses: 0 }],
    ['COREZ-EXHAUSTED', { code: 'COREZ-EXHAUSTED', used_by: 'used@corez.pro', used_at: Date.now(), max_uses: 1, uses: 1 }]
  ]);

  return {
    users,
    inviteCodes,
    prepare(query) {
      const q = query.trim();
      let bound = [];

      const stmt = {
        bind(...args) {
          bound = args;
          return stmt;
        },
        async first() {
          if (q.includes('COUNT(*)')) {
            return { c: inviteCodes.size };
          }
          if (q.toLowerCase().includes('select * from users where lower(email)=lower(?)')) {
            const email = String(bound[0] || '').toLowerCase();
            return users.get(email) || null;
          }
          if (q.includes('SELECT * FROM users WHERE id=?')) {
            const id = bound[0];
            for (const u of users.values()) {
              if (u.id === id) return u;
            }
            return null;
          }
          if (q.includes('SELECT * FROM invite_codes WHERE code=?')) {
            const code = bound[0];
            return inviteCodes.get(code) || null;
          }
          return null;
        },
        async run() {
          if (q.startsWith('CREATE TABLE')) {
            return { success: true };
          }
          if (q.startsWith('INSERT OR IGNORE INTO invite_codes')) {
            const code = bound[0] || 'COREZ-INVITE-2026';
            if (!inviteCodes.has(code)) {
              inviteCodes.set(code, { code, used_by: null, used_at: null, max_uses: 1, uses: 0 });
            }
            return { success: true };
          }
          if (q.startsWith('INSERT INTO users')) {
            // Support both 5-col (old) and 6-col (with plan)
            const [id, email, password_hash, provider, created_at, plan] = bound;
            const p = plan || 'free';
            // bound length 5 means no plan col; 6 means plan included
            if (bound.length === 6) {
              users.set(email.toLowerCase(), { id, email: email.toLowerCase(), password_hash, provider, created_at, plan: p });
            } else {
              users.set(email.toLowerCase(), { id, email: email.toLowerCase(), password_hash, provider, created_at, plan: 'free' });
            }
            return { success: true };
          }
          if (q.startsWith('UPDATE users SET plan=')) {
            const [plan, id] = bound;
            for (const u of users.values()) {
              if (u.id === id) { u.plan = plan; break; }
            }
            return { success: true };
          }
          if (q.startsWith('UPDATE invite_codes SET uses = uses + 1')) {
            const [used_by, used_at, code] = bound;
            const row = inviteCodes.get(code);
            if (row) {
              row.uses += 1;
              row.used_by = used_by;
              row.used_at = used_at;
            }
            return { success: true };
          }
          return { success: true };
        }
      };
      return stmt;
    }
  };
}

describe('Worker Auth Engine', () => {
  const TEST_SECRET = 'test-super-secret-key-32-characters-long!';

  describe('Base64URL and HMAC helpers', () => {
    it('encodes and decodes buffers correctly', () => {
      const data = new TextEncoder().encode('CoreZ Authentication 2026');
      const encoded = b64urlEncode(data);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');

      const decoded = b64urlDecode(encoded);
      expect(new TextDecoder().decode(decoded)).toBe('CoreZ Authentication 2026');
    });

    it('signs and verifies HMAC signatures', async () => {
      const payload = 'header.payload';
      const sig = await hmacSign(payload, TEST_SECRET);
      expect(typeof sig).toBe('string');
      expect(await hmacVerify(payload, sig, TEST_SECRET)).toBe(true);
      expect(await hmacVerify(payload, sig, 'wrong-secret')).toBe(false);
      expect(await hmacVerify('tampered.payload', sig, TEST_SECRET)).toBe(false);
    });
  });

  describe('JWT Session Tokens', () => {
    it('creates and verifies valid JWT tokens', async () => {
      const payload = { uid: 'user_123', email: 'dev@corez.pro', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = await createJWT(payload, TEST_SECRET);
      expect(token.split('.')).toHaveLength(3);

      const verified = await verifyJWT(token, TEST_SECRET);
      expect(verified).not.toBeNull();
      expect(verified?.uid).toBe('user_123');
      expect(verified?.email).toBe('dev@corez.pro');
    });

    it('rejects expired JWT tokens', async () => {
      const expiredPayload = { uid: 'user_123', email: 'dev@corez.pro', exp: Math.floor(Date.now() / 1000) - 10 };
      const token = await createJWT(expiredPayload, TEST_SECRET);
      const verified = await verifyJWT(token, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('rejects tampered tokens', async () => {
      const payload = { uid: 'user_123', email: 'dev@corez.pro' };
      const token = await createJWT(payload, TEST_SECRET);
      const parts = token.split('.');
      const tampered = parts[0] + '.' + b64urlEncode(new TextEncoder().encode(JSON.stringify({ uid: 'admin' }))) + '.' + parts[2];
      const verified = await verifyJWT(tampered, TEST_SECRET);
      expect(verified).toBeNull();
    });
  });

  describe('PBKDF2 Password Hashing & Verification', () => {
    it('hashes passwords and verifies matching hashes', async () => {
      const password = 'SuperSecurePassword2026!';
      const hash = await hashPassword(password);
      expect(hash).toContain('.');

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('produces unique salts for identical passwords', async () => {
      const password = 'IdenticalPassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe('Cookie Helpers & Email Validator', () => {
    it('validates emails correctly', () => {
      expect(validEmail('user@corez.pro')).toBe(true);
      expect(validEmail('test.name+tag@domain.co.uk')).toBe(true);
      expect(validEmail('invalid-email')).toBe(false);
      expect(validEmail('')).toBe(false);
    });

    it('parses cookies from request headers', () => {
      const req = new Request('https://corez.pro', {
        headers: { Cookie: `${SESSION_COOKIE}=token_abc_123; other=value` }
      });
      expect(getCookie(req, SESSION_COOKIE)).toBe('token_abc_123');
      expect(getCookie(req, 'missing')).toBeNull();
    });

    it('generates secure cookie headers', () => {
      const header = setCookieHeader('my_test_jwt');
      expect(header).toContain(`${SESSION_COOKIE}=my_test_jwt`);
      expect(header).toContain('HttpOnly');
      expect(header).toContain('Secure');
      expect(header).toContain('SameSite=Lax');

      const clearHeader = clearCookieHeader();
      expect(clearHeader).toContain('Max-Age=0');
    });
  });

  describe('handleAuth Route Handlers (D1 Integration)', () => {
    let mockEnv;

    beforeEach(() => {
      mockEnv = {
        DB: createMockD1(),
        AUTH_SECRET: TEST_SECRET
      };
    });

    it('returns 401 on GET /api/auth/me when unauthenticated', async () => {
      const req = new Request('https://corez.pro/api/auth/me', { method: 'GET' });
      const res = await handleAuth(req, mockEnv);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Not authenticated');
    });

    it('returns user on GET /api/auth/me when valid session cookie is provided', async () => {
      const token = await createJWT({ uid: 'u_1', email: 'user@corez.pro', exp: Math.floor(Date.now() / 1000) + 3600 }, TEST_SECRET);
      // Seed user in D1
      await mockEnv.DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)').bind('u_1', 'user@corez.pro', 'hash', 'local', Date.now()).run();

      const req = new Request('https://corez.pro/api/auth/me', {
        method: 'GET',
        headers: { Cookie: `${SESSION_COOKIE}=${token}` }
      });
      const res = await handleAuth(req, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.email).toBe('user@corez.pro');
    });

    it('registers a user on POST /api/auth/signup without invite code (free plan default)', async () => {
      const req = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@corez.pro',
          password: 'Password123!',
          plan: 'free'
        })
      });

      const res = await handleAuth(req, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.user.email).toBe('newuser@corez.pro');
      expect(body.user.plan).toBe('free');

      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain(SESSION_COOKIE);
    });

    it('registers with standard and premium plans and ignores invite codes', async () => {
      const standardReq = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'standard@corez.pro',
          password: 'Password123!',
          plan: 'standard'
        })
      });
      const standardRes = await handleAuth(standardReq, mockEnv);
      expect(standardRes.status).toBe(200);
      expect((await standardRes.json()).user.plan).toBe('standard');

      const premiumReq = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'premium@corez.pro',
          password: 'Password123!',
          plan: 'premium',
          inviteCode: 'IGNORED-CODE'
        })
      });
      const premiumRes = await handleAuth(premiumReq, mockEnv);
      expect(premiumRes.status).toBe(200);
      expect((await premiumRes.json()).user.plan).toBe('premium');

      // Invalid plan falls back to free, but invalid invite code no longer blocks
      const badInviteReq = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'bad@corez.pro',
          password: 'Password123!',
          inviteCode: 'NON-EXISTENT-CODE'
        })
      });
      const badRes = await handleAuth(badInviteReq, mockEnv);
      expect(badRes.status).toBe(200);
      expect((await badRes.json()).user.email).toBe('bad@corez.pro');
    });

    it('authenticates registered user on POST /api/auth/login', async () => {
      // 1. Sign up user (no invite code needed, free plan)
      const signupReq = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'loginuser@corez.pro',
          password: 'LoginPass123!',
          plan: 'free'
        })
      });
      await handleAuth(signupReq, mockEnv);

      // 2. Login with correct password
      const loginReq = new Request('https://corez.pro/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'loginuser@corez.pro',
          password: 'LoginPass123!'
        })
      });
      const loginRes = await handleAuth(loginReq, mockEnv);
      expect(loginRes.status).toBe(200);
      const body = await loginRes.json();
      expect(body.ok).toBe(true);
      expect(body.user.email).toBe('loginuser@corez.pro');

      // 3. Login with wrong password
      const wrongReq = new Request('https://corez.pro/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'loginuser@corez.pro',
          password: 'WrongPassword!'
        })
      });
      const wrongRes = await handleAuth(wrongReq, mockEnv);
      expect(wrongRes.status).toBe(401);
      expect((await wrongRes.json()).error).toBe('Invalid email or password');
    });

    it('clears session on POST /api/auth/logout', async () => {
      const req = new Request('https://corez.pro/api/auth/logout', { method: 'POST' });
      const res = await handleAuth(req, mockEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });
  });

  describe('Session Verification & Require Auth', () => {
    it('bypasses auth when AUTH_SECRET is unset in dev environment', async () => {
      const devEnv = {};
      const req = new Request('https://corez.pro/api/ai');
      const user = await requireAuth(req, devEnv);
      expect(user).toEqual({ uid: 'dev', email: 'dev@corez.pro' });
    });

    it('strictly enforces session when AUTH_SECRET is set', async () => {
      const prodEnv = { AUTH_SECRET: TEST_SECRET };
      const reqUnauth = new Request('https://corez.pro/api/ai');
      const unauthUser = await requireAuth(reqUnauth, prodEnv);
      expect(unauthUser).toBeNull();

      const validToken = await createJWT({ uid: 'u_prod', email: 'admin@corez.pro' }, TEST_SECRET);
      const reqAuth = new Request('https://corez.pro/api/ai', {
        headers: { Cookie: `${SESSION_COOKIE}=${validToken}` }
      });
      const authUser = await requireAuth(reqAuth, prodEnv);
      expect(authUser?.email).toBe('admin@corez.pro');
    });
  });
});
