// Operator console API for /admin.
//
// Access is deliberately narrow: either an admin key (ADMIN_SECRET, sent as
// X-Admin-Key) or a signed-in account whose email is in ADMIN_EMAILS. When no
// allowlist/secret is configured, a non-production host falls back to the same
// development identity the rest of the Worker uses. A production deployment
// without either configuration has no admins at all - it fails closed.
//
// The console never lists reset tokens. The operator can only finish a reset
// with a token the account owner already received by email.
import { hashPassword, isProductionRequest, verifySession } from "./auth.js";
import { createRateLimiter, jsonResponse, readBoundedJson } from "./utils.js";

const adminResetLimiter = createRateLimiter({ windowMs: 60_000, limit: 20 });
const NO_STORE = { "Cache-Control": "no-store" };

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function allowedEmails(env) {
  return String(env?.ADMIN_EMAILS || "")
    .split(",")
    .map(normaliseEmail)
    .filter(Boolean);
}

function constantTimeEqual(first, second) {
  const a = String(first || "");
  const b = String(second || "");
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function adminJson(status, body) {
  return jsonResponse(status, body, NO_STORE);
}

function denial(access) {
  if (access?.authenticated) {
    return adminJson(403, {
      error: "This account is not an admin.",
      code: "not_admin",
    });
  }
  return adminJson(401, {
    error: "Admin access required. Sign in as an admin or enter the admin key.",
    code: "admin_auth_required",
  });
}

async function resolveAdmin(request, env) {
  const configuredSecret = env?.ADMIN_SECRET;
  if (configuredSecret) {
    const supplied = request.headers.get("X-Admin-Key") || "";
    if (constantTimeEqual(supplied, configuredSecret)) {
      return { admin: true, via: "secret", email: "admin-key" };
    }
  }

  const session = await verifySession(request, env);
  const emails = allowedEmails(env);
  if (session) {
    if (emails.includes(normaliseEmail(session.email))) {
      return {
        admin: true,
        via: "session",
        email: normaliseEmail(session.email),
      };
    }
    if (!emails.length && !isProductionRequest(request, env)) {
      return {
        admin: true,
        via: "development",
        email: normaliseEmail(session.email) || "development",
      };
    }
    return { admin: false, authenticated: true, email: session.email };
  }

  if (!env?.AUTH_SECRET && !isProductionRequest(request, env)) {
    return {
      admin: true,
      via: "development",
      email: normaliseEmail(env?.ADMIN_DEV_EMAIL) || "dev@corez.pro",
    };
  }
  return { admin: false, authenticated: false };
}

async function countQuery(env, sql, ...params) {
  try {
    const statement = env.DB.prepare(sql);
    const row = await (params.length ? statement.bind(...params) : statement).first();
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

async function allQuery(env, sql, ...params) {
  try {
    const statement = env.DB.prepare(sql);
    const result = await (params.length ? statement.bind(...params) : statement).all();
    return result?.results || [];
  } catch {
    return [];
  }
}

async function findAccount(env, email) {
  try {
    return await env.DB.prepare(
      "SELECT id, email, plan, provider, created_at, password_changed_at FROM users WHERE lower(email)=lower(?) LIMIT 1",
    )
      .bind(email)
      .first();
  } catch {
    return await env.DB.prepare(
      "SELECT id, email, plan, provider, created_at FROM users WHERE lower(email)=lower(?) LIMIT 1",
    )
      .bind(email)
      .first();
  }
}

async function findAccountById(env, id) {
  try {
    return await env.DB.prepare(
      "SELECT id, email, plan, provider, created_at, password_changed_at FROM users WHERE id=? LIMIT 1",
    )
      .bind(id)
      .first();
  } catch {
    return await env.DB.prepare(
      "SELECT id, email, plan, provider, created_at FROM users WHERE id=? LIMIT 1",
    )
      .bind(id)
      .first();
  }
}

function accountJson(account) {
  if (!account) return null;
  return {
    id: String(account.id),
    email: normaliseEmail(account.email),
    plan: String(account.plan || "free"),
    provider: String(account.provider || "local"),
    createdAt: Number(account.created_at) || null,
    passwordChangedAt: Number(account.password_changed_at) || null,
  };
}

async function dashboard(request, env) {
  const now = Date.now();
  const [users, chats, themes, pendingResets] = await Promise.all([
    countQuery(env, "SELECT COUNT(*) AS n FROM users"),
    countQuery(env, "SELECT COUNT(*) AS n FROM chats"),
    countQuery(env, "SELECT COUNT(*) AS n FROM user_themes"),
    countQuery(
      env,
      "SELECT COUNT(*) AS n FROM password_resets WHERE used=0 AND expires_at > ?",
      now,
    ),
  ]);
  const planRows = await allQuery(
    env,
    "SELECT plan, COUNT(*) AS n FROM users GROUP BY plan",
  );
  const plans = {};
  for (const row of planRows) {
    plans[String(row.plan || "free")] = Number(row.n || 0);
  }
  const recentResets = await allQuery(
    env,
    "SELECT email, created_at, expires_at, used FROM password_resets ORDER BY created_at DESC LIMIT 12",
  );
  const recentUsers = await allQuery(
    env,
    "SELECT email, plan, provider, created_at FROM users ORDER BY created_at DESC LIMIT 10",
  );
  return adminJson(200, {
    ok: true,
    generatedAt: now,
    stats: { users, chats, themes, pendingResets },
    plans,
    recentResets: recentResets.map((row) => ({
      email: normaliseEmail(row.email),
      createdAt: Number(row.created_at) || null,
      expiresAt: Number(row.expires_at) || null,
      used: Number(row.used) === 1,
    })),
    recentUsers: recentUsers.map((row) => ({
      email: normaliseEmail(row.email),
      plan: String(row.plan || "free"),
      provider: String(row.provider || "local"),
      createdAt: Number(row.created_at) || null,
    })),
  });
}

async function lookupUser(request, env) {
  const url = new URL(request.url);
  const email = normaliseEmail(url.searchParams.get("email"));
  if (!email) {
    return adminJson(400, {
      error: "An email is required.",
      code: "email_required",
    });
  }
  const account = await findAccount(env, email);
  if (!account) {
    return adminJson(404, {
      error: "No account with that email.",
      code: "user_not_found",
    });
  }
  const [chats, themes] = await Promise.all([
    countQuery(env, "SELECT COUNT(*) AS n FROM chats WHERE user_id=?", account.id),
    countQuery(
      env,
      "SELECT COUNT(*) AS n FROM user_themes WHERE user_id=?",
      account.id,
    ),
  ]);
  return adminJson(200, {
    ok: true,
    user: accountJson(account),
    counts: { chats, themes },
  });
}

async function resetPassword(request, env) {
  const retryAfter = adminResetLimiter(request);
  if (retryAfter !== null) {
    return jsonResponse(
      429,
      { error: "Too many admin resets. Wait a moment.", code: "rate_limited" },
      { ...NO_STORE, "Retry-After": String(retryAfter) },
    );
  }
  let body;
  try {
    body = await readBoundedJson(request);
  } catch {
    return adminJson(400, {
      error: "Invalid request body.",
      code: "invalid_request",
    });
  }
  const token = String(body?.token || "").trim();
  const password = String(body?.password || "");
  const suppliedEmail = normaliseEmail(body?.email);
  if (!token) {
    return adminJson(400, {
      error: "The reset token from the user is required.",
      code: "token_required",
    });
  }
  if (password.length < 8) {
    return adminJson(400, {
      error: "The new password must be at least 8 characters.",
      code: "password_too_short",
    });
  }

  const row = await env.DB.prepare(
    "SELECT * FROM password_resets WHERE token=?",
  )
    .bind(token)
    .first();
  if (!row) {
    return adminJson(400, {
      error: "That reset token does not exist. Ask the user for a fresh one.",
      code: "token_invalid",
    });
  }
  if (Number(row.used) === 1) {
    return adminJson(400, {
      error: "That reset token has already been used.",
      code: "token_used",
    });
  }
  if (Date.now() > Number(row.expires_at)) {
    return adminJson(400, {
      error: "That reset token has expired. Ask the user for a fresh one.",
      code: "token_expired",
    });
  }

  const account = row.user_id
    ? await findAccountById(env, String(row.user_id))
    : await findAccount(env, normaliseEmail(row.email));
  if (!account) {
    return adminJson(400, {
      error: "The account for that token no longer exists.",
      code: "user_not_found",
    });
  }
  if (suppliedEmail && normaliseEmail(account.email) !== suppliedEmail) {
    return adminJson(400, {
      error: "That token belongs to a different email address.",
      code: "email_mismatch",
    });
  }

  const now = Date.now();
  const hash = await hashPassword(password);
  let passwordResult;
  let claimResult;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET password_hash=?, password_changed_at=? WHERE id=? AND EXISTS (SELECT 1 FROM password_resets WHERE id=? AND used=0)",
      ).bind(hash, now, account.id, row.id),
      env.DB.prepare(
        "UPDATE password_resets SET used=1 WHERE id=? AND used=0",
      ).bind(row.id),
    ]);
    passwordResult = results?.[0];
    claimResult = results?.[1];
  } catch {
    return adminJson(500, {
      error: "The password update failed. Nothing was changed.",
      code: "reset_failed",
    });
  }
  const passwordWritten = Number(passwordResult?.meta?.changes) > 0;
  const claimed = Number(claimResult?.meta?.changes) > 0;
  if (!passwordWritten || !claimed) {
    return adminJson(400, {
      error: "That reset token was already used or expired.",
      code: "token_unavailable",
    });
  }

  return adminJson(200, {
    ok: true,
    message: "Password updated for " + normaliseEmail(account.email) + ".",
    user: accountJson(account),
  });
}

/**
 * Handle /api/admin/* dashboard calls. Returns null for paths this module does
 * not own (notably /api/admin/storage-migrate, which keeps its own gate).
 */
export async function handleAdmin(request, env) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const path = url.pathname;
  if (path !== "/api/admin" && !path.startsWith("/api/admin/")) return null;
  if (path === "/api/admin/storage-migrate") return null;

  const access = await resolveAdmin(request, env);
  if (!access.admin) return denial(access);

  if (path === "/api/admin/me" && request.method === "GET") {
    return adminJson(200, {
      ok: true,
      admin: { email: access.email, via: access.via },
    });
  }
  if (path === "/api/admin/dashboard" && request.method === "GET") {
    try {
      return await dashboard(request, env);
    } catch {
      return adminJson(500, {
        error: "Could not read the dashboard data.",
        code: "dashboard_failed",
      });
    }
  }
  if (path === "/api/admin/users" && request.method === "GET") {
    return lookupUser(request, env);
  }
  if (path === "/api/admin/reset-password" && request.method === "POST") {
    if (!env?.DB) {
      return adminJson(500, {
        error: "Auth database not configured.",
        code: "db_missing",
      });
    }
    return resetPassword(request, env);
  }
  return adminJson(404, { error: "Admin route not found.", code: "not_found" });
}

export default handleAdmin;