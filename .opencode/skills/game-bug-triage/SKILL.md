---
name: game-bug-triage
description: QA Lead skill for classifying bug severity, writing reproduction steps, and verifying fixes before closure.
version: 1.0.0
tags: [qa, bug-triage, severity, reproduction, verification]
dependencies: [game-qa-plan, game-regression, game-smoke-test]
token_estimate: 200
---

## 1. Severity Classification Guide

### CRITICAL
- Game crash on startup or during core loop
- Broken player controls (movement, jump, fire, pause)
- Loss of progress (save/load failure, level restart broken)
- Blocked path — player cannot advance past a required gate
- Audio feedback loop / unresponsive input
- Multiplayer desync that breaks gameplay

### IMPORTANT
- Visual glitch (z-index break, sprite flicker, missing frame)
- Incorrect score calculation or progression tracking
- Missing sound effect or music cue
- Edge case crash (e.g. rapid input, corner collision)
- UI element misalignment or clipping
- Game-over / victory condition triggers incorrectly

### MINOR
- Typo in UI text or instructions
- Cosmetic issue (color mismatch, border radius off by 1-2px)
- Non-standard behavior on unsupported browser
- Animation timing slightly off (no gameplay impact)
- Missing favicon or meta tags

---

## 2. Bug Report Template

```md
### Title
[CRITICAL|IMPORTANT|MINOR] Short description

### Severity
CRITICAL / IMPORTANT / MINOR

### Steps to Reproduce
1. Start the game (node: `npm run dev`)
2. Press [specific key/click]
3. Observe result

### Actual Result
What actually happens

### Expected Result
What should happen per spec

### Environment
- Browser: Chrome 115 / Firefox 128
- OS: Windows 11 / macOS 14
- Screen size: 1920x1080
- Build: commit hash or branch
```

---

## 3. Routing Rules

| Severity  | Assigned Agent         | SLA     |
|-----------|------------------------|---------|
| CRITICAL  | lead-programmer        | <1 hour |
| IMPORTANT | specialist-programmer  | <4 hours|
| MINOR     | fix-bucket / backlog   | <1 week |

Routing command:
```
agy-delegate.ps1 -Mode Implement -Task '[severity] bug: <title>' -Assignee <agent>
```

---

## 4. Reproduction Steps Validation

- [ ] Steps are numbered and unambiguous
- [ ] Steps start from a known clean state (fresh page load)
- [ ] Preconditions are listed (e.g. "player must have 3 lives")
- [ ] Steps are minimal — no extraneous actions
- [ ] Reproduced on two different browsers before filing
- [ ] Console errors captured (attach screenshot/log)

---

## 5. Fix Verification Criteria

- [ ] Bug is no longer reproducible using the same steps
- [ ] No regression in related systems (run smoke suite)
- [ ] Fix is covered by a new or updated test case
- [ ] Exit code of test suite is 0
- [ ] Visual inspection passes (if UI bug)
- [ ] Code review approved for the fix commit

---

## 6. Triage Workflow Summary

**Receive** → **Classify severity** → **Validate reproduction** →
**Route to agent** → **Verify fix** → **Close or escalate**
