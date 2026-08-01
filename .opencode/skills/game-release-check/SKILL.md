---
name: game-release-check
description: Producer final-gate skill for release signoff checklists that block release when any check fails.
version: 1.0.0
tags: [release, signoff, gate, qa, code-review]
dependencies: [game-qa-plan, game-regression, game-smoke-test, game-performance-review, game-code-review, game-visual-review, game-bug-triage, game-publish]
token_estimate: 100
---

## 1. Final Signoff Checklist

Every release candidate must pass ALL checks below. If any check is ❌, the release is BLOCKED.

```
Checklist for Release <version> (commit <hash>)
===============================================

 QA Test Suite Passes
   [ ] Full regression suite: exitCode === 0
   [ ] Smoke test suite: exitCode === 0
   [ ] All new tests pass

 Code Review Approved
   [ ] No CRITICAL findings
   [ ] All IMPORTANT findings resolved or documented
   [ ] MINOR findings fewer than 3, no gameplay impact

 Visual Inspection Passed
   [ ] Screenshots match art-direction.json spec
   [ ] Z-index layering conforms to spec (Background z:0, Content z:10, HUD z:20, Overlays z:40+)
   [ ] Responsive layout verified at 375px, 768px, 1440px

 Performance Budget Met
   [ ] 60 FPS sustained for 30s of normal gameplay
   [ ] Physics ≤4ms, Render ≤8ms, Input <1ms, Audio ≤2ms
   [ ] No frame drops in DevTools Performance recording

 Bug Triage
   [ ] Zero open CRITICAL bugs
   [ ] Zero open IMPORTANT bugs
   [ ] All MINOR bugs accepted as known-issues list (max 5)

 Mobile / Responsive Verified
   [ ] Canvas scales without overflow
   [ ] Touch controls functional
   [ ] No horizontal scroll on any viewport width
```

---

## 2. Evidence Collection Requirements

Before signoff, collect and attach the following artifacts:

| Check | Evidence | Storage Path |
|-------|----------|-------------|
| QA suite | `npm test` terminal output | `release-evidence/<version>/test-output.txt` |
| Code review | Review report from code-reviewer (written by `game-code-review` to `docs/review/`) | `release-evidence/<version>/code-review.md` |
| Visual inspection | Screenshots (menu, gameplay, pause, game-over) — captured by `game-visual-review` to `review/screenshots/` | `release-evidence/<version>/screenshots/` |
| Performance | DevTools recording export (.json) | `release-evidence/<version>/performance-profile.json` |
| Bug triage | Bug tracker snapshot or list | `release-evidence/<version>/known-issues.md` |

Collection command:
```bash
mkdir -p release-evidence/<version>/screenshots
npm test > release-evidence/<version>/test-output.txt 2>&1
cp docs/review/code-review.md release-evidence/<version>/
cp -r review/screenshots/* release-evidence/<version>/screenshots/
# manually add performance profile
```

---

## 3. Gate Failure Handling

### Soft Failure (non-blocking — proceed with note)
- 1-2 MINOR bugs accepted as known-issues
- Performance within 10% of budget (17.6ms frames occasionally)
- Code review has minor style suggestions only

### Hard Failure (release BLOCKED)
- Any CRITICAL or IMPORTANT bug open
- Test suite exitCode !== 0
- Code review has CRITICAL finding (safety, security, data loss)
- Performance budget exceeded by >20%
- Visual spec mismatch in core gameplay screens

On hard failure:
1. Record the failing gate and evidence
2. Tag release as `BLOCKED-<reason>` in commit message
3. Route to appropriate agent via bug triage
4. Schedule re-check after fix
5. Do not push release tag

---

## 4. Release Artifact Preparation

When all checks pass:

```bash
# 1. Tag the release
git tag -a "v<version>" -m "Release v<version>"

# 2. Build production bundle
npm run build

# 3. Verify build output exists
ls -la dist/  # or build/ or out/

# 4. Create release notes
cat > RELEASE_NOTES.md << 'EOF'
# Release v<version>
Date: <YYYY-MM-DD>
Commit: <hash>

## What's New
- 

## Bug Fixes
- 

## Known Issues
- 

## Verification
- QA: exitCode 0 (see release-evidence/<version>/test-output.txt)
- Code review: approved (see release-evidence/<version>/code-review.md)
- Performance: 60fps sustained (see release-evidence/<version>/performance-profile.json)
EOF

# 5. Push
git push origin v<version>
```

---

## 5. Signoff Authority Matrix

| Role              | Can Signoff QA? | Can Signoff Code? | Can Signoff Release? |
|-------------------|:---:|:---:|:---:|
| QA Lead           | ✅  | ❌  | ❌  |
| Code Reviewer     | ❌  | ✅  | ❌  |
| Technical Director| ✅ | ✅ | ❌  |
| Producer          | ❌  | ❌  | ✅  |

Only the **Producer** may give final release signoff. All prior gates must show evidence of approval from the appropriate authority.

### Signoff Statement

> "I confirm that all gates have passed, evidence is collected at `release-evidence/<version>/`, and this release is ready for deployment."
>
> — `<Producer Name>`, `<YYYY-MM-DD>`
