# Cloudflare Workers AI GLM-4.7-Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Corez's paid-only GLM-5.2 production model with the free-plan-compatible `@cf/zai-org/glm-4.7-flash` model.

**Architecture:** Keep the existing native Workers AI binding, `/api/ai` request flow, minimal `messages` request, and `{ content, model }` response adapter. Change the fixed model identity and active documentation only; historical design and implementation records remain untouched.

**Tech Stack:** Cloudflare Workers AI, JavaScript, Bash contract tests, Node.js assertions, React, GitHub Actions, Wrangler 4.

## Global Constraints

- Production model: `@cf/zai-org/glm-4.7-flash`.
- Preserve `POST /api/ai`, the `AI` binding, prompt construction, structured logging, sanitized errors, and static asset handling.
- Preserve the successful response shape `{ content, model }`.
- Keep the documented minimal `{ messages }` inference payload.
- Do not rewrite historical files under `docs/superpowers/specs/` or `docs/superpowers/plans/`.

---

### Task 1: Substitute the active production model

**Files:**
- Modify: `tests/cloudflare-worker-contract.mjs`
- Modify: `tests/workers-ai-provider-contract.sh`
- Modify: `tests/public-ai-proxy-contract.sh`
- Modify: `worker/index.js`
- Modify: `README.md`
- Modify: `src/components/SettingsModal.jsx`

**Interfaces:**
- Consumes: `env.AI.run(model, { messages })` and `POST /api/ai` with `{ prompt, intent }`.
- Produces: HTTP 200 JSON `{ content: string, model: "@cf/zai-org/glm-4.7-flash" }`.

- [ ] **Step 1: Write the failing model contracts**

Change the Node contract constant to:

```js
const MODEL = '@cf/zai-org/glm-4.7-flash';
```

Change the provider contract to require the new model and reject GLM-5.2 in
`worker/index.js`:

```bash
check 'Worker uses the GLM-4.7-Flash model' '@cf/zai-org/glm-4[.]7-flash' "$worker"
check_absent 'Worker does not use the paid-only GLM-5.2 model' '@cf/zai-org/glm-5[.]2' "$worker"
```

Change the public proxy contract to require `GLM-4.7-Flash` in Settings and
reject `GLM-5.2` there.

- [ ] **Step 2: Run the focused contracts and verify RED**

Run:

```bash
node tests/cloudflare-worker-contract.mjs
bash tests/workers-ai-provider-contract.sh
bash tests/public-ai-proxy-contract.sh
```

Expected: failures show the production Worker and Settings still identify
GLM-5.2 instead of GLM-4.7-Flash.

- [ ] **Step 3: Implement the minimal substitution**

Set the Worker constant to:

```js
const WORKERS_AI_MODEL = '@cf/zai-org/glm-4.7-flash';
```

Update active README and Settings text from `GLM-5.2` /
`@cf/zai-org/glm-5.2` to `GLM-4.7-Flash` /
`@cf/zai-org/glm-4.7-flash`. Do not change request fields, response parsing, or
historical documents.

- [ ] **Step 4: Run the focused contracts and verify GREEN**

Run:

```bash
npm run test:cloudflare
```

Expected: all Cloudflare Worker behavior, configuration, provider, proxy,
intent-response, and environment-skill contracts pass.

- [ ] **Step 5: Run the full verification matrix**

Run:

```bash
for test_file in tests/*.sh; do bash "$test_file" || exit; done
node tests/cloudflare-worker-contract.mjs
node tests/ai-live-intent-eval-response-contract.mjs
npm run evaluate:intents
npm run lint
npm run build
npx wrangler deploy --dry-run --outdir /tmp/corez-glm-47-flash-dry-run
git diff --check
```

Expected: every command exits 0; intent gates pass; Wrangler reports `env.AI`
and `env.ASSETS` bindings.

- [ ] **Step 6: Obtain and assess an independent diff review**

Use the repository AGY workflow in analysis-only diff-review mode. Confirm any
finding against the Cloudflare GLM-4.7-Flash model documentation and the full
files; address actionable findings and rerun affected verification.

- [ ] **Step 7: Commit and deploy**

Run:

```bash
git add -A
git diff --cached --check
git commit -m "fix: use GLM-4.7-Flash on Workers Free"
git fetch origin main
git rebase origin/main
git push origin main:main
```

Watch the deployment workflow through the hosted contract suite, build, and
Cloudflare publish.

- [ ] **Step 8: Verify production inference**

Send a real request to:

```text
POST https://ai.zayne-mayo.workers.dev/api/ai
```

with a small static prompt. Expected: HTTP 200, non-empty `content`, and
`model: "@cf/zai-org/glm-4.7-flash"`.
