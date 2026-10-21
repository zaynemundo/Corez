# Testing

Two layers, one rule: a green run must mean the checks actually ran.

| Layer | Command | What it proves |
|---|---|---|
| Unit / UI suite (Vitest, jsdom) | `npm test` | Components, services, worker modules, contracts expressed as vitest tests — 168 files |
| Behaviour contracts (scripts) | `npm run test:contracts` (alias `npm run test:cloudflare`) | The Worker's real HTTP behaviour, the published-page and queue contracts, security invariants, and the UI/design contracts that read `src/index.css` |
| Component suites | `npm run test:swarm` · `npm run test:game` · `npm run test:reliability` | Focused subsets for iteration |
| Benchmarks | `npm run benchmark` (`:live`, `:e2e`) | Weighted quality evaluation over `benchmarks/` cases |

## Running a single contract

`scripts/run-contracts.mjs` is the definition of the contract suite:

```bash
node scripts/run-contracts.mjs --list                 # every check, with its runner
node scripts/run-contracts.mjs --only publish         # checks whose name matches
node scripts/run-contracts.mjs                        # all of them, printing every failure
```

It runs the checks one by one, prints the output tail of each failure, and
summarises what failed instead of stopping at the first red — the old `&&` chain
hid two stale expectations behind `cloudflare-worker-contract.mjs:771` for months.
On Windows it finds Git Bash itself (the `bash` on PATH is usually the WSL
launcher, which cannot run these scripts); set `COREZ_BASH` to override.

A skipped check is not a pass: no working `bash` fails the run rather than quietly
dropping eleven shell contracts.

## Rules this suite enforces

- **No orphan contracts.** `tests/cloudflare-worker-config-contract.sh` asserts that
  every `tests/*-contract.{sh,mjs}` appears in `scripts/run-contracts.mjs`, so a new
  contract cannot be written and never run.
- **Shipped English is frozen.** `tests/i18n-coverage.test.jsx` fails on a reworded
  string (an accidental edit breaks every UI test that asserts the original copy)
  and on a dictionary key no component uses. New copy needs both `en` and `ar`.
- **The schema has one source.** `tests/db-schema-layout.test.js` keeps
  `worker/dbSchema.js` and `worker/schema.sql` in step, and keeps the R2 key layout
  and publish helpers exported.
- **The design contract is generated.** `npm run art:check` fails when a design
  token changes without regenerating the artifact reviewers cite.
- **Behaviour contracts pin intent, not copy.** Where a check asserts on model
  input it compares against the module that produces it (e.g.
  `enhanceImagePrompt`) instead of a frozen string, so a deliberate improvement
  does not read as a regression.

## CI lanes

`.github/workflows/verify-shared.yml` is the single definition of "verified"; both
`.github/workflows/verify.yml` (pull requests) and
`.github/workflows/deploy.yml` (push to `main`, which gates the deploy) call it.

- `verify-fast` — lint, `npm test`, production build, `evaluate:intents`,
  `audit:skills`, `art:check`
- `verify-contracts` — `npm run test:cloudflare` (the whole suite above) and
  `npm run test:swarm`

## Adding a test

Put unit and component tests in `tests/*.test.{js,jsx}` (Vitest picks them up).
For something only observable at the Worker boundary — a header, a status code, an
R2 record, a D1 row — add it to the relevant `tests/*-contract.mjs`, or start one
and list it in `scripts/run-contracts.mjs`.

Fixtures: `tests/helpers/sqliteD1.js` is a real SQLite adapter shaped like D1 (lazy
statement compilation, transactional `batch`), and several contract tests build an
in-memory R2 bucket — no network, no credentials.
