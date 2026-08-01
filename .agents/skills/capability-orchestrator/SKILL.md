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
| Web Application / UI Layout | DeepSeek V4 Flash / MiMo V2.5 | `frontend-modern-design`, `apple-design`, `accessibility-expert` | React / HTML / CSS components |
| Image Generation / Artwork | FLUX 1 (`schnell` / `dev`) | `visual-creative` | R2 stored image URLs & gallery cards |
| Web Game / Canvas Arcade | DeepSeek V4 Flash | `game-development`, `frontend-modern-design` | Canvas 2D / JS physics engine |
| Back-End API / Worker Router | DeepSeek V4 Flash | `backend-architecture`, `ai-infrastructure` | Cloudflare Worker / Node route handlers |
| Bug Investigation / Refactoring | DeepSeek V4 Flash | `auto-debugging`, `code-review-testing`, `software-engineering` | Verified code fix & green test run |
| PDF / Document Deliverables | DeepSeek V4 Flash | `pdf` | HTML/Paged.js or LaTeX PDF, processed PDFs |
| Live Facts / Lookups (weather, time, rates) | DeepSeek V4 Flash | `live-utilities`, `research-current-information` | Dated, source-cited answer |
| Memory / Preferences | DeepSeek V4 Flash | `r2-mem0-memory`, `personalisation-context` | R2-stored memory records |
| Scheduling / Reminders | DeepSeek V4 Flash | `scheduling-automation` | Confirmed scheduled action |
| Credentials / Env Setup | DeepSeek V4 Flash | `ask-env-values` | Explicitly confirmed env values |
| Runtime Verification | DeepSeek V4 Flash | `verify` | Launched app with verified endpoints |
| Data Analysis / Reports | DeepSeek V4 Flash | `data-documents` | Validated spreadsheets, charts, docs |

---

## 2. Orchestration Strategy

1. **Minimal Surface**: Activate only the skills directly required for the request to conserve context budget and latency.
2. **Subagent Delegation**: Delegate broad research tasks to the `research` subagent (or the `research-current-information` skill when live web research is required) to keep context clean.
3. **Strict Policy Compliance**: Enforce git completion policies (`git-superpowers`) upon finishing file modifications.
