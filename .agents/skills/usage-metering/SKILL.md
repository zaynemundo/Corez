---
name: usage-metering
description: Use when changing plan quotas, monthly limits, the usage counters, 402 quota responses, or when a user is wrongly blocked or wrongly allowed past a limit. Not for the payment and plan-granting flow - use `payments-billing`; not for auth or session checks - use `auth-sessions`.
---

# Usage Metering & Limits

## When to use

- Changing what a plan is allowed to do (messages, builds, images, publishes).
- Working on the usage counters, the monthly period, or the `402` response.
- A bug where a user is blocked despite having quota, or allowed past it.

## When not to use

- Buying a plan, activating or downgrading it - `payments-billing`.
- Who the user is - `auth-sessions`.
- Subscription plan prices - those live in `worker/ziina.js`.

## Where things live

| Concern | File |
| --- | --- |
| Plan limits, counters, quota gate | `worker/usage.js` |
| Plan gate for a specific feature (example) | `worker/customDomains.js` |

## The two halves of a plan

A plan has **two independent effects**, and confusing them causes most bugs:

1. **Entitlement** - *may* this user do it at all (e.g. connect a custom domain).
   Gated with `requirePaidPlan` / `isPaidPlan`; a refusal is a `402` with
   `code: "plan_required"`.
2. **Quota** - *how much* may they do this month. Gated by the counters; a
   refusal is a `402` so the UI can tell "out of quota" apart from "not allowed".

`usage-metering` owns the second. The first belongs with the feature.

## Limits are `null`, not a number

`PLAN_LIMITS` is an immutable table keyed by normalised plan name. **Unlimited is
represented as `null`**, never as a large number - always check for `null` before
comparing:

```js
const limit = PLAN_LIMITS[normalizePlan(plan)]?.[metric];
if (limit !== null && counted >= limit) return quotaExceeded();
```

`normalizePlan` maps anything unrecognised to `"free"`, so an unknown plan name
is never accidentally unlimited. That is the safe default - keep it.

## Counting rules

- Counters live in one table keyed `(user_id, period, metric)` with a `count`.
  The `period` is the **UTC month**, so a new month starts a fresh budget with no
  reset job.
- **Admission is the charge**: `consumeAllowance()` increments the counter with
  one guarded upsert that only succeeds while the result stays within the plan
  limit. Never split "check" from "record" — that window is exactly how two
  simultaneous requests both pass against the same remaining allowance.
- Refusals refund metrics already charged by the same request, so a
  multi-metric request never half-charges.
- **Tokens are best-effort**: the prompt estimate is charged at admission and
  the provider's larger reported total is reconciled afterwards with
  `recordUsageOnce(receiptKey)`; the receipt makes a replay a no-op, never a
  double charge. Do not build logic that assumes exact token counts.
- `titles` is the bounded allowance for chat-title generation (a small billed
  provider call that is not a generation). It is never silently exempt.
- Queued tasks charge at `POST /api/tasks` (one generation + prompt estimate)
  and reconcile the output estimate when the runner reaches a terminal state.
  Resuming a task does not re-charge the generation it already paid for.
- A refused request must not increment the counter.

## Fail closed when accounting is unavailable

The accounting database is a security boundary, not a nice-to-have:

- **No D1 binding, or `USAGE_METERING_DISABLED=1`**: the documented unmetered
  mode. Nothing is counted and nothing is blocked (local dev, tests, an
  operator explicitly running without accounting).
- **D1 configured but failing**: `consumeAllowance` / `getUsage` /
  `checkAllowance` / `recordUsageOnce` throw `UsageUnavailableError`. Callers
  return the retryable `503` from `usageUnavailableResponse()` (code
  `usage_unavailable`) and **must not start provider work**. A failed read is
  never reported as a zero balance, and a missing `meta.changes` on a write is
  treated as an outage, not as success.
- Wrap each gate in `try/catch`: limit refusals are `402`
  (`limitResponse`), unavailability is `503`. Never let a non-`limit` refusal
  fall through as "allowed".

## Verification

```bash
node tests/usage-metering-contract.mjs
npx vitest run tests/usage-atomicity.test.js
```

The contract is a plain Node script, not a Vitest suite: `npx vitest run
tests/usage-metering-contract.mjs` matches no test file and exits 1, which reads
as a failure when nothing is wrong. It also runs inside
`npm run test:cloudflare`.

`tests/usage-atomicity.test.js` runs the real SQL against SQLite (node:sqlite)
and proves the exactly-one-admitted race, the refund path, receipt idempotency
and the unavailable-store refusals.

When you change a limit, assert **both** sides: the request at the limit is
refused with `402`, and the request just below it succeeds. A test that only
checks refusal passes even when the limit is off by one.

## Related skills

- `payments-billing` - how the plan was granted.
- `backend-architecture` - status codes and error envelopes.
- `ai-infrastructure` - token accounting upstream of the counters.
