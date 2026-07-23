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

---

## 2. Orchestration Strategy

1. **Minimal Surface**: Activate only the skills directly required for the request to conserve context budget and latency.
2. **Subagent Delegation**: Delegate broad research tasks to the `research` subagent to keep context clean.
3. **Strict Policy Compliance**: Enforce git completion policies (`git-superpowers`) upon finishing file modifications.
