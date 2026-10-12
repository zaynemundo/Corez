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
  verifySession,
  verifySession as _verifySession,
  requireAuth,
  handleAuth,
  ensureTables,
  isProductionRequest,
  SESSION_COOKIE
} from '../worker/auth.js';
import { createSqliteD1 } from './helpers/sqliteD1.js';

function createMockD1() {
  const users = new Map();
  const passwordResets = new Map();
  const inviteCodes = new Map([
    ['COREZ-INVITE-2026', { code: 'COREZ-INVITE-2026', used_by: null, used_at: null, max_uses: 5, uses: 0 }],
    ['COREZ-EXHAUSTED', { code: 'COREZ-EXHAUSTED', used_by: 'used@corez.pro', used_at: Date.now(), max_uses: 1, uses: 1 }]
  ]);

  return {
    users,
    passwordResets,
    inviteCodes,
    async batch(statements) {
      // Sequential with real change metadata, mirroring D1's atomic batch for
      // the single-use token claim (used=0 conditional update).
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      return results;
    },
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
          if (q.includes('SELECT * FROM password_resets WHERE token=?')) {
            return passwordResets.get(String(bound[0] || '')) || null;
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
          if (q.startsWith('UPDATE users SET password_hash=?')) {
          // The guarded password write: bound is (hash, changed_at, user_id,
          // reset_id). Mirrors the SQL guard — when the token is no longer
          // unused this request owns nothing, so it writes nothing. Modelling
          // the guard is what makes the race test below meaningful: without it
          // both passwords were written and the test still passed.
          const [hash, changedAt, id, resetId] = bound;
          let claimable = false;
          for (const row of passwordResets.values()) {
            if (row.id === resetId && Number(row.used) === 0) {
              claimable = true;
              break;
            }
          }
          if (!claimable) return { success: true, meta: { changes: 0 } };
          for (const u of users.values()) {
            if (u.id === id) {
              u.password_hash = hash;
              u.password_changed_at = changedAt;
            }
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (q.startsWith('UPDATE users SET')) {
            const id = bound[bound.length - 1];
            for (const u of users.values()) {
              if (u.id === id) {
                if (/password_hash\s*=/.test(q)) u.password_hash = bound[0];
                if (/password_changed_at\s*=/.test(q)) u.password_changed_at = bound[1];
                if (/SET plan=/.test(q)) u.plan = bound[0];
              }
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith('INSERT INTO password_resets')) {
            const [id, email, token, expires_at, created_at, user_id] = bound;
            passwordResets.set(token, {
              id,
              email,
              token,
              expires_at,
              created_at,
              user_id: user_id ?? null,
              used: 0,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith('UPDATE password_resets SET used=1 WHERE id=? AND used=0')) {
            const [id] = bound;
            for (const row of passwordResets.values()) {
              if (row.id === id && Number(row.used) === 0) {
                row.used = 1;
                return { success: true, meta: { changes: 1 } };
              }
            }
            return { success: true, meta: { changes: 0 } };
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

    it('does not run table setup for the anonymous session check', async () => {
      // The 401 path reads nothing: running fourteen DDL round-trips before it
      // made the public front door wait seconds for an empty answer.
      const ddl = [];
      const db = mockEnv.DB;
      const prepare = db.prepare.bind(db);
      db.prepare = (query) => {
        if (/^\s*(CREATE|ALTER)\b/i.test(query)) ddl.push(query.trim().slice(0, 60));
        return prepare(query);
      };

      const res = await handleAuth(
        new Request('https://corez.pro/api/auth/me', { method: 'GET' }),
        mockEnv
      );

      expect(res.status).toBe(401);
      expect(ddl).toEqual([]);
    });

    it('creates tables once per D1 binding instead of on every call', async () => {
      const ddl = [];
      const db = mockEnv.DB;
      const prepare = db.prepare.bind(db);
      db.prepare = (query) => {
        if (/^\s*(CREATE|ALTER)\b/i.test(query)) ddl.push(query.trim().slice(0, 60));
        return prepare(query);
      };

      await ensureTables(mockEnv);
      const afterFirstPass = ddl.length;
      expect(afterFirstPass).toBeGreaterThan(0);

      await ensureTables(mockEnv);
      await ensureTables(mockEnv);

      expect(ddl.length).toBe(afterFirstPass);
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

    it('refuses to grant a paid plan at signup', async () => {
      // Paid plans come only from the verified payment flow (the Ziina webhook
      // and reconcilePendingSubscriptions both confirm payment before
      // activating). A signup request must never be able to self-provision one.
      //
      // Each request carries its own CF-Connecting-IP: the auth rate limiter is
      // keyed by that header (10 attempts/min), so a shared bucket would make
      // this test trip the limiter and mask the behaviour under test.
      let ip = 0;
      for (const plan of ['standard', 'premium', 'basic', 'enterprise']) {
        const req = new Request('https://corez.pro/api/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': `10.9.0.${++ip}`
          },
          body: JSON.stringify({
            email: `${plan}@corez.pro`,
            password: 'Password123!',
            plan
          })
        });
        const res = await handleAuth(req, mockEnv);
        expect(res.status, `plan "${plan}" must not be granted at signup`).toBe(400);
        const body = await res.json();
        expect(body.code).toBe('plan_requires_payment');
      }

      // No account may have been created by those refused requests.
      const loginReq = new Request('https://corez.pro/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.1.1' },
        body: JSON.stringify({ email: 'premium@corez.pro', password: 'Password123!' })
      });
      expect((await handleAuth(loginReq, mockEnv)).status).not.toBe(200);
    });

    it('registers a free account and ignores invite codes', async () => {
      const freeReq = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.2.1' },
        body: JSON.stringify({
          email: 'explicit-free@corez.pro',
          password: 'Password123!',
          plan: 'free'
        })
      });
      const freeRes = await handleAuth(freeReq, mockEnv);
      expect(freeRes.status).toBe(200);
      expect((await freeRes.json()).user.plan).toBe('free');

      // No plan field at all still works (the browser sends none for a plain signup)
      const noPlanReq = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.2.2' },
        body: JSON.stringify({ email: 'noplan@corez.pro', password: 'Password123!' })
      });
      const noPlanRes = await handleAuth(noPlanReq, mockEnv);
      expect(noPlanRes.status).toBe(200);
      expect((await noPlanRes.json()).user.plan).toBe('free');

      // Invalid invite code no longer blocks signup
      const badInviteReq = new Request('https://corez.pro/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.2.3' },
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

    it('never returns a password-reset token in the response by default', async () => {
      mockEnv.DB.users.set('reset@corez.pro', {
        id: 'u_reset', email: 'reset@corez.pro', password_hash: 'hash',
        provider: 'local', created_at: Date.now(), plan: 'free'
      });
      const req = new Request('https://corez.pro/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'reset@corez.pro' })
      });
      const res = await handleAuth(req, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.token).toBeUndefined();
      expect(body.resetUrl).toBeUndefined();
    });

    it('returns a password-reset token only with the explicit dev opt-in', async () => {
      mockEnv.DB.users.set('optin@corez.pro', {
        id: 'u_optin', email: 'optin@corez.pro', password_hash: 'hash',
        provider: 'local', created_at: Date.now(), plan: 'free'
      });
      mockEnv.AUTH_RESET_TOKEN_IN_RESPONSE = '1';
      const req = new Request('https://corez.pro/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'optin@corez.pro' })
      });
      const res = await handleAuth(req, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(typeof body.token).toBe('string');
      expect(body.token.length).toBeGreaterThan(10);
    });
  });

  describe('Session Verification & Require Auth', () => {
    it('bypasses auth only on non-production hosts when AUTH_SECRET is unset', async () => {
      // Local development and the contract-test harness keep the convenience.
      const devEnv = {};
      expect(await requireAuth(new Request('http://localhost:8787/api/ai'), devEnv)).toEqual({
        uid: 'dev',
        email: 'dev@corez.pro',
      });
      expect(await requireAuth(new Request('https://corez.test/api/ai'), devEnv)).toEqual({
        uid: 'dev',
        email: 'dev@corez.pro',
      });
      // A production host without a secret must fail closed, never hand out
      // the development identity.
      expect(await requireAuth(new Request('https://corez.pro/api/ai'), devEnv)).toBeNull();
      // An explicit production marker beats a localhost-looking host.
      expect(
        await requireAuth(new Request('http://localhost:8787/api/ai'), {
          ENVIRONMENT: 'production',
        }),
      ).toBeNull();
    });

    it('fails closed for a production deployment whose AUTH_SECRET is missing', async () => {
      const missingSecretEnv = { DB: createMockD1() };
      expect(isProductionRequest(new Request('https://corez.pro/api/ai'), missingSecretEnv)).toBe(true);
      expect(isProductionRequest(new Request('https://corez.test/api/ai'), missingSecretEnv)).toBe(false);
      expect(
        isProductionRequest(new Request('https://corez.test/api/ai'), { COREZ_ENV: 'production' }),
      ).toBe(true);

      // The worker entrypoint refuses protected routes with a retryable 503
      // (not a login prompt the user can never satisfy).
      const worker = (await import('../worker/entry.js')).default;
      const res = await worker.fetch(new Request('https://corez.pro/api/ai', { method: 'POST' }), missingSecretEnv);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('auth_not_configured');
      expect(body.retryable).toBe(true);
      expect(res.headers.get('Retry-After')).toBeTruthy();

      // The same request on a local/dev host stays available.
      const devRes = await worker.fetch(
        new Request('https://corez.test/api/tasks/none/events'),
        { ...missingSecretEnv, ASSET_BUCKET: null },
      );
      expect(devRes.status).not.toBe(503);
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

  describe('Password recovery boundaries', () => {
    let mockEnv;

    beforeEach(() => {
      mockEnv = {
        DB: createMockD1(),
        AUTH_SECRET: TEST_SECRET,
        AUTH_RESET_TOKEN_IN_RESPONSE: '1',
      };
    });

    const signup = async (email, password, ip) => {
      const res = await handleAuth(
        new Request('https://corez.pro/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ email, password, plan: 'free' }),
        }),
        mockEnv,
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('Set-Cookie') || '';
      const session = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1] || null;
      return session;
    };

    const login = async (email, password, ip) => {
      const res = await handleAuth(
        new Request('https://corez.pro/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ email, password }),
        }),
        mockEnv,
      );
      const setCookie = res.headers.get('Set-Cookie') || '';
      return {
        status: res.status,
        session: setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1] || null,
      };
    };

    const forgot = async (email, ip) => {
      const res = await handleAuth(
        new Request('https://corez.pro/api/auth/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ email }),
        }),
        mockEnv,
      );
      return res.json();
    };

    const reset = (token, password, ip) =>
      handleAuth(
        new Request('https://corez.pro/api/auth/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ token, password }),
        }),
        mockEnv,
      );

    const verify = (session) =>
      verifySession(
        new Request('https://corez.pro/api/auth/me', {
          headers: { Cookie: `${SESSION_COOKIE}=${session}` },
        }),
        mockEnv,
      );

    it('revokes previously issued sessions when the password is reset', async () => {
      const email = 'revoke@corez.pro';
      const oldSession = await signup(email, 'OldPassword123!', '10.20.0.1');
      expect(oldSession).toBeTruthy();
      expect(await verify(oldSession)).not.toBeNull();

      const { token } = await forgot(email, '10.20.0.2');
      expect(typeof token).toBe('string');
      const res = await reset(token, 'NewPassword123!', '10.20.0.3');
      expect(res.status).toBe(200);

      // The session issued before the reset is dead; the new password works.
      expect(await verify(oldSession)).toBeNull();
      const relogin = await login(email, 'NewPassword123!', '10.20.0.4');
      expect(relogin.status).toBe(200);
      expect(await verify(relogin.session)).not.toBeNull();
    });

    it('signs in through Google after a password reset without reviving the old session', async () => {
      // Google login minted its own token and omitted the revocation claim, so
      // for an account that had ever reset its password the callback handed out
      // a session the verifier refused on the very next request.
      const email = 'googleafterreset@corez.pro';
      const oldSession = await signup(email, 'OldPassword123!', '10.23.0.1');
      expect(await verify(oldSession)).not.toBeNull();

      const { token } = await forgot(email, '10.23.0.2');
      expect((await reset(token, 'NewPassword123!', '10.23.0.3')).status).toBe(200);
      // The reset revoked the session issued before it.
      expect(await verify(oldSession)).toBeNull();

      const idToken = [
        b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256' }))),
        b64urlEncode(
          new TextEncoder().encode(JSON.stringify({ email, sub: 'google-sub-123' })),
        ),
        'signature',
      ].join('.');
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ id_token: idToken }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      let response;
      try {
        response = await handleAuth(
          new Request(
            'https://corez.pro/api/auth/google/callback?code=code123&state=state123',
            { headers: { Cookie: 'oauth_state=state123' } },
          ),
          {
            ...mockEnv,
            GOOGLE_CLIENT_ID: 'google-client-id',
            GOOGLE_CLIENT_SECRET: 'google-client-secret',
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }

      expect(response.status).toBe(302);
      const session = (response.headers.get('Set-Cookie') || '').match(
        new RegExp(`${SESSION_COOKIE}=([^;]+)`),
      )?.[1];
      expect(session).toBeTruthy();

      // The new Google session works...
      expect(await verify(session)).not.toBeNull();
      // ...and the pre-reset session is still dead: sharing the factory must not
      // have loosened revocation.
      expect(await verify(oldSession)).toBeNull();
    });

    it('sends the account revocation value from every sign-in entry point', async () => {
      // A shared factory is the point: password login, signup and Google all
      // have to agree, so no entry point can drift again.
      const email = 'sharedfactory@corez.pro';
      const session = await signup(email, 'OldPassword123!', '10.24.0.1');
      const payload = await verifyJWT(session, TEST_SECRET);
      expect(Number(payload.pwd_at)).toBe(0);

      const { token } = await forgot(email, '10.24.0.2');
      expect((await reset(token, 'NewPassword123!', '10.24.0.3')).status).toBe(200);

      const relogin = await login(email, 'NewPassword123!', '10.24.0.4');
      const reloginPayload = await verifyJWT(relogin.session, TEST_SECRET);
      const user = mockEnv.DB.users.get(email);
      expect(Number(reloginPayload.pwd_at)).toBe(Number(user.password_changed_at));
      expect(Number(reloginPayload.pwd_at)).toBeGreaterThan(0);
    });

    it('consumes a reset token atomically: simultaneous uses cannot both succeed', async () => {
      const email = 'race@corez.pro';
      await signup(email, 'OldPassword123!', '10.21.0.1');
      const { token } = await forgot(email, '10.21.0.2');

      const [first, second] = await Promise.all([
        reset(token, 'RacePasswordOne1!', '10.21.0.3'),
        reset(token, 'RacePasswordTwo2!', '10.21.0.4'),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 400]);
      const body = await (first.status === 400 ? first : second).json();
      expect(body.error).toMatch(/already used/i);

      // Exactly one of the two passwords is current; the token is spent.
      const one = await login(email, 'RacePasswordOne1!', '10.21.0.5');
      const two = await login(email, 'RacePasswordTwo2!', '10.21.0.6');
      expect([one.status, two.status].filter((s) => s === 200)).toHaveLength(1);
    });

    it('never logs the reset secret when no email provider is configured', async () => {
      const email = 'nolog@corez.pro';
      await signup(email, 'OldPassword123!', '10.22.0.1');
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));
      let token;
      try {
        ({ token } = await forgot(email, '10.22.0.2'));
      } finally {
        console.warn = originalWarn;
      }
      expect(typeof token).toBe('string');
      const logged = warnings.join('\n');
      expect(logged).not.toContain(token);
      expect(logged).not.toContain(`token=${token}`);
    });
  });

  // The mock above models change metadata but not SQL guards, so it cannot tell
  // "the token claim was refused" from "the password was written anyway" — its
  // unconditional `UPDATE users SET` branch applies both writes and the test
  // still passes. These run the real statements through SQLite, where a guarded
  // UPDATE matching no rows is a SUCCESSFUL statement: the exact property that
  // let a rejected request change the password.
  describe('password reset token atomicity (real SQL)', () => {
    const post = (path, body, ip) =>
      new Request(`https://corez.pro${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify(body)
      });

    // Wrap a real SQLite D1 so the token read can be interleaved with the write.
    function withResetRace(db) {
      let readers = 0;
      let release;
      const bothRead = new Promise((resolve) => {
        release = resolve;
      });
      return {
        __sqlite: db.__sqlite,
        prepare(sql) {
          const inner = db.prepare(sql);
          return {
            __runSync: () => inner.__runSync(),
            bind(...values) {
              inner.bind(...values);
              return this;
            },
            async run() {
              return inner.__runSync();
            },
            async all() {
              return inner.all();
            },
            async first() {
              if (/FROM password_resets WHERE token=/i.test(sql)) {
                readers += 1;
                if (readers === 2) release();
                await bothRead;
              }
              return inner.first();
            }
          };
        },
        batch(statements) {
          return db.batch(statements);
        }
      };
    }

    async function seedAccountAndToken(db, email, token) {
      const env = { DB: db, AUTH_SECRET: 'reset-race-secret' };
      await ensureTables(env);
      const signupRes = await handleAuth(
        post('/api/auth/signup', { email, password: 'Original123!' }, '10.30.0.1'),
        env
      );
      expect(signupRes.status).toBe(200);
      const user = await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
      await db
        .prepare(
          'INSERT INTO password_resets (id, email, token, expires_at, used, created_at, user_id) VALUES (?,?,?,?,0,?,?)'
        )
        .bind('pr_race', email, token, Date.now() + 3600_000, Date.now(), user.id)
        .run();
      return { env, user };
    }

    it('never lets the request that lost the token race change the password', async () => {
      const db = createSqliteD1();
      const { env, user } = await seedAccountAndToken(db, 'resettrace@corez.pro', 'tok_reset_race');
      const racing = { ...env, DB: withResetRace(db) };
      const originalHash = user.password_hash;

      const responses = await Promise.all([
        handleAuth(post('/api/auth/reset', { token: 'tok_reset_race', password: 'Winner111!' }, '10.30.0.2'), racing),
        handleAuth(post('/api/auth/reset', { token: 'tok_reset_race', password: 'Loser222!' }, '10.30.0.3'), racing)
      ]);

      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 400]);

      // The decisive assertion. Checking only that one of the two passwords
      // works passes even when the REJECTED request wrote its own, because the
      // last write wins — that is how this shipped.
      const winner = responses[0].status === 200 ? 'Winner111!' : 'Loser222!';
      const loser = winner === 'Winner111!' ? 'Loser222!' : 'Winner111!';
      const stored = await db
        .prepare('SELECT password_hash, password_changed_at FROM users WHERE id=?')
        .bind(user.id)
        .first();
      expect(stored.password_hash).not.toBe(originalHash);
      expect(await verifyPassword(winner, stored.password_hash)).toBe(true);
      expect(await verifyPassword(loser, stored.password_hash)).toBe(false);
      expect(await verifyPassword('Original123!', stored.password_hash)).toBe(false);

      // The token is spent exactly once.
      const spent = await db
        .prepare('SELECT used FROM password_resets WHERE id=?')
        .bind('pr_race')
        .first();
      expect(Number(spent.used)).toBe(1);
    });
  });
});
