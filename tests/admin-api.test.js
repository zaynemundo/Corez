// Operator console API (/api/admin/*) against the real Worker entrypoint and a
// real in-memory SQLite D1. The console is a privileged surface, so the tests
// pin its gate, the dashboard shape, and the token-based password change.
import { describe, it, expect } from "vitest";
import worker from "../worker/entry.js";
import { createSqliteD1 } from "./helpers/sqliteD1.js";
import {
  SESSION_COOKIE,
  createSessionToken,
  ensureTables,
  hashPassword,
} from "../worker/auth.js";

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return "198.51.100." + (ipCounter % 200);
}

async function createEnv(overrides = {}) {
  const db = createSqliteD1();
  const env = {
    DB: db,
    AUTH_SECRET: "admin-contract-secret",
    ENVIRONMENT: "production",
    ADMIN_EMAILS: "admin@corez.pro",
    ...overrides,
  };
  await ensureTables(env);
  return env;
}

async function seedUser(db, { id, email, password, plan = "free" }) {
  const hash = await hashPassword(password);
  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, provider, created_at, plan) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, email, hash, "local", Date.now(), plan)
    .run();
  return { id, email, plan, created_at: Date.now() };
}

async function sessionCookie(env, user) {
  const token = await createSessionToken(env, user);
  return SESSION_COOKIE + "=" + token;
}

function request(env, path, { method = "GET", body, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  if (!finalHeaders["CF-Connecting-IP"]) {
    finalHeaders["CF-Connecting-IP"] = nextIp();
  }
  return worker.fetch(
    new Request("https://corez.pro" + path, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

async function insertResetToken(db, { id, email, token, userId, expiresAt = Date.now() + 60_000, used = 0 }) {
  await db
    .prepare(
      "INSERT INTO password_resets (id, email, token, expires_at, used, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, email, token, expiresAt, used, Date.now(), userId)
    .run();
}

describe("admin console API", () => {
  it("refuses anonymous and non-admin sessions", async () => {
    const env = await createEnv();
    const anonymous = await request(env, "/api/admin/me");
    expect(anonymous.status).toBe(401);

    const member = await seedUser(env.DB, {
      id: "u_member",
      email: "member@corez.pro",
      password: "MemberPass123!",
    });
    const cookie = await sessionCookie(env, member);
    const forbidden = await request(env, "/api/admin/me", {
      headers: { Cookie: cookie },
    });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).code).toBe("not_admin");
  });

  it("accepts an ADMIN_EMAILS session", async () => {
    const env = await createEnv();
    const admin = await seedUser(env.DB, {
      id: "u_admin",
      email: "admin@corez.pro",
      password: "AdminPass123!",
    });
    const cookie = await sessionCookie(env, admin);
    const response = await request(env, "/api/admin/me", {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.admin.email).toBe("admin@corez.pro");
    expect(body.admin.via).toBe("session");
  });

  it("accepts the ADMIN_SECRET key without a session", async () => {
    const env = await createEnv({ ADMIN_SECRET: "operator-key-123" });
    const denied = await request(env, "/api/admin/me", {
      headers: { "X-Admin-Key": "wrong" },
    });
    expect(denied.status).toBe(401);
    const allowed = await request(env, "/api/admin/me", {
      headers: { "X-Admin-Key": "operator-key-123" },
    });
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).admin.via).toBe("secret");
  });

  it("returns dashboard totals and never exposes reset tokens", async () => {
    const env = await createEnv();
    const admin = await seedUser(env.DB, {
      id: "u_admin",
      email: "admin@corez.pro",
      password: "AdminPass123!",
    });
    await seedUser(env.DB, {
      id: "u_customer",
      email: "customer@corez.pro",
      password: "CustomerPass123!",
      plan: "standard",
    });
    await insertResetToken(env.DB, {
      id: "reset_1",
      email: "customer@corez.pro",
      token: "secret_reset_token_1",
      userId: "u_customer",
    });
    const response = await request(env, "/api/admin/dashboard", {
      headers: { Cookie: await sessionCookie(env, admin) },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stats.users).toBe(2);
    expect(body.stats.pendingResets).toBe(1);
    expect(body.plans.standard).toBe(1);
    expect(body.recentResets).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("secret_reset_token_1");
  });

  it("changes a password with the token from the user and consumes it", async () => {
    const env = await createEnv();
    const admin = await seedUser(env.DB, {
      id: "u_admin",
      email: "admin@corez.pro",
      password: "AdminPass123!",
    });
    const target = await seedUser(env.DB, {
      id: "u_target",
      email: "target@corez.pro",
      password: "OldPassword123!",
    });
    await insertResetToken(env.DB, {
      id: "reset_target",
      email: "target@corez.pro",
      token: "target_reset_token",
      userId: target.id,
    });
    const cookie = await sessionCookie(env, admin);

    const response = await request(env, "/api/admin/reset-password", {
      method: "POST",
      headers: { Cookie: cookie },
      body: {
        email: "target@corez.pro",
        token: "target_reset_token",
        password: "NewPassword123!",
      },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.user.email).toBe("target@corez.pro");

    const oldLogin = await worker.fetch(
      new Request("https://corez.pro/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
        body: JSON.stringify({ email: "target@corez.pro", password: "OldPassword123!" }),
      }),
      env,
    );
    expect(oldLogin.status).toBe(401);
    const newLogin = await worker.fetch(
      new Request("https://corez.pro/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": nextIp() },
        body: JSON.stringify({ email: "target@corez.pro", password: "NewPassword123!" }),
      }),
      env,
    );
    expect(newLogin.status).toBe(200);

    const replay = await request(env, "/api/admin/reset-password", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { token: "target_reset_token", password: "AnotherPass123!" },
    });
    expect(replay.status).toBe(400);
    expect((await replay.json()).code).toBe("token_used");
  });

  it("rejects an expired token, an email mismatch and an unknown token", async () => {
    const env = await createEnv();
    const admin = await seedUser(env.DB, {
      id: "u_admin",
      email: "admin@corez.pro",
      password: "AdminPass123!",
    });
    await seedUser(env.DB, {
      id: "u_target",
      email: "target@corez.pro",
      password: "OldPassword123!",
    });
    await insertResetToken(env.DB, {
      id: "reset_expired",
      email: "target@corez.pro",
      token: "expired_token",
      userId: "u_target",
      expiresAt: Date.now() - 1000,
    });
    await insertResetToken(env.DB, {
      id: "reset_live",
      email: "target@corez.pro",
      token: "live_token",
      userId: "u_target",
    });
    const cookie = await sessionCookie(env, admin);

    const expired = await request(env, "/api/admin/reset-password", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { token: "expired_token", password: "NewPassword123!" },
    });
    expect(expired.status).toBe(400);
    expect((await expired.json()).code).toBe("token_expired");

    const mismatch = await request(env, "/api/admin/reset-password", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { email: "someone-else@corez.pro", token: "live_token", password: "NewPassword123!" },
    });
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).code).toBe("email_mismatch");

    const unknown = await request(env, "/api/admin/reset-password", {
      method: "POST",
      headers: { Cookie: cookie },
      body: { token: "no-such-token", password: "NewPassword123!" },
    });
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).code).toBe("token_invalid");
  });

  it("looks up an account without returning its password hash", async () => {
    const env = await createEnv();
    const admin = await seedUser(env.DB, {
      id: "u_admin",
      email: "admin@corez.pro",
      password: "AdminPass123!",
    });
    await seedUser(env.DB, {
      id: "u_lookup",
      email: "lookup@corez.pro",
      password: "LookupPass123!",
    });
    const response = await request(env, "/api/admin/users?email=lookup@corez.pro", {
      headers: { Cookie: await sessionCookie(env, admin) },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.email).toBe("lookup@corez.pro");
    expect(body.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("password_hash");
  });
});
