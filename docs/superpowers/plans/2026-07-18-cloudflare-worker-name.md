# Cloudflare Worker Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the repository's deployed Cloudflare Worker from `new-corez` to `ai` while keeping its configuration contract and current deployment documentation consistent.

**Architecture:** This is a configuration-only rename. The shell contract remains the executable source of truth for the Wrangler name, while the README documents the current deployment target; application code and Cloudflare bindings remain unchanged.

**Tech Stack:** Wrangler JSONC configuration, Bash contract tests, Markdown documentation, Vite build.

## Global Constraints

- The Wrangler Worker name must be exactly `ai`.
- Do not change routes, the Worker entrypoint, asset bindings, or OpenRouter behavior.
- Leave historical design and implementation-plan documents unchanged.
- Do not store Cloudflare secret values in the repository.

---

### Task 1: Rename the Cloudflare Worker consistently

**Files:**
- Modify: `tests/cloudflare-worker-config-contract.sh:19`
- Modify: `wrangler.jsonc:3`
- Modify: `README.md:59`

**Interfaces:**
- Consumes: Wrangler's top-level `name` setting and the existing Bash `check` helper.
- Produces: A Wrangler deployment target named `ai`, enforced by the configuration contract and documented in the README.

- [ ] **Step 1: Change the contract expectation before the configuration**

Replace the Worker-name check in `tests/cloudflare-worker-config-contract.sh` with:

```bash
check 'Worker name matches the deployed Worker' '"name"[[:space:]]*:[[:space:]]*"ai"' "$config"
```

- [ ] **Step 2: Run the focused contract and verify the expected failure**

Run: `bash tests/cloudflare-worker-config-contract.sh`

Expected: exit status `1` with `FAIL: Worker name matches the deployed Worker`, proving the contract detects the old `new-corez` value.

- [ ] **Step 3: Apply the minimal configuration and documentation changes**

Set the top-level name in `wrangler.jsonc`:

```jsonc
"name": "ai",
```

Update the deployment sentence in `README.md`:

```markdown
Corez deploys the Vite SPA and `/api/openrouter` together as the `ai`
Cloudflare Worker.
```

- [ ] **Step 4: Run focused and regression verification**

Run: `bash tests/cloudflare-worker-config-contract.sh`

Expected: exit status `0` with `Cloudflare Worker configuration contract passed.`

Run: `npm run build`

Expected: exit status `0` and a completed Vite production build.

Run: `git diff --check`

Expected: exit status `0` with no output.

- [ ] **Step 5: Obtain an independent read-only diff review**

Run:

```powershell
.\scripts\agy-delegate.ps1 -Mode ReviewDiff -Task 'Review the Cloudflare Worker rename for correctness, consistency, regressions, and missing verification.'
```

Expected: AGY reports no unresolved correctness or consistency issue. Codex must inspect its response and the complete diff independently.

- [ ] **Step 6: Commit the verified implementation**

```bash
git add README.md tests/cloudflare-worker-config-contract.sh wrangler.jsonc docs/superpowers/plans/2026-07-18-cloudflare-worker-name.md
git commit -m "chore: rename Cloudflare Worker to ai"
```
