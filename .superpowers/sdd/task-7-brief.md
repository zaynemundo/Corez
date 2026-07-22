### Task 7: Documentation, secret configuration, full verification, and deployment readiness

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/deploy.yml` only if the standard suite name changes.
- Verify: all changed source, tests, built assets, and Git diff.

**Interfaces:**
- Consumes all prior tasks.
- Produces an operator-facing secret configuration instruction and verified release candidate.

- [ ] **Step 1: Document runtime behavior and secret setup**

Add a `Live market data` section to `README.md`:

````markdown
## Live market data

Supported market-price and conversion prompts are handled before the general AI route and render as structured cards in chat. The Cloudflare Worker calls Twelve Data through `POST /api/market`; the browser never receives the provider credential.

Configure the production Worker secret interactively:

```text
npx wrangler secret put TWELVE_DATA_API_KEY
```

Do not add the value to `.env`, `wrangler.jsonc`, source files, tests, logs, or GitHub Actions variables exposed to builds. If the secret is absent, the market endpoint returns a safe `not_configured` response and no fallback price.
````

- [ ] **Step 2: Configure the production Worker secret without exposing it**

Use the exact user-provided value only through Wrangler's hidden interactive prompt:

```bash
npx wrangler secret put TWELVE_DATA_API_KEY
```

Expected: Wrangler confirms the secret was uploaded. Do not place the value on the command line, in shell history, in a file, or in captured logs. If the current environment is not authenticated to the intended Cloudflare account, stop this step and ask the owner to run the same command locally.

- [ ] **Step 3: Run targeted and full verification**

```bash
npm run test:market
npm run test:cloudflare
npm run evaluate:intents
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0. A missing script is reported as missing and is not treated as passing.

- [ ] **Step 4: Audit for credential and hardcoded-price leakage**

Run searches using variable names and known forbidden phrases, never the real secret value:

```bash
grep -RInE "TWELVE_DATA_API_KEY[[:space:]]*[:=][[:space:]]*['\"]?[A-Za-z0-9]{16,}|live market snapshot|Gold Spot.*3240|BTC.*66259" src worker tests dist README.md wrangler.jsonc .github || true
git diff --name-only HEAD
git status --short
```

Expected: the first command produces no credential assignment and no retired hardcoded quote phrase. The changed-path list contains only planned files.

- [ ] **Step 5: Perform independent diff review and commit documentation**

Use the repository wrapper in analysis-only review mode:

```powershell
.\scripts\agy-delegate.ps1 -Mode ReviewDiff -Task 'Review the inline live market card implementation for fabricated-price risks, credential leakage, cache/stale correctness, accessibility regressions, and missing tests.'
```

If PowerShell or AGY is unavailable, report that explicitly and perform the same tracked-diff review locally without bypassing permissions. Address every confirmed issue, rerun the affected checks, then commit:

```bash
git add README.md .github/workflows/deploy.yml
git commit -m "docs: document live market data"
```

Do not include `.github/workflows/deploy.yml` in the `git add` command if it was not changed.

- [ ] **Step 6: Complete repository Git policy**

Invoke the repository-local `git-superpowers` skill. Confirm the branch is `main`, the worktree is clean after commits, and all verification output is current. Push local `main` to `origin/main` without a merge commit. Stop and report if the branch is not `main` or if any required verification failed.
