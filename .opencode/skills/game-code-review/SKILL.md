---
name: game-code-review
description: Code Reviewer skill for evaluating code against game specifications, security rules, and performance guidelines.
version: 2.0.0
tags:
  - game-review
  - code-quality
  - performance-audit
  - spec-compliance
  - security
dependencies:
  - game-spec
  - game-architecture
  - game-art-direction
token_estimate: 6500
entry_criteria:
  - Actor MUST have read-only access to the target source files
  - Game specification (game-spec.json or equivalent) MUST be available for comparison
  - Art direction document (art-direction.json or equivalent) SHOULD be available for visual review
exit_criteria:
  - All findings are documented in structured JSON format per review-output-schema
  - Every spec requirement has a PASS/FAIL/NOT-COVERED classification
  - Verification checklist has been executed and results recorded
  - Review findings are handed off to primary-executor for remediation
---

# Game Code Review Skill

Structured code review playbook for browser-based games. This skill enforces best practices across
performance, memory management, specification compliance, security, and code quality.

```
  ┌──────────────────────────────────────────────────────────────┐
  │  GAME CODE REVIEW WORKFLOW                                   │
  │  1. Spec Compliance Scan    -- Compare code to game-spec     │
  │  2. Frame-Rate Audit        -- Inspect rAF hot paths         │
  │  3. Memory & Leak Check     -- Listener/interval cleanup      │
  │  4. Security Scan           -- Injections, secrets, eval     │
  │  5. Code Quality Pass       -- Types, magic numbers, errors  │
  │  6. Findings Report         -- Structured JSON output         │
  └──────────────────────────────────────────────────────────────┘
```

---

## 1. Review Checklist Sections

### 1A. Frame-Rate Impact

Inspect every function called inside or indirectly from `requestAnimationFrame`.
Allocation in a rAF loop is the #1 cause of frame drops.

- [ ] No object allocations inside rAF callbacks (no `new X`, no `{...}` spread, no `[...arr]`).
- [ ] No `JSON.parse` or `JSON.stringify` in per-frame code paths.
- [ ] Draw calls are batched; no redundant `ctx.save()`/`ctx.restore()` per entity.
- [ ] No `map`, `filter`, `reduce` inside hot loops -- prefer `for`/`while` with pre-allocated arrays.
- [ ] Particle systems cap active particles and reuse pooled objects instead of splice-shifting.
- [ ] Canvas dimensions match CSS display size (avoids implicit rescale cost).
- [ ] No `querySelector` or DOM reads inside rAF (forces layout reflow).
- [ ] Delta-time is clamped (`Math.min(dt, 0.1)`) to avoid spiral-of-death on tab resume.

```javascript
// PASS -- no allocation, no layout thrash
function updatePositions(entities, dt) {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }
}

// FAIL -- allocates new array every frame
function updatePositionsBAD(entities, dt) {
  entities.forEach(e => {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  });
}
```

### 1B. Memory & Leaks

JavaScript garbage collection pauses cause visible stutter. Every subscription
must have a corresponding unsubscribe.

- [ ] Every `addEventListener` has a paired `removeEventListener` referencing the same handler function (not an anonymous inline).
- [ ] `requestAnimationFrame` ID is saved; `cancelAnimationFrame(id)` called on unmount or game-over.
- [ ] `setInterval` / `setTimeout` IDs are saved; `clearInterval` / `clearTimeout` called on cleanup.
- [ ] No detached DOM references held in closures (prevents subtree GC).
- [ ] Web Audio `AudioContext` is suspended, not closed (or properly closed on unmount).
- [ ] Object pools are drained/reset between levels, not leaked.
- [ ] No global arrays that grow unbounded (replay logs, entity arrays -- cap or ring-buffer).

```javascript
// PASS -- proper cleanup pattern
useEffect(() => {
  let animId;
  const loop = () => { animId = requestAnimationFrame(loop); };
  animId = requestAnimationFrame(loop);

  const onKey = (e) => handleInput(e);
  window.addEventListener('keydown', onKey);

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKey);
  };
}, []);
```

### 1C. Spec Compliance

Cross-reference every requirement in `game-spec.json` against the implementation.

- [ ] Controls match spec (WASD / Arrows / Touch input maps match documented layout).
- [ ] Win condition triggers at the correct state transition and score threshold.
- [ ] Loss condition triggers at zero health, timeout, or fall-off-map as specified.
- [ ] Score calculation matches formula in spec (no off-by-one, no missing multiplier, no integer truncation where float expected).
- [ ] Level/wave progression increments at the correct trigger point.
- [ ] Enemy spawn timing and count match spec intervals.
- [ ] Power-up effects have correct duration and magnitude.
- [ ] Invincibility frames / respawn invulnerability window matches spec duration.
- [ ] Sound effect mappings: every named sound in spec (`jump`, `hit`, `coin`, `explosion`, `gameover`) has a corresponding `playSound()` call.

```javascript
// PASS -- score matches spec formula: base + (combo * multiplier)
function calculateScore(base, combo, multiplier) {
  return base + (combo * multiplier);
}

// FAIL -- omits multiplier from spec
function calculateScoreBAD(base, combo) {
  return base + combo;
}
```

### 1D. Security

Browser games are packaged as static bundles; secrets and injection vectors
must be eliminated.

- [ ] No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML` with any user-supplied or dynamically-computed content.
- [ ] No `eval`, `new Function()`, `setTimeout(string)`, or `setInterval(string)` anywhere.
- [ ] No API keys, tokens, secrets, or database URLs in client-side bundle (verify by grep for `api_key`, `secret`, `password`).
- [ ] No unsanitized `location.hash`, `location.search`, `postMessage` data written to DOM.
- [ ] localStorage/sessionStorage values are validated on read (type-check, length-check) before use.
- [ ] No `document.write` or `document.open` calls.
- [ ] Third-party CDN scripts are pinned to a specific version (no `@latest` or semver ranges).

```javascript
// PASS -- safe text insertion
const el = document.getElementById('score');
el.textContent = String(score);

// FAIL -- XSS vector
const el = document.getElementById('score');
el.innerHTML = '<span>' + score + '</span>';
```

### 1E. Code Quality

Readability and maintainability directly affect iteration speed.

- [ ] No magic numbers (all numeric literals > 1 are named constants).
- [ ] Consistent error handling: either all-`try/catch` or all-result-object, never mixed.
- [ ] TypeScript: all function parameters and return types are explicitly typed (no `any`).
- [ ] React: props are typed via interface/type, component names are PascalCase.
- [ ] File length under 400 lines of logic (extract helpers, constants, types to separate files).
- [ ] No commented-out code blocks left in source.
- [ ] Exports are explicit (named exports, not `export default` anonymous objects).
- [ ] Consistent naming: verbs for functions (`handleJump`), nouns for values (`playerVelocity`), booleans prefix with `is`/`has`/`can`.

---

## 2. Review Output Format

### Output Files

The review writes TWO files:

| File | Path | Contents |
|------|------|----------|
| Findings | `docs/review/findings.json` | Structured JSON per schema below |
| Report | `docs/review/code-review.md` | Human-readable summary for `game-release-check` |

`docs/review/` is created on demand by this skill; the Producer's `game-release-check`
collects `docs/review/code-review.md` into release evidence, so these paths MUST NOT be
relocated without updating `game-release-check` too.

All findings must be reported as structured JSON conforming to the schema below.
Each finding is a single object; findings are collected in an array.

```json
{
  "findings": [
    {
      "id": "FR-001",
      "severity": "critical",
      "category": "frame-rate",
      "file": "src/engine/gameLoop.ts",
      "line": 42,
      "summary": "Object allocation inside rAF loop creates GC pressure every frame",
      "detail": "Spread operator on line 42 creates a new object each frame. Move the spread to initialization or mutate in place.",
      "code": "this.entities = [...this.entities, entity];",
      "recommendation": "Use push() or pre-allocated array with index tracking.",
      "spec_ref": null,
      "pass": false
    },
    {
      "id": "SC-001",
      "severity": "major",
      "category": "spec-compliance",
      "file": "src/game/score.ts",
      "line": 18,
      "summary": "Score formula omits combo multiplier required by spec",
      "detail": "spec.json section 3.2 defines score as `base * (1 + combo * multiplier)`. Implementation uses `base + combo * multiplier`.",
      "code": "return base + (combo * multiplier);",
      "recommendation": "Change to `return base * (1 + combo * multiplier);`",
      "spec_ref": "game-spec.json#/mechanics/scoring/formula",
      "pass": false
    }
  ],
  "meta": {
    "reviewed_by": "game-code-review",
    "review_date": "2026-07-30",
    "spec_version": "1.2.0",
    "files_reviewed": ["src/engine/gameLoop.ts", "src/game/score.ts", "src/ui/HUD.tsx"],
    "total_findings": 2,
    "critical": 1,
    "major": 1,
    "minor": 0,
    "pass_count": 14
  }
}
```

### Severity Levels

| Level | Label | Definition | Action Required |
|-------|-------|------------|-----------------|
| 1 | critical | Causes crash, freeze, data loss, or security vulnerability | Must fix before merge |
| 2 | major | Functional bug, spec deviation, significant performance issue | Must fix before release |
| 3 | minor | Code smell, style violation, minor performance concern | Fix if time permits |
| 4 | advisory | Suggestion, optional improvement | Document for backlog |

### Category Values

- `frame-rate` -- hot-path allocation, layout thrash, draw-call batching
- `memory-leak` -- listener/subscription/timer cleanup
- `spec-compliance` -- mismatch with game-spec.json or art-direction.json
- `security` -- injection vector, secret exposure, unsafe API
- `code-quality` -- magic numbers, typing, naming, structure
- `accessibility` -- keyboard nav, contrast, aria labels (when UI reviewed)

---

## 3. Common Failure Patterns (Anti-Patterns)

Catch these recurring issues during review:

### Performance

- **Spread-in-loop**: `this.particles = [...this.particles, p]` in rAF. Use `.push()` or pre-allocated ring buffer.
- **JSON-in-hotpath**: `JSON.parse(JSON.stringify(obj))` inside update loop for deep clone. Use structured assign or `structuredClone` only at init.
- **querySelector-per-frame**: DOM lookup every animation frame. Cache selector in a ref on mount.
- **Unclamped-delta**: No `Math.min(dt, max)` leads to physics explosion after tab-away.

### Memory

- **Listener-leak-anonymous**: `window.addEventListener('keydown', (e) => { ... })` without storing reference for removal. Always use named function or a stored ref.
- **Interval-orphan**: `setInterval(saveGame, 10000)` on mount, no `clearInterval` in cleanup.
- **DOM-reference-stale**: Hiding an element but keeping a `useRef` pointing to it, preventing GC.

### Spec

- **Off-by-one-wave**: Wave increment happens before spawn check, causing extra entities.
- **Missing-multiplier**: Score calculated without spec-defined combo multiplier.
- **Wrong-input-map**: Arrow keys mapped to `'up'`/`'down'` instead of `'left'`/`'right'` for horizontal movement.
- **Sound-name-mismatch**: Spec says `'coin'` but code calls `'collect'` -- no sound plays.

### Security

- **Player-name-innerHTML**: `element.innerHTML = playerName` allows XSS if name contains `<script>`.
- **eval-for-math**: `eval('player.x + player.vx * dt')` used for dynamic formula.
- **Hardcoded-api-key**: Firestore or API key visible in client bundle.
- **Unvalidated-localStorage**: `JSON.parse(localStorage.getItem('save'))` without try/catch kills entire game on corrupt data.

### Code Quality

- **Magic-health-value**: `if (health < 0)` instead of `if (health <= MIN_HEALTH)`.
- **Any-type-abuse**: `function update(entity: any)` instead of `function update(entity: Entity)`.
- **Long-file**: Single file exceeding 600 lines with mixed concerns (physics + rendering + audio + UI).
- **Silent-catch**: `try { ... } catch {}` with no error logging or user feedback.

---

## 4. Verification Checklist

After completing the review pass, execute these verification steps:

- [ ] `docs/review/findings.json` and `docs/review/code-review.md` are written (create `docs/review/` if missing).
- [ ] All findings are recorded in the structured JSON output schema.
- [ ] Each finding has a unique ID, severity, category, file, line, and recommendation.
- [ ] Every spec requirement in `game-spec.json` has a corresponding PASS/FAIL entry.
- [ ] Frame-rate audit inspected every function reachable from `requestAnimationFrame`.
- [ ] Event listener cleanup verified for every `addEventListener` / `useEffect`.
- [ ] Security scan confirmed zero occurrences of `innerHTML`, `eval`, `Function`, secrets.
- [ ] Magic numbers pass: no bare numeric literals > 1 outside constant declarations.
- [ ] TypeScript strictness confirmed: no `any` types in reviewed files.
- [ ] Findings are handed off to `primary-executor` or `game-implement` for remediation.
- [ ] After fixes, re-review targets ONLY the changed lines (regression-free delta review).
