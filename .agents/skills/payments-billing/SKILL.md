---
name: payments-billing
description: Use when working on Ziina checkout, subscription upgrades or downgrades, plan activation, payment webhooks, or a bug where a plan was granted, changed or expired incorrectly. Not for quota and usage limits once a plan is set - use `usage-metering`; not for designing general REST routes - use `backend-architecture`.
---

# Payments & Billing

## When to use

- Ziina checkout creation, payment verification, or webhook handling.
- Adding or changing a plan, its price, or its interval.
- A bug report shaped like "I paid and did not get premium", "I got premium
  without paying", or "my plan expired early".
- Reviewing **any** change that writes `users.plan`.

## When not to use

- Quota enforcement and 402 gates after a plan is granted - `usage-metering`.
- General route design, validation, CORS, retries - `backend-architecture`.
- Pricing-page copy - `business-marketing`.

## The invariant that matters most

> **Only a payment verified against Ziina may raise a plan.**

`users.plan` has exactly one legitimate writer: `activateSubscription()` called
from a path that has first confirmed the payment **with Ziina's API** (not with
anything the client sent). Treat every other writer as a bug.

This was violated four separate ways in production. All four are fixed and
regression-tested; keep them fixed:

| # | Hole | Rule it broke |
|---|------|---------------|
| 1 | `POST /api/auth/signup` accepted a client `plan` | Public signup created paid accounts. Signup must always create `free`; a requested paid plan returns `400 plan_requires_payment`. |
| 2 | `POST /api/subscriptions/cancel` accepted a *higher* plan and, with no active period, activated it | Cancel must only ever move a plan **down**. Guarded by `isDowngrade()` / `PLAN_RANK`; anything else returns `400 not_a_downgrade`. |
| 3 | `/verify` resolved the plan from a client `plan` hint and fell back to `"standard"` for any unmatched amount | Paying Ziina's 2 AED minimum bought the 18.36 AED plan. Derive the plan **only** from the amount Ziina reports as paid; unmatched grants free. |
| 4 | `/verify` took `interval` from the request body | `interval=year` on a monthly payment bought 365 days. Derive the interval from the paid amount too. |

If you add a route that can change a plan, it needs a test proving a
free/low-paying caller cannot raise it. `tests/subscription-plan-guard.test.js`
is the pattern to copy.

## Where things live

| Concern | File |
| --- | --- |
| Ziina client, plan table, checkout | `worker/ziina.js` |
| Subscription lifecycle, routes, `activateSubscription` | `worker/subscriptions.js` |
| Signup/login and the plan write | `worker/auth.js` |
| Paid-plan feature gate (custom domains) | `worker/customDomains.js` |

## Plan table

`ZIINA_PLANS` in `worker/ziina.js` is the single source of truth for prices.
Amounts are in **fils** (1 AED = 100 fils) and are unique per entry, which is
what makes amount-derived plan resolution safe.

```
free            0        standard        1836  (18.36 AED/month)
premium         2754     standard_yearly 17628
premium_yearly  26436    basic           1836  (alias of standard)
```

The `basic` alias shares the standard amount, so `Object.entries(...).find()`
resolves 1836 to `standard` (first match wins). Do not add a second alias with a
duplicate amount without checking that ordering.

## Expiry semantics

`users.plan` is the source of truth; `subscription_period_end` is an **integer
ms timestamp or NULL**.

- `subscription_period_end = NULL` means **no expiry** - a plan is only treated
  as expired when the value is truthy *and* in the past (`getActiveSubscription`,
  `subscriptions.js`).
- Expiry is evaluated **lazily on read**, not by a cron. A downgrade is applied
  the next time the subscription is read.
- `subscription_status` is `active` | `canceled` | `expired`; `canceled` without
  a `downgrade_plan` is treated as active.

## Routes

```
GET  /api/subscriptions/plans     price list
POST /api/subscriptions/checkout  create a Ziina intent for a plan
GET  /api/subscriptions/pending   resume an in-flight checkout
POST /api/subscriptions/verify    confirm a payment with Ziina, then activate
POST /api/subscriptions/cancel    downgrade (and undo a scheduled downgrade)
POST /api/subscriptions/abandon   drop an abandoned checkout
GET  /api/subscriptions/me        current plan (reconciles pending first)
```

`checkout` reuses an existing in-flight intent for the same plan+interval rather
than creating duplicates, so repeated Upgrade clicks **resume** rather than
double-charge.

## Verification

```bash
npx vitest run tests/subscription-plan-guard.test.js tests/auth.test.js
```

Prove a fix by mutation: restore the vulnerable logic and confirm the test
fails. A passing test against already-correct code proves nothing.

## Related skills

- `usage-metering` - what a plan is worth once it is granted.
- `backend-architecture` - route shape, validation and error responses.
- `code-review-testing` - review and regression discipline.
