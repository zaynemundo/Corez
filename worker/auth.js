// Auth module for Corez — D1 + JWT + PBKDF2 + Google OAuth + Invite Code
import { jsonResponse, safeErrorDetail, createRateLimiter } from './utils.js';

export const SESSION_COOKIE = 'corez_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Per-IP rate limiter for authentication routes (10 requests per minute)
const authRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 10 });
const forgotRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 5 });

// ---------- helpers ----------
export function b64urlEncode(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlEncode(sig);
}

export async function hmacVerify(data, sig, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  try { return await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(data)); } catch { return false; }
}

export function createJWT(payload, secret) {
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const data = header + '.' + body;
  return hmacSign(data, secret).then(sig => data + '.' + sig);
}

export async function verifyJWT(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const data = h + '.' + b;
  if (!(await hmacVerify(data, s, secret))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(b)));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

export function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setCookieHeader(token) {
  return SESSION_COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_MAX_AGE;
}

export function clearCookieHeader() {
  return SESSION_COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function randomId() { return crypto.randomUUID(); }

// PBKDF2 password hashing - WebCrypto, no external deps
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64urlEncode(salt) + '.' + b64urlEncode(bits);
}

export async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = String(stored).split('.');
  if (!saltB64 || !hashB64) return false;
  const salt = b64urlDecode(saltB64);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const a = b64urlEncode(bits);
  // constant-time compare
  if (a.length !== hashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ hashB64.charCodeAt(i);
  return diff === 0;
}

export function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()); }

// D1 helpers
export async function ensureTables(env) {
  if (!env?.DB) return;
  // Create tables if not exist - idempotent, cheap on every auth request
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL, plan TEXT DEFAULT 'free')`).run();
    // Migrate old users tables without plan column
    try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'`).run(); } catch {}
    try { await env.DB.prepare(`ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active'`).run(); } catch {}
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (code TEXT PRIMARY KEY, used_by TEXT, used_at INTEGER, max_uses INTEGER DEFAULT 1, uses INTEGER DEFAULT 0)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'New Conversation', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, attachments TEXT, created_at INTEGER NOT NULL)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, updated_at DESC)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON chat_messages(chat_id, created_at ASC)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, used INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_resets_email ON password_resets(email)`).run();
    // Invite codes are now optional (kept for backward compat, not required for signup)
    // No seeding needed for new installs — free signup is open
  } catch {}
}

export async function findUserByEmail(env, email) {
  if (!env?.DB) return null;
  return await env.DB.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').bind(email).first();
}

export async function findUserById(env, id) {
  if (!env?.DB) return null;
  return await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
}

// ---------- session ----------
export async function verifySession(request, env) {
  const secret = env?.AUTH_SECRET;
  if (!secret) return null; // if no secret configured, auth disabled (dev)
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifyJWT(token, secret);
  if (!payload || !payload.uid) return null;
  // optionally verify user still exists
  if (env?.DB) {
    const u = await findUserById(env, payload.uid);
    if (!u) return null;
  }
  return payload;
}

export async function requireAuth(request, env) {
  // allow bypass when AUTH_SECRET not set (dev)
  if (!env?.AUTH_SECRET) return { uid: 'dev', email: 'dev@corez.pro' };
  const sess = await verifySession(request, env);
  return sess;
}

// ---------- route handler ----------
export async function handleAuth(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS for auth endpoints
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  }

  await ensureTables(env);

  // GET /api/auth/me
  if (path === '/api/auth/me' && request.method === 'GET') {
    const sess = await verifySession(request, env);
    if (!sess) return jsonResponse(401, { error: 'Not authenticated' });
    // Prefer DB plan (source of truth), fallback to JWT
    let plan = sess.plan || 'free';
    try {
      const u = await findUserById(env, sess.uid);
      if (u && typeof u.plan === 'string' && u.plan) plan = String(u.plan).toLowerCase();
    } catch {}
    return jsonResponse(200, { user: { id: sess.uid, email: sess.email, plan } });
  }

  // Rate limiting for auth mutations (login & signup)
  if ((path === '/api/auth/login' || path === '/api/auth/signup') && request.method === 'POST') {
    const retryAfter = authRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(429, { error: 'Too many authentication attempts. Please wait a moment and try again.' }, { 'Retry-After': String(retryAfter) });
    }
  }

  // POST /api/auth/logout
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookieHeader()
      }
    });
  }

  // POST /api/auth/signup — invite code no longer required, 3 plans: free / standard / premium
  if (path === '/api/auth/signup' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const rawPlan = String(body.plan || body.tier || body.product || 'free').trim().toLowerCase();
    const allowedPlans = new Set(['free', 'standard', 'premium', 'basic']);
    const plan = allowedPlans.has(rawPlan) ? (rawPlan === 'basic' ? 'standard' : rawPlan) : 'free';

    if (!validEmail(email)) return jsonResponse(400, { error: 'Valid email required' });
    if (password.length < 8) return jsonResponse(400, { error: 'Password must be at least 8 characters' });
    if (!allowedPlans.has(plan)) return jsonResponse(400, { error: 'Invalid plan. Use free, standard (18.36 AED) or premium (27.54 AED)' });
    if (!env?.DB) return jsonResponse(500, { error: 'Auth database not configured' });
    if (!env?.AUTH_SECRET) return jsonResponse(500, { error: 'AUTH_SECRET not configured' });

    const existing = await findUserByEmail(env, email);
    if (existing) return jsonResponse(409, { error: 'Email already registered' });

    const hash = await hashPassword(password);
    const id = randomId();
    // Try insert with plan, fallback to without plan for old schema
    try {
      await env.DB.prepare('INSERT INTO users (id, email, password_hash, provider, created_at, plan) VALUES (?,?,?,?,?,?)').bind(id, email, hash, 'local', Date.now(), plan).run();
    } catch {
      await env.DB.prepare('INSERT INTO users (id, email, password_hash, provider, created_at) VALUES (?,?,?,?,?)').bind(id, email, hash, 'local', Date.now()).run();
      try { await env.DB.prepare('UPDATE users SET plan=? WHERE id=?').bind(plan, id).run(); } catch {}
    }

    const token = await createJWT({ uid: id, email, plan, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }, env.AUTH_SECRET);
    return new Response(JSON.stringify({ ok: true, user: { id, email, plan } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookieHeader(token)
      }
    });
  }

  // POST /api/auth/login
  if (path === '/api/auth/login' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!validEmail(email) || !password) return jsonResponse(400, { error: 'Email and password required' });
    if (!env?.DB) return jsonResponse(500, { error: 'Auth database not configured' });
    if (!env?.AUTH_SECRET) return jsonResponse(500, { error: 'AUTH_SECRET not configured' });

    const user = await findUserByEmail(env, email);
    if (!user || !user.password_hash) return jsonResponse(401, { error: 'Invalid email or password' });
    if (!(await verifyPassword(password, user.password_hash))) return jsonResponse(401, { error: 'Invalid email or password' });

    const plan = (user.plan && String(user.plan).trim().toLowerCase()) || 'free';
    const token = await createJWT({ uid: user.id, email: user.email, plan, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }, env.AUTH_SECRET);
    return new Response(JSON.stringify({ ok: true, user: { id: user.id, email: user.email, plan } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookieHeader(token)
      }
    });
  }

  // GET /api/auth/google - redirect to Google OAuth
  if (path === '/api/auth/google' && request.method === 'GET') {
    const clientId = env?.GOOGLE_CLIENT_ID;
    if (!clientId) return jsonResponse(500, { error: 'Google OAuth not configured' });
    const redirectUri = url.origin + '/api/auth/google/callback';
    const state = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent'
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: authUrl,
        'Set-Cookie': 'oauth_state=' + state + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600'
      }
    });
  }

  // GET /api/auth/google/callback
  if (path === '/api/auth/google/callback' && request.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = getCookie(request, 'oauth_state');
    if (!code) return jsonResponse(400, { error: 'Missing code' });
    if (!state || !cookieState || state !== cookieState) return jsonResponse(400, { error: 'Invalid state' });
    const clientId = env?.GOOGLE_CLIENT_ID;
    const clientSecret = env?.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return jsonResponse(500, { error: 'Google OAuth not configured' });
    if (!env?.AUTH_SECRET) return jsonResponse(500, { error: 'AUTH_SECRET not configured' });
    const redirectUri = url.origin + '/api/auth/google/callback';

    let tokenData;
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString()
      });
      tokenData = await r.json();
    } catch (e) { return jsonResponse(502, { error: 'Google token exchange failed: ' + safeErrorDetail(e) }); }

    const idToken = tokenData?.id_token;
    if (!idToken) return jsonResponse(502, { error: 'No id_token from Google' });

    let googlePayload;
    try {
      const parts = idToken.split('.');
      googlePayload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    } catch { return jsonResponse(502, { error: 'Invalid id_token' }); }

    const email = String(googlePayload?.email || '').toLowerCase();
    const googleId = String(googlePayload?.sub || '');
    if (!validEmail(email)) return jsonResponse(400, { error: 'Google account has no email' });
    if (!env?.DB) return jsonResponse(500, { error: 'Auth database not configured' });

    await ensureTables(env);
    let user = await findUserByEmail(env, email);
    if (!user) {
      const id = randomId();
      try {
        await env.DB.prepare('INSERT INTO users (id, email, password_hash, provider, google_id, created_at, plan) VALUES (?,?,?,?,?,?,?)').bind(id, email, null, 'google', googleId, Date.now(), 'free').run();
      } catch {
        await env.DB.prepare('INSERT INTO users (id, email, password_hash, provider, google_id, created_at) VALUES (?,?,?,?,?,?)').bind(id, email, null, 'google', googleId, Date.now()).run();
      }
      user = { id, email, plan: 'free' };
    }
    const plan = (user.plan && String(user.plan).trim().toLowerCase()) || 'free';
    const token = await createJWT({ uid: user.id, email: user.email, plan, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }, env.AUTH_SECRET);

    const headers = new Headers();
    headers.set('Location', '/');
    headers.append('Set-Cookie', setCookieHeader(token));
    headers.append('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return new Response(null, { status: 302, headers });
  }

  // POST /api/auth/forgot - request password reset email
  if (path === '/api/auth/forgot' && request.method === 'POST') {
    const retryAfter = forgotRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(429, { error: 'Too many reset attempts. Please wait.' }, { 'Retry-After': String(retryAfter) });
    }
    let body;
    try { body = await request.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return jsonResponse(400, { error: 'Valid email required' });
    if (!env?.DB) return jsonResponse(500, { error: 'Auth database not configured' });

    const user = await findUserByEmail(env, email);
    // Always return ok to not leak existence, but only create token if user exists and is local
    if (user && user.password_hash) {
      const token = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
      const id = randomId();
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
      try {
        await env.DB.prepare('INSERT INTO password_resets (id, email, token, expires_at, created_at) VALUES (?,?,?,?,?)').bind(id, email, token, expiresAt, Date.now()).run();
        const resetUrl = `${url.origin}/?token=${encodeURIComponent(token)}`;
        // Try to send via Resend if configured, otherwise log
        const resendKey = env?.RESEND_API_KEY;
        if (resendKey) {
          try {
            const from = env?.RESEND_FROM || 'CoreZ <onboarding@resend.dev>';
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from,
                to: email,
                subject: 'Reset your CoreZ password',
                html: `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
<div style="background:#f4f4f5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e4e4e7;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.14em;color:#09090b;">COREZ</div>
      <div style="margin-top:6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;font-weight:600;">Turn ideas into products</div>
    </div>
    <div style="padding:32px 32px 28px;">
      <h1 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#18181b;line-height:1.3;">Reset your password</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">Hi there — you requested a password reset for <strong style="color:#18181b;">${email}</strong>.</p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3f3f46;">Click the button below to set a new password. This link <strong>expires in 1 hour</strong> and can only be used once.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:13px 30px;background:#09090b;color:#ffffff;text-decoration:none;border-radius:9px;font-size:14px;font-weight:700;letter-spacing:0.02em;">Reset Password</a>
      </div>
      <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:12px 14px;margin:0 0 18px;">
        <p style="margin:0;font-size:11px;line-height:1.5;color:#71717a;word-break:break-all;">Or copy this link:<br><a href="${resetUrl}" style="color:#09090b;word-break:break-all;">${resetUrl}</a></p>
      </div>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
    <div style="padding:18px 32px;background:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
      <p style="margin:0;font-size:11px;line-height:1.5;color:#a1a1aa;">© ${new Date().getFullYear()} CoreZ • Sent from no-support@corez.pro • Automated message, please don't reply.</p>
    </div>
  </div>
  <p style="max-width:560px;margin:16px auto 0;text-align:center;font-size:11px;color:#a1a1aa;line-height:1.5;">Mercury • CoreZ auth</p>
</div>
</body></html>`
              })
            });
          } catch (e) {
            console.warn('Resend failed:', safeErrorDetail(e));
          }
        } else {
          console.warn(`Password reset token for ${email}: ${token} -> ${resetUrl}`);
        }
        // In dev without RESEND, return token for testing (only when no Resend key)
        if (!resendKey) {
          return jsonResponse(200, { ok: true, message: 'If that email exists, a reset link has been sent.', token, resetUrl });
        }
      } catch (e) {
        console.warn('Failed to create reset token:', safeErrorDetail(e));
      }
    }
    return jsonResponse(200, { ok: true, message: 'If that email exists, a reset link has been sent.' });
  }

  // POST /api/auth/reset - reset password with token
  if (path === '/api/auth/reset' && request.method === 'POST') {
    const retryAfter = forgotRateLimiter(request);
    if (retryAfter !== null) {
      return jsonResponse(429, { error: 'Too many reset attempts. Please wait.' }, { 'Retry-After': String(retryAfter) });
    }
    let body;
    try { body = await request.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    const token = String(body.token || '').trim();
    const password = String(body.password || '');
    if (!token) return jsonResponse(400, { error: 'Reset token required' });
    if (password.length < 8) return jsonResponse(400, { error: 'Password must be at least 8 characters' });
    if (!env?.DB) return jsonResponse(500, { error: 'Auth database not configured' });

    const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token=?').bind(token).first();
    if (!row) return jsonResponse(400, { error: 'Invalid or expired reset token' });
    if (Number(row.used) === 1) return jsonResponse(400, { error: 'Reset token already used' });
    if (Date.now() > Number(row.expires_at)) return jsonResponse(400, { error: 'Reset token expired' });

    const user = await findUserByEmail(env, String(row.email));
    if (!user) return jsonResponse(400, { error: 'User not found' });

    const hash = await hashPassword(password);
    await env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(hash, user.id).run();
    await env.DB.prepare('UPDATE password_resets SET used=1 WHERE id=?').bind(row.id).run();

    return jsonResponse(200, { ok: true, message: 'Password has been reset. You can now login.' });
  }

  return null;
}
