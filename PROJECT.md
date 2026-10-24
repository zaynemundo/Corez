# CoreZ

A creation assistant that runs on Cloudflare Workers: it chats, builds websites,
apps and games, generates images, researches the open web into a PDF report, and
publishes finished creations as public links.

This file is the architecture map. How to run and verify it lives in
[TEST_INFRA.md](./TEST_INFRA.md); the commands a user types are in
[README.md](./README.md).

## Runtime surfaces

```
Browser (React SPA)  ──/api/*──▶  Cloudflare Worker  ──▶  OpenCode Go gateway (text)
        │                            │  ├──────────────▶  Workers AI / OpenRouter (images, rerank, embed)
        │  /<slug> (public)          │  ├──────────────▶  D1 (accounts, chats, tasks, usage, billing)
        └────────────────────────────┘  └──────────────▶  R2 (assets, apps, publish records)
```

| Surface | Where | Responsibility |
|---|---|---|
| Worker | `worker/entry.js` → `worker/index.js` | HTTP surface, auth gate, provider routing, creation harness, publish store, task queue |
| Web app | `src/` | Chat, canvas preview, projects/sidebar, settings, i18n (en + ar, RTL), consent |
| Agent core | `packages/agent-core/` | Provider adapters and model ids, swarm orchestrator, design systems, skills |
| CLI | `packages/cli/` | `corez` commands (plan, build, fix, review, swarm) over the same agent core |

## Worker, in layers

- **Entry and auth** — `worker/entry.js` gates `/api/*` routes and dispatches to
  `worker/index.js`; `worker/auth.js` owns sessions and the fail-closed rule (a
  production deployment without `AUTH_SECRET` refuses protected routes instead of
  handing out the development identity).
- **AI** — `/api/ai` streams SSE from one provider call
  (`worker/providerChain.js`, `worker/opencodeClient.js`); the model router picks
  reasoning effort and temperature from the prompt's complexity and intent
  (`worker/modelRouter.js`, clamped to the one allowed text model). Images go
  through `/api/image` (OpenRouter) and `/api/image/cf` (Workers AI), with the
  prompt enhancer in `worker/imagePrompt.js`.
- **Creation harness** — `worker/harness.js` runs plan → build → verify → repair →
  review for `@website` / `@game` builds, checkpointing durable state so a
  disconnected or evicted build resumes instead of restarting. `worker/swarm.js`
  is its specialist pre-pass: parallel short briefs that inform the single
  streamed artifact, never a gate.
- **Durable tasks** — `POST /api/tasks` hands long work to a queue
  (`worker/taskRunner.js`) with a D1 dispatch outbox and a cron sweep, so an HTTP
  disconnect cannot cancel a task.
- **Storage** — `worker/storageKeys.js` is the single R2 key layout
  (`users/<uid>/…`); `worker/publishStore.js` owns published pages (resolve,
  write, unpublish, asset visibility); `worker/schema.sql` and
  `worker/dbSchema.js` are the canonical D1 schema, kept in step by
  `tests/db-schema-layout.test.js`.
- **Money** — `worker/usage.js` meters every paid call per account per month and
  refuses with 402 past the plan budget; `worker/subscriptions.js` and
  `worker/ziina.js` own plans, checkout and webhooks.

## Publishing model

A published page is one R2 record (`users/<uid>/publish/<slug>.json`) plus a tiny
public pointer (`publish/<slug>.json`) so `/<slug>` resolves without knowing the
owner. Two rules make deletion behave:

1. A published page belongs to the chat that produced it — the record carries the
   chat id, so deleting that chat unpublishes the page (`worker/chats.js`
   `cleanupChatStorage`).
2. Images are public only while a live page references them: the publish flow
   leaves an `asset-pub/<key>` marker, and unpublishing drops the markers no other
   page needs.

Pages published before rule 1 existed carry no chat id. The browser that published
them offers its local lineage to `POST /api/publish/lineage`, which attributes the
page to a surviving chat or unpublishes it when that chat is gone.

## Published-site analytics

`worker/siteAnalytics.js` counts real visits to a published page while it is being
served (`handlePublish` in `worker/index.js`) and answers the owner-only report at
`GET /api/publish/<slug>/analytics?days=7|30|90`. Counts live in four D1 tables
(`site_analytics_daily`, `_breakdown`, `_visits`, `_visitors`): views per page,
referrer host, country, device class, and a visitor fingerprint that makes
unique/returning possible without a cookie. The fingerprint is an HMAC of
site + IP + user agent truncated to 16 hex chars; the raw inputs are never
stored, DNT/GPC views are counted anonymously, and bot, prefetch and owner
traffic is skipped. Fingerprints are pruned after 90 days and unpublishing a
page deletes its analytics (`deletePublishRecord`). The Sites screen
(`src/components/SiteAnalyticsPanel.jsx`) shows the tiles, daily chart, top pages,
sources, countries and devices for each card.

## Swarm framework (`packages/agent-core/swarm`)

A general DAG orchestrator used by the CLI and by the harness pre-pass:
`decideSwarmMode` routes a task to the 3-node fast DAG (explorer → engineer →
reviewer) or the specialist DAG (explorer → architect → frontend/backend →
tester → reviewer). Executions are gated by atomic multi-resource locks
(`ResourceLockManager`), propagate upstream deliverables instead of whole
transcripts, retry through a verifier with its evidence attached, and merge
deterministically in topological order (`mergeOutputsInDagOrder`,
`HierarchicalSynthesis` for token-chunked waves). `AdaptiveConcurrencyQueue`
scales concurrency and backs off on HTTP 429.

## Interface contracts

`GenericSwarmOrchestrator` ↔ `TaskDependencyGraph`
- `acquireLocks(resources, agentId) → { success, lockedResource?, currentOwner? }`
- `releaseAllLocksForAgent(agentId) → void`
- `getReadyTasks() → Task[]`, `getTopologicalOrder() → string[]`
- `handleDecomposition(taskId, subtasks) → void`

`GenericSwarmOrchestrator` ↔ verifier
- `verifier({ task, output, projectState }) → { ok, evidence?, fixes? }`
- `ok: false` retries with the evidence injected, up to the role's attempt cap.

`worker/harness.js` ↔ `worker/swarm.js`
- `runSwarmSpecialists({ spec, env, signal }) → { contributions, executionTimeMs }`
- `buildSwarmContext(spec, contributions, options) → string`

## Where to look first

| Task | File |
|---|---|
| A route 404s or is unauthenticated | `worker/entry.js`, `worker/index.js` |
| An AI reply is empty, truncated or reasoning-only | `worker/providerChain.js`, `worker/opencodeClient.js` |
| A build never finishes or loses work | `worker/harness.js`, `worker/taskRunner.js` |
| A published page will not load or delete | `worker/publishStore.js`, `worker/chats.js` |
| Site analytics are missing or look wrong | `worker/siteAnalytics.js`, `src/components/SiteAnalyticsPanel.jsx` |
| A quota blocks or lets through the wrong thing | `worker/usage.js` |
| Storage keys or a migration look wrong | `worker/storageKeys.js`, `worker/storageMigrate.js` |
| Interface copy, layout or direction is wrong | `src/index.css`, `src/i18n/` |
