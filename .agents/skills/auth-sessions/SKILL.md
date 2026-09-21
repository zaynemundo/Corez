---
name: auth-sessions
description: Use when working on login, signup, password reset, the session cookie, JWT verification, OAuth, permission or ownership checks, or a bug where a user is signed out, signed in as the wrong account, or blocked by auth that should not apply. Not for designing a new public API surface - use `backend-architecture`; not for plan and billing rules - use `payments-billing`.
---

# Auth & Sessions

## When to use

- Login, signup, logout, `forgot`, `reset`, or Google OAuth.
- The session cookie, JWT creation/verification, or `verifySession`/`requireAuth`.
- Any "who is this request" question, including owner checks on stored objects.
- A bug where a user is unexpectedly signed out, or a protected route is
  reachable without a session.

## When not to use

- Plan, payment and upgrade rules - `payments-billing`.
- Secrets policy, injection and dangerous-command scanning - `cursor-security-rules`.
- General route validation and error envelopes - `backend-architecture`.

## Where things live

`worker/auth.js` owns the whole model: password hashing, JWT sign/verify, cookie
helpers, route handling, and the D1 table bootstrap. Callers import
`verifySession` / `requireAuth`; they do not re-implement checks.

## Password storage

PBKDF2-SHA256 via WebCrypto, **100,000 iterations**, 16-byte random salt,
256-bit derived key. The stored value is:

```
b64url(salt) + "." + b64url(bits)
```

`salt` is 22 base64url chars and `bits` is 43, so a stored hash is 66 chars.

- Always go through `hashPassword()` / `verifyPassword()` - never construct the
  value yourself, and never compare with `===` (the verifier is constant-time).
- When writing a script that creates accounts, import `verifyPassword` and prove
  the round-trip before reporting success;
  `scripts/provision-account.mjs` is the reference implementation.
- Password floor is **8 characters**; there is no upper bound in code, so do not
  assume one.

## Sessions

| Property | Value |
| --- | --- |
| Cookie name | `corez_session` (`SESSION_COOKIE`) |
| Lifetime | 7 days (`SESSION_MAX_AGE`) |
| Token | JWT with `exp` in **seconds** (`Date.now()/1000 + SESSION_MAX_AGE`) |
| Storage | HttpOnly cookie, set by `signup` / `login` / `google` |

**The database is the source of truth for the plan, not the JWT.** Reads resolve
the plan from `users.plan` and only fall back to the token claim
(`auth.js`, `verifySession`). A JWT issued before an upgrade must not keep a user
on the old plan - if you see stale entitlements, this resolution order is the
first place to look.

## Routes

```
POST /api/auth/signup   POST /api/auth/login    POST /api/auth/logout
GET  /api/auth/me       POST /api/auth/forgot   POST /api/auth/reset
GET  /api/auth/google   GET  /api/auth/google/callback
```

## Rate limiting

`createRateLimiter` in `worker/utils.js` is a sliding window keyed by
`CF-Connecting-IP`. Auth mutations are limited to **10/min** (`authRateLimiter`);
`forgot` is **5/min** (`forgotRateLimiter`).

Two consequences worth remembering:

- A test that fires many login/signup requests in a loop will hit `429` and mask
  the behaviour it is testing. Give each request its own `CF-Connecting-IP`
  header - see the signup tests in `tests/auth.test.js`.
- A missing `CF-Connecting-IP` collapses every caller into one bucket, which is
  correct for a real request (the edge always sets it) but hides errors in
  synthetic ones.

## Signup rules

- The account is **always created on the free plan**. A client-supplied `plan`
  is refused with `400 plan_requires_payment`; paid plans come only from the
  verified payment flow.
- Invite codes are optional and no longer required.
- The browser flow already sends `"free"` and returns to `/pricing` to pay, so
  refusing a paid plan at signup breaks nothing legitimate.

## Verification

```bash
npx vitest run tests/auth.test.js
```

A missing `AUTH_SECRET` makes auth fail closed in production. Local dev without
`AUTH_SECRET` intentionally bypasses the gate - never rely on that behaviour to
argue a route is protected.

## Related skills

- `payments-billing` - plan rules that sit on top of the session.
- `backend-architecture` - route shape and error handling.
- `verify` - driving the running app to reproduce an auth bug.
