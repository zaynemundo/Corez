---
name: capability-orchestrator
description: Routes user requests to the smallest effective COREZ capability set, combining skills only when needed and preserving safety, privacy, latency, and cost controls.
---

# Capability Orchestrator Skill

Use this skill to analyze incoming user requests, determine the minimal required capability set, and delegate sub-tasks to specialized agent engines.

---

## 1. Capability Routing Table

| Request Type | Lead Engine | Required Skills | Output Artifact |
| --- | --- | --- | --- |
| Web Application / UI Layout | `opencode-go/muse-spark-1.2-contributor` (OpenCode Go only) | *see §1.1 Design Decision Tree* + `accessibility-expert` | React / HTML / CSS components |
| Image Generation / Artwork | FLUX 1 (`schnell` / `dev`) via Cloudflare Workers AI | `visual-creative` (+ `image-generation` for endpoint) | R2 stored image URLs & gallery cards |
| Web Game / Canvas Arcade | `opencode-go/muse-spark-1.2-contributor` (OpenCode Go only) | `game-development`, `frontend-modern-design` | Canvas 2D / JS physics engine |
| Back-End API / Worker Router | `opencode-go/muse-spark-1.2-contributor` (OpenCode Go only) | `backend-architecture`, `ai-infrastructure` | Cloudflare Worker / Node route handlers |
| Bug Investigation / Refactoring | `opencode-go/muse-spark-1.2-contributor` (preferred) | `auto-debugging`, `code-review-testing`, `software-engineering` | Verified code fix & green test run |
| PDF / Document Deliverables | `opencode-go/muse-spark-1.2-contributor` (preferred) | `pdf` | HTML/Paged.js or LaTeX PDF, processed PDFs |
| Live Facts / Lookups (weather, time, rates) | `opencode-go/muse-spark-1.2-contributor` | `live-utilities`, `research-current-information` | Dated, source-cited answer |
| Memory / Preferences | `opencode-go/muse-spark-1.2-contributor` | `r2-mem0-memory`, `personalisation-context` | R2-stored memory records |
| Scheduling / Reminders | `opencode-go/muse-spark-1.2-contributor` | `scheduling-automation` | Schedule specification (no durable scheduler yet) |
| Credentials / Env Setup | `opencode-go/muse-spark-1.2-contributor` | `ask-env-values` | Explicitly confirmed env values |
| Runtime Verification | `opencode-go/muse-spark-1.2-contributor` | `verify` | Launched app with verified endpoints |
| Data Analysis / Reports | `opencode-go/muse-spark-1.2-contributor` | `data-documents` | Validated spreadsheets, charts, docs |

> **Provider (canonical):** `OPENCODE_GO_API_KEY` / `OPENCODE_API_KEY` (OpenCode Go only for chat). `OPENROUTER_API_KEY` required only for `POST /api/image`. See `verify` and `ai-infrastructure` for timeout/retry behavior. Never ask public app users for these keys — see `ask-env-values`.

### 1.1 Design Skill Decision Tree (replaces ambiguous routing)

| Brief Signal | Primary Skill | Add `apple-design`? | Add `accessibility-expert`? |
| --- | --- | --- | --- |
| **New brand, bespoke identity, “distinctive”, “not templated”** | `frontend-design` (opinionated palette/type/layout + one signature risk) | Only if spec asks for drag/swipe/springs/sheets | Always |
| **Explicit design system, tokens, `index.css`, responsive HUD, light/dark** | `frontend-modern-design` (canonical tokens + z-index) | Only if gesture-heavy interaction | Always |
| **Gesture-driven UI, springs, drag/swipe/sheet, momentum, interruptible motion** | `frontend-modern-design` *or* `frontend-design` *as base* **+** `apple-design` as supplement | — (this row *is* apple-design) | Always |
| **Routine CSS fix, bug, single component tweak** | None — edit directly, preserve existing visual language | No | If contrast/focus/keyboard affected |

**Rules:**
- Never load both `frontend-design` and `frontend-modern-design` as primaries — pick one per `§1.1`. The other may be referenced for tokens/z-index only.
- `apple-design` is a *supplement*, never a standalone design choice. It layers springs/gesture physics onto whichever primary is active.
- Design tokens and z-index layering are **canonical in `frontend-modern-design: §1 & §5`** — `frontend-design`, `apple-design`, `accessibility-expert` reference that section instead of duplicating tables.

---

## 2. Orchestration Strategy

1. **Minimal Surface**: Activate only the skills directly required for the request (use `§1.1` for design) to conserve context budget and latency. `game-development` is 4000+ lines — do not load it for non-game tasks.
2. **Provider-aware routing**: Fast structured classification → local `src/services/intentClassifier.js`. Complex reasoning/art direction → `opencode-go/muse-spark-1.2-contributor` via the chain in `ai-infrastructure: §1`.
3. **Subagent Delegation**: Delegate broad research tasks to the `research` subagent (or the `research-current-information` skill when live web research is required) to keep context clean.
4. **Strict Policy Compliance**: Enforce `cursor-security-rules` (canonical security) and git completion policies (`git-superpowers`) upon finishing file modifications. Backend work must also satisfy `backend-architecture: Level 1`.
5. **Verification**: End every implementation with `verify` checks (`npm test`, `npm run lint`, `npm run build`, `npm run test:cloudflare`) — see `software-engineering: §4` for canonical commands.
