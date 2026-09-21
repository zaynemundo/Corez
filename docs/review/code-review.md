# CoreZ — Code Review & Visual Review Report

**Command:** `.opencode/commands/game-review.md`
**Skill:** `game-development` — Part 13 (Performance Review), Part 15 (Code Review), Part 16 (Visual Review)
**Date:** 2026-09-21
**Branch:** `main`
**Result:** **10 of 13 findings remediated and verified. 3 recorded as open (1 blocking, 2 accepted/deferred).**

---

## 1. Read this first — the declared review baseline is missing

This command reviews against `art-direction.json` and `game-spec.json`. **Neither file exists in this repository.** A recursive filename search across every directory (including `.agents/`, `.corez/`, `artifacts/`, `docs/`, `data/`, `scratch/`, `test_results/`) found only prose references inside the skill and agent definitions — never the files themselves.

Part 15 §1C requires that *every* spec requirement has a PASS/FAIL entry. With no spec, a compliance verdict is unverifiable, and reporting one would be fabricating evidence. So the review did **not** certify spec compliance. Instead it ran against the repository's real normative sources:

| Baseline | Role |
| --- | --- |
| `src/index.css` | The declared *"Corez Dynamic Monochrome Design System"* — palette, surfaces, radii, and (after this pass) the layer map. Used as the art-direction contract. |
| `PROJECT.md` | Feature inventory, milestones, and the `GenericSwarmOrchestrator` ↔ `TaskDependencyGraph` / `Verifier` interface contracts. |
| `AGENTS.md` | Architecture rules, the visual layering mandate, and the verification gate. |

**Action required from the project owner:** author `game-project/design/game-spec.json` and `game-project/design/art-direction.json`, then re-run Part 15 §1C. Tracked as `SPEC-001` (critical).

---

## 2. What was audited

| Workstream | Method | Scope |
| --- | --- | --- |
| Part 13 — Performance | rAF hot-path, delta clamping, pooling, draw batching, leak patterns | `engineSkeleton.js` (the engine emitted into every generated game), `fullscreenGamePatch`, orchestrator/queue |
| Part 15 — Code Review | Frame-rate, memory, spec compliance, security, quality | 27 source files across `src/`, `worker/`, `packages/` |
| Part 16 — Visual Review | Pixel-level palette + contrast compliance | 5 captured scenes in `artifacts/ui/` |

Because the delegated review agents were unavailable (`opencode-go/deepseek-flash` model unavailable), the whole review was executed directly by the lead agent.

---

## 3. Findings remediated (10)

### 3.1 Accessibility — light-theme contrast failures (`AX-001`, `AX-002`, `AX-003`)

Three declared token pairings failed WCAG 2.2 AA (4.5:1) in the light theme. These were **measured**, not eyeballed, and then independently recomputed from the WCAG relative-luminance formula:

| Token | Surface | Before | After |
| --- | --- | --- | --- |
| `--text-secondary` `#6e6e73` | `--code-header-bg` `#e5e5e5` | **4.03:1** ❌ | **5.03:1** ✅ |
| `--text-secondary` `#6e6e73` | `--bg-tertiary` `#eeeeef` | **4.37:1** ❌ | **5.46:1** ✅ |
| `--text-muted` `#6b6b70` | `--code-header-bg` `#e5e5e5` | **4.21:1** ❌ | **4.67:1** ✅ |

**Fix:** `--text-secondary: #5f5f66`, `--text-muted: #646469`. Both clear 4.5:1 on every light surface they can land on (`--code-header-bg`, `--bg-tertiary`, `--code-bg`, `#ffffff`), and `--text-muted` stays a step lighter than `--text-secondary` so it still reads as the quieter tone. This is the same defect class the pre-existing CSS comment already documents for `#98989d`.

### 3.2 Security — four HTML-injection sinks and one unsafe parse (`SEC-001`–`SEC-005`)

| ID | Site | Verdict |
| --- | --- | --- |
| `SEC-001` | `worker/responseProcessor.js:291` `new Function(trimmed)` | **Real violation.** Compiled arbitrary model output. Not executed (parse-only), so not live RCE — but redundant: `worker/jsSyntax.js` already parses safely with **acorn**, an existing dependency. Replaced with acorn. |
| `SEC-002` | `previewTransformer.js:941` `innerHTML + err.message` | **Real violation.** Runtime error text re-parsed as markup. Replaced with `textContent` via `renderPreviewMessage()`. |
| `SEC-003` | `previewTransformer.js:501` `innerHTML + String(msg \|\| error)` | **Real violation.** Same class. Replaced with DOM construction; emptiness guard moved from `innerHTML` to `hasChildNodes()`. |
| `SEC-004` | `previewTransformer.js:698` `innerHTML + String(msg \|\| error)` | **Real violation.** Same class. Replaced with DOM construction. |
| `SEC-005` | `CanvasPreview.jsx:1327` `dangerouslySetInnerHTML` (QR SVG) | **Not exploitable.** Verified that `generateQrCodeSvg()` interpolates only computed coordinates plus hard-coded colour literals — the QR payload is encoded as matrix cells, never emitted as text. Still removed, as it was the last HTML sink in the app origin: added `generateQrCodeDataUrl()` and rendered through `<img src>`, which cannot execute script. |

Reachability was assessed per sink rather than assumed. `SEC-002`–`SEC-004` execute inside the **artifact's own document** (sandboxed preview iframe / published page), not the Corez origin — contained injection, not cross-origin compromise. That is stated in `docs/review/findings.json` rather than silently graded as critical.

### 3.3 Visual layering — inverted stacking order (`VL-001`, `QA-001`)

Layering was expressed as **15 ad-hoc integers with no declared scale**: `1, 2, 3, 10, 20, 40, 50, 60, 70, 80, 100, 101, 102, 999, 1000`. Values `999`/`1000`/`101`/`102` are uncontrolled escalation — "whoever needs to win picks a bigger number".

That escalation had produced a **latent occlusion bug**: `.canvas-pane.full-width` is `position: fixed; inset: 0` at `z-index: 1000`, while `.modal-overlay` and `.image-fullscreen-modal` sat at `100` and `.image-lightbox-modal` at `999`. Because the expanded pane covers the entire viewport, **any dialog or lightbox opened while it is expanded renders underneath it** — the Part 16 critical failure *"z-index layer violation causing occlusion"*. `SettingsModal` (app level) and the chat image viewer both use the `100` layer.

**Fix:** a 15-step `--z-*` scale declared once with its order documented:

```
background 0 → content 10–20 → hud 30–40 → controls 50 → dropdown 60
→ pane-fullscreen 70 → overlay 80–90 → sidebar-mobile 95 → modal 100–120 → lightbox 200
```

All **28** declarations now reference tokens. The expanded pane deliberately ranks **below** every overlay, modal and lightbox. Every other relative ordering is preserved exactly, so no stacking behaviour changed other than the intended correction.

---

## 4. Findings recorded but not remediated (3)

| ID | Severity | Summary | Why open |
| --- | --- | --- | --- |
| `SPEC-001` | critical | `game-spec.json` / `art-direction.json` absent | Only the project owner can author the specs. Until then this review is a code-quality, performance and visual-contract audit, **not** a spec-compliance certification. |
| `SEC-006` | minor | `document.open()` / `document.write()` in the injected multi-page router (`previewTransformer.js:259`) | Deliberately not changed. The sink runs inside the artifact's own document and the written HTML comes from a same-directory fetch restricted to relative `.html` links; the only party who can influence it already controls the whole artifact — no privilege escalation. Replacing it means re-architecting published-site navigation (same-frame navigation blanks the sandboxed preview), a behavioural change whose regression risk exceeds the benefit. Recorded as an accepted, documented deviation. |
| `CQ-001` | minor | `worker/index.js` is 4,584 lines, `aiService.js` 3,189, `App.jsx` 1,509, `ChatMessage.jsx` 1,504, `CanvasPreview.jsx` 1,388 | Pre-existing structural debt, not a regression. Decomposing a 4.5k-line module is a staged multi-day refactor and cannot be responsibly bundled into a review pass. |

---

## 5. Verified compliant (9 passes)

**Performance (Part 13) — the emitted game engine is genuinely well built:**

- `Time.frame()` clamps delta to `0.1s` and runs **at most 5** fixed `1/60` simulation steps per frame — a real spiral-of-death guard, not just a clamp.
- A **single** `requestAnimationFrame` loop, driven by the rAF timestamp parameter (no `Date.now()` in the hot path).
- `makePool()` pre-allocates reusable bullets/particles; the frame body performs **no** object, array or string allocation.
- `View.resize()` sizes the backing store to viewport × `min(devicePixelRatio, 2)` with one `ctx.setTransform` per frame, so canvas dimensions match display size.
- The fullscreen game patch scales by CSS transform rather than resizing per frame, leaving simulation cost untouched.
- `Sound.stopMusic()` clears its interval; `AudioContext` is created lazily on first user gesture.

**Memory (Part 15 §1B) — no listener leaks:**

Every `window`/`document` listener in the audited React components is torn down in its effect cleanup with the identical named handler reference (`App.jsx` ×8, `ChatMessage.jsx` ×2, `ChatInput.jsx`, `Sidebar.jsx`, `SettingsModal.jsx`, `CookieConsent.jsx` ×2, `SecureGamePreview.jsx`, `CanvasPreview.jsx` ×2). No anonymous-inline listener leaks found.

**Security (Part 15 §1D):**

- `appStorageService.js` guards `localStorage` reads with `try/catch`, availability checks and shape validation (`Array.isArray`, non-array object) — corrupt data degrades to a default instead of throwing.
- No credentials in client source: the scan for `api_key`/`secret`/`password`/`bearer`/`sk-`/`AKIA` returned only form-field state and privacy-policy prose documenting PBKDF2 hashing.
- After remediation: **zero** occurrences of `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `dangerouslySetInnerHTML`, `eval(` or `new Function(` in `src/**/*.{js,jsx}`.

**Visual (Part 16):**

- All five scenes are palette-compliant with the monochrome contract. The brand mark and wordmark are monochrome.
- All 48 declared text/surface token pairings now clear 4.5:1 in both themes.

---

## 6. Verification evidence

Every claim above is backed by a command that ran to `exitCode === 0`. No agent text claim substitutes for execution.

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | **exit 0** |
| Tests | `npm test` | **exit 0** — 129 files / 1420 tests passed |
| Build | `npm run build` | **exit 0** — 1663 modules, `dist/` emitted |
| Visual audit | `node scripts/ui-visual-audit.mjs` | **exit 0** — PASS (0 errors, 0 warnings) |
| Layer report | `node scripts/ui-zindex-report.mjs` | 28 token declarations, **0** bare numeric `z-index` |

### 6.1 A note on the visual audit method

The first audit run reported **46 errors** and **148 warnings**. They were almost entirely **false positives**: LCD subpixel text anti-aliasing paints 1px chromatic fringes on glyph edges (`#a6e1f0` cyan, `#d29047` orange, `#142a5d` blue), which a naive pixel classifier counts as out-of-palette colour. Cropping and magnifying the brand mark confirmed it is monochrome — the colour was fringing, not design.

Rather than report 194 false findings into a "blocking until fixed" gate, the auditor was made AA-aware with three gates:

1. **3× box reduction** — opposing fringes average back to neutral, solid fills survive.
2. **8-neighbour erosion** — 1px fringe lines vanish, genuine fills survive.
3. **Bounding-box fill-density gate** — a real element is a compact blob (density → 1); AA residue is scattered singletons across the frame (density → 0).

That reduced 194 findings to **3**, all genuine — and all three are now fixed. The remaining `document.write` deviation and the two deferred items are stated openly above.

---

## 7. Artifacts produced

| Path | Contents |
| --- | --- |
| `docs/review/findings.json` | Part 15 structured findings (13 findings + 9 passes, schema-conformant) |
| `docs/review/code-review.md` | This report |
| `review/findings/{scene}-review.json` | Part 16 per-scene findings — 5 scenes |
| `review/findings/visual-audit-summary.json` | Full audit payload (histograms, metrics, all pairings) |
| `review/screenshots/*.png` | The audited captures, collected with their findings for `game-release-check` |
| `scripts/ui-visual-audit.mjs` | Reusable palette + contrast auditor (exit 1 on error) |
| `scripts/ui-visual-localize.mjs` | Chromatic-cluster localizer for identifying offenders |
| `scripts/ui-review-report.mjs` | Emits the Part 16 per-scene findings files |
| `scripts/ui-zindex-report.mjs` | Lists each `z-index` with its owning selector |

---

## 8. Recommendation

The 10 remediated findings are fixed and verified. Before this work can be called a **spec-compliance** pass rather than a quality pass, `SPEC-001` must be closed: author `game-spec.json` and `art-direction.json`, then re-run Part 15 §1C against them.
