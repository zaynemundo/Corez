// Auth module for Corez — D1 + JWT + PBKDF2 + Google OAuth + Invite Code
import { jsonResponse, safeErrorDetail } from './utils.js';

const SESSION_COOKIE = 'corez_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// ---------- helpers ----------
function b64urlEncode(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlEncode(sig);
}
async function hmacVerify(data, sig, secret) {
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
function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  for (const part of c.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
function setCookieHeader(token) {
  return SESSION_COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_MAX_AGE;
}
function clearCookieHeader() {
  return SESSION_COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
function randomId() { return crypto.randomUUID(); }

// PBKDF2 password hashing - WebCrypto, no external deps
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64urlEncode(salt) + '.' + b64urlEncode(bits);
}
async function verifyPassword(password, stored) {
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
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()); }

// D1 helpers
async function ensureTables(env) {
  if (!env.DB) return;
  // Create tables if not exist - idempotent, cheap on every auth request
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT, provider TEXT DEFAULT 'local', google_id TEXT, created_at INTEGER NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS invite_codes (code TEXT PRIMARY KEY, used_by TEXT, used_at INTEGER, max_uses INTEGER DEFAULT 1, uses INTEGER DEFAULT 0)`).run();
    // seed default invite codes from env if table empty
    const count = await env.DB.prepare('SELECT COUNT(*) as c FROM invite_codes').first();
    if (count && Number(count.c) === 0 && env.INVITE_CODES) {
      const codes = String(env.INVITE_CODES).split(',').map(s=>s.trim()).filter(Boolean);
      for (const code of codes) {
        try { await env.DB.prepare('INSERT OR IGNORE INTO invite_codes (code) VALUES (?)').bind(code).run(); } catch {}
      }
    }
    // fallback default code if nothing configured
    const c2 = await env.DB.prepare('SELECT COUNT(*) as c FROM invite_codes').first();
    if (c2 && Number(c2.c) === 0) {
      await env.DB.prepare('INSERT OR IGNORE INTO invite_codes (code) VALUES (?)').bind('COREZ-INVITE-2026').run();
    }
  } catch {}
}
async function findUserByEmail(env, email) {
  if (!env.DB) return null;
  return await env.DB.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').bind(email).first();
}
async function findUserById(env, id) {
  if (!env.DB) return null;
  return await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
}

// ---------- session ----------
export async function verifySession(request, env) {
  const secret = env.AUTH_SECRET;
  if (!secret) return null; // if no secret configured, auth disabled (dev)
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifyJWT(token, secret);
  if (!payload || !payload.uid) return null;
  // optionally verify user still exists
  if (env.DB) {
    const u = await findUserById(env, payload.uid);
    if (!u) return null;
  }
  return payload;
}
export async function requireAuth(request, env) {
  // allow bypass when AUTH_SECRET not set (dev)
  if (!env.AUTH_SECRET) return { uid: 'dev', email: 'dev@corez.pro' };
  const sess = await verifySession(request, env);
  return sess;
}

// ---------- route handler ----------
export async function handleAuth(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS for auth endpoints
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  await ensureTables(env);

  // GET /api/auth/me
  if (path === '/api/auth/me' && request.method === 'GET') {
    const sess = await verifySession(request, env);
    if (!sess) return jsonResponse(401, { error: 'Not authenticated' });
    return jsonResponse(200, { user: { id: sess.uid, email: sess.email } });
  }

  // POST /api/auth/logout
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookieHeader() } });
  }

  // POST /api/auth/signup
  if (path === '/api/auth/signup' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const inviteCode = String(body.inviteCode || body.invite_code || '').trim();
    if (!validEmail(email)) return jsonResponse(400, { error: 'Valid email required' });
    if (password.length < 8) return jsonResponse(400, { error: 'Password must be at least 8 characters' });
    if (!inviteCode) return jsonResponse(400, { error: 'Invite code required' });
    if (!env.DB) return jsonResponse(500, { error: 'Auth database not configured' });
    if (!env.AUTH_SECRET) return jsonResponse(500, { error: 'AUTH_SECRET not configured' });

    // validate invite code
    const codeRow = await env.DB.prepare('SELECT * FROM invite_codes WHERE code=?').bind(inviteCode).first();
    if (!codeRow) return jsonResponse(403, { error: 'Invalid invite code' });
    if (Number(codeRow.uses) >= Number(codeRow.max_uses)) return jsonResponse(403, { error: 'Invite code already used' });

    const existing = await findUserByEmail(env, email);
    if (existing) return jsonResponse(409, { error: 'Email already registered' });

    const hash = await hashPassword(password);
    const id = randomId();
    await env.DB.prepare('INSERT INTO users (id, email, password_hash, provider, created_at) VALUES (?,?,?,?,?)').bind(id, email, hash, 'local', Date.now()).run();
    await env.DB.prepare('UPDATE invite_codes SET uses = uses + 1, used_by=?, used_at=? WHERE code=?').bind(email, Date.now(), inviteCode).run();

    const token = await createJWT({ uid: id, email, exp: Math.floor(Date.now()/1000)+SESSION_MAX_AGE }, env.AUTH_SECRET);
    return new Response(JSON.stringify({ ok: true, user: { id, email } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader(token) } });
  }

  // POST /api/auth/login
  if (path === '/api/auth/login' && request.method === 'POST') {
    let body; try { body = await request.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!validEmail(email) || !password) return jsonResponse(400, { error: 'Email and password required' });
    if (!env.DB) return jsonResponse(500, { error: 'Auth database not configured' });
    if (!env.AUTH_SECRET) return jsonResponse(500, { error: 'AUTH_SECRET not configured' });
    const user = await findUserByEmail(env, email);
    if (!user || !user.password_hash) return jsonResponse(401, { error: 'Invalid email or password' });
    if (!(await verifyPassword(password, user.password_hash))) return jsonResponse(401, { error: 'Invalid email or password' });
    const token = await createJWT({ uid: user.id, email: user.email, exp: Math.floor(Date.now()/1000)+SESSION_MAX_AGE }, env.AUTH_SECRET);
    return new Response(JSON.stringify({ ok: true, user: { id: user.id, email: user.email } }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader(token) } });
  }

  // GET /api/auth/google - redirect to Google OAuth
  if (path === '/api/auth/google' && request.method === 'GET') {
    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) return jsonResponse(500, { error: 'Google OAuth not configured' });
    const redirectUri = url.origin + '/api/auth/google/callback';
    const state = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
    // store state in cookie for CSRF
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent'
    }).toString();
    return new Response(null, { status: 302, headers: { Location: authUrl, 'Set-Cookie': 'oauth_state=' + state + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600' } });
  }

  // GET /api/auth/google/callback
  if (path === '/api/auth/google/callback' && request.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = getCookie(request, 'oauth_state');
    if (!code) return jsonResponse(400, { error: 'Missing code' });
    if (!state || !cookieState || state !== cookieState) return jsonResponse(400, { error: 'Invalid state' });
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return jsonResponse(500, { error: 'Google OAuth not configured' });
    if (!env.AUTH_SECRET) return jsonResponse(500, { error: 'AUTH_SECRET not configured' });
    const redirectUri = url.origin + '/api/auth/google/callback';
    // exchange code
    let tokenData;
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString()
      });
      tokenData = await r.json();
    } catch (e) { return jsonResponse(502, { error: 'Google token exchange failed: ' + safeErrorDetail(e) }); }
    const idToken = tokenData.id_token;
    if (!idToken) return jsonResponse(502, { error: 'No id_token from Google' });
    // decode id_token payload (no verify - Google signed, but we trust exchange)
    let googlePayload;
    try {
      const parts = idToken.split('.');
      googlePayload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    } catch { return jsonResponse(502, { error: 'Invalid id_token' }); }
    const email = String(googlePayload.email || '').toLowerCase();
    const googleId = String(googlePayload.sub || '');
    if (!validEmail(email)) return jsonResponse(400, { error: 'Google account has no email' });
    if (!env.DB) return jsonResponse(500, { error: 'Auth database not configured' });
    await ensureTables(env);
    let user = await findUserByEmail(env, email);
    if (!user) {
      const id = randomId();
      await env.DB.prepare('INSERT INTO users (id, email, password_hash, provider, google_id, created_at) VALUES (?,?,?,?,?,?)').bind(id, email, null, 'google', googleId, Date.now()).run();
      user = { id, email };
    }
    const token = await createJWT({ uid: user.id, email: user.email, exp: Math.floor(Date.now()/1000)+SESSION_MAX_AGE }, env.AUTH_SECRET);
    // clear oauth_state, set session, redirect to /
    return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': setCookieHeader(token) + ', oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } });
  }

  return null; // not handled
}
