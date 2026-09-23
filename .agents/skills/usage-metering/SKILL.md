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
- Every counted metric is incremented through the same helper so that a metric
  cannot be half-counted from one call site.
- **Tokens are best-effort**: the provider reports usage when it does, and
  otherwise an estimate (~4 characters per token) is recorded in the same
  counter. Do not build logic that assumes exact token counts.
- A refused request must not increment the counter.

## Degradation, not breakage

Nothing is metered when there is no database bound, and nothing is ever blocked
in that case. Metering is a gate on top of a working product - a metering fault
must never take the product down. Preserve that property: wrap counter writes so
a failure degrades to "not metered" rather than to a `500`.

`USAGE_METERING_DISABLED=1` accepts every request without counting or limiting
it. Use it to isolate whether a bug is metering-related.

## Verification

```bash
npx vitest run tests/usage-metering-contract.mjs
```

When you change a limit, assert **both** sides: the request at the limit is
refused with `402`, and the request just below it succeeds. A test that only
checks refusal passes even when the limit is off by one.

## Related skills

- `payments-billing` - how the plan was granted.
- `backend-architecture` - status codes and error envelopes.
- `ai-infrastructure` - token accounting upstream of the counters.
