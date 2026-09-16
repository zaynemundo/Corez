---
name: cursor-security-rules
description: Use when scanning code for hardcoded API keys or secrets, command injection via child_process exec, innerHTML XSS, rm -rf or force push, or unsafe npm dependencies. Not for general code review - use `code-review-testing` instead.
---

# Security Rules for AI Coding Agents

> **Canonical Security Contract:** This file is the **single canonical source** for secret, injection, destructive-op, web/API, and supply-chain guardrails. `backend-architecture: Level 1` and `code-review-testing: §2 Security & Privacy` reference this file instead of duplicating checks. When updating a rule, update here only and keep cross-links in sync.

Mandatory security guardrails applied to ALL code written in this workspace. These rules prevent secret exposure, command injection, destructive operations, and unsafe dependency patterns. Violations must be fixed before any code is committed.

## When to use

- Scanning or reviewing code for hardcoded API keys, tokens, passwords, or committed `.env` / `.dev.vars` files.
- Checking shell usage for command injection or unsafe `child_process.exec` string interpolation.
- Reviewing web and API code for XSS, CORS, rate limiting, or server-side authorization gaps.
- Judging whether a destructive command (`rm -rf`, force push, hard reset) needs explicit approval.
- Auditing dependency installs, postinstall scripts, or lockfile usage for supply-chain risks.

## When not to use

- Full correctness review and test coverage of a change - use `code-review-testing`.
- Designing backend API contracts, validation schemas, or retry/failover behavior - use `backend-architecture`.
- Supplying the actual secret names and values for an environment - use `ask-env-values`.
- AI provider routing and model selection - use `ai-infrastructure`.

---

## 1. Secrets and Credentials (CRITICAL)

- [ ] NEVER hardcode API keys, tokens, passwords, or secrets in source code, config files, or tests
- [ ] NEVER commit `.env`, `.dev.vars`, `*.pem`, or credential files — verify `.gitignore` covers them
- [ ] NEVER log secrets to console, error messages, or telemetry (redact tokens to `***last4`)
- [ ] NEVER embed secrets in URLs, error strings, or stack traces
- [ ] Use environment variables / platform secrets (e.g., Workers `env` bindings, `--secret` vars) for all credentials
- [ ] When a secret must exist for local dev, reference it from an untracked local file (`.dev.vars`, `.env.local`) and add a `.example` template with placeholder values
- [ ] If a secret is exposed, report immediately and rotate/revoke it — do not continue silently

## 2. Command Injection and Shell Safety (CRITICAL)

- [ ] NEVER build shell commands by string interpolation of user input: `exec("git " + userInput)`
- [ ] Prefer argument-array APIs (`execFile`, `spawn` with args array) over string shells (`exec`, `child_process.exec`)
- [ ] NEVER concatenate unvalidated input into SQL, HTML, JSON, or file paths — use parameterized queries, textContent, `JSON.stringify`, and `path.join`/`resolve`
- [ ] Validate and whitelist inputs before use in filesystem paths (block `..`, absolute paths, null bytes)
- [ ] No `eval()`, `new Function()`, or `vm.runInNewContext` with untrusted input
- [ ] Treat all network inputs (fetch bodies, query params, headers) as untrusted

## 3. Destructive Operations (CRITICAL)

- [ ] NEVER run `rm -rf`, `git push --force`, `git reset --hard`, or `drop database` without explicit user approval
- [ ] NEVER overwrite user files outside the workspace root (block absolute paths to `/usr`, `/etc`, `/home`)
- [ ] Before destructive commands, stage with a dry-run or `git diff` preview and confirm
- [ ] Never bulk-format or mass-rewrite files not in scope of the current task

## 4. Web and API Safety

- [ ] Escape output: use `textContent` / `innerText` instead of `innerHTML` for user-controlled data (XSS)
- [ ] Sanitize dynamic content before inserting into HTML attributes or style blocks
- [ ] Validate and limit request sizes; enforce CORS allowlists; rate-limit public endpoints
- [ ] Never trust client-supplied IDs/paths for server-side authorization — check ownership server-side
- [ ] Use HTTPS for all external calls; validate `fetch` response status before parsing

## 5. Dependencies and Supply Chain

- [ ] NEVER install packages from unknown sources or with `--registry` overrides
- [ ] Prefer lockfile-based installs (`npm ci`); pin exact versions for critical deps
- [ ] Do not add dependencies when a standard library solution exists (fewer supply-chain risks)
- [ ] Flag suspicious postinstall scripts and deprecated packages in review

## 6. Sensitive Data Handling

- [ ] Do not store PII, tokens, or user content in logs or analytics beyond minimum need
- [ ] LocalStorage/DB entries containing sensitive data must be scoped, encrypted where possible, and never echoed to logs
- [ ] Redact personal data in test fixtures; never use real user data in examples or screenshots

---

## Verification

After writing code, run (uses `rg` when available, falls back to `grep -r`):

```bash
# Secret scan: look for key-like patterns in tracked files
if command -v rg >/dev/null 2>&1; then
  rg -i "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}" --glob '!node_modules/**' --glob '!dist/**' .
  rg -n "child_process\.(exec|execSync)\(" --glob '!node_modules/**' .
  rg -n "\.innerHTML\s*=" --glob '!node_modules/**' --glob '!dist/**' src || true
  git ls-files | rg "(\.env|\.dev\.vars|\.pem)$" || true
else
  grep -R -i -E "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][A-Za-z0-9_\-]{16,}" --exclude-dir=node_modules --exclude-dir=dist . || true
  grep -R -n "child_process\.\(exec\|execSync\)(" --exclude-dir=node_modules . || true
  grep -R -n "\.innerHTML\s*=" --exclude-dir=node_modules --exclude-dir=dist src || true
  git ls-files | grep -E "(\.env|\.dev\.vars|\.pem)$" || true
fi
```

Any hits must be resolved (or justified with an explicit comment) before the change is committed. Backend and review tasks should run this same canonical scan — see `backend-architecture: Level 1` and `code-review-testing: §2` which reference here.

## Related skills

- `backend-architecture` - Level 1 defers to this file as the canonical security contract.
- `code-review-testing` - Section 2 review gates reference these checks.
- `ask-env-values` - collects the real secret names and values these rules keep out of code.
