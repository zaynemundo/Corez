# Live OpenRouter Swarm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route complex live COREZ requests through a dynamic parallel DeepSeek V4 Flash swarm without changing the frontend response contract.

**Architecture:** Add a wrapper Worker entrypoint that delegates ordinary traffic to the current Worker and intercepts eligible `/api/ai` requests. It creates intent-specific and requirement-specific agents, executes them with adaptive concurrency, synthesises their successful outputs, and falls back to the existing route on any blocking failure.

**Tech Stack:** Cloudflare Workers, JavaScript ES modules, OpenRouter chat completions, Node 22 contract tests.

## Global Constraints

- Keep `/api/ai` response compatibility with `{ content, model }`.
- Do not impose a fixed total logical-agent ceiling.
- Preserve the existing OpenRouter and Workers AI fallback chain.
- Keep media requests and non-complex intents on the established route.
- Route OpenRouter requests by throughput with provider fallbacks.
- Never expose internal provider or model details in generated public content.

---

### Task 1: Add the live swarm Worker wrapper

**Files:**
- Create: `worker/swarm-index.js`

**Interfaces:**
- Consumes: default Worker export from `worker/index.js`.
- Produces: default Worker export with `fetch(request, env, ctx)`, plus testable helpers `shouldUseSwarm`, `buildSwarmAgentSpecs`, and `runAdaptiveAgentPool`.

- [ ] **Step 1: Write the wrapper helpers and agent definitions**

Implement canonical intent normalisation, media detection, requirement extraction, dynamic specialist creation, safe logging, and request signal timeouts.

- [ ] **Step 2: Implement adaptive parallel execution**

Start concurrency from the square root of task count, increase after fast successful batches, reduce after failures or HTTP 429 responses, retry only rate-limited tasks once, and return completed, failed, and skipped task records.

- [ ] **Step 3: Implement OpenRouter specialist and synthesis calls**

Use `deepseek/deepseek-v4-flash`, `reasoning: { effort: "high", exclude: true }`, and throughput-oriented provider routing. Preserve narrow specialist context and run one final synthesis request after parallel specialist completion.

- [ ] **Step 4: Add transparent fallback**

When swarm execution is ineligible or fails, pass the untouched original request to `worker/index.js`.

### Task 2: Make the wrapper the deployed entrypoint

**Files:**
- Modify: `wrangler.jsonc`

**Interfaces:**
- Consumes: `worker/swarm-index.js` default export.
- Produces: Cloudflare deployment entrypoint at `./worker/swarm-index.js`.

- [ ] **Step 1: Change the Wrangler main entrypoint**

Replace `./worker/index.js` with `./worker/swarm-index.js` and leave bindings and asset routing unchanged.

### Task 3: Add Worker swarm contract coverage

**Files:**
- Create: `tests/worker-live-swarm-contract.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: exported swarm helpers and default Worker wrapper.
- Produces: deterministic Node contract verification for routing, dynamic agents, provider parameters, synthesis, and compatibility.

- [ ] **Step 1: Test agent expansion and intent gating**

Verify complex intents use the swarm, general intents do not, and additional prompt requirements create additional logical agents without a fixed total cap.

- [ ] **Step 2: Mock OpenRouter and test the full request flow**

Mock `globalThis.fetch`, return specialist results and a final integrated result, and assert the response includes the expected content, model, and swarm telemetry.

- [ ] **Step 3: Add the test command**

Add `test:worker-swarm` and include it in `test:cloudflare` before the shell contract checks.

### Task 4: Verify and publish

**Files:**
- Verify all files above.

- [ ] **Step 1: Run `npm run test:worker-swarm`**

Expected: `Live Worker swarm contract passed.`

- [ ] **Step 2: Run `npm run test:cloudflare`**

Expected: all Worker, market, provider, proxy, live-evaluation, and environment contract checks pass.

- [ ] **Step 3: Run `npm run build`**

Expected: Vite production build succeeds.

- [ ] **Step 4: Open a draft pull request**

Summarise the live routing change, compatibility strategy, fallback behaviour, and checks.