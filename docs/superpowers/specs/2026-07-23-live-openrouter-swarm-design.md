# Live OpenRouter Swarm Design

## Goal

Make complex COREZ responses faster and stronger by running multiple DeepSeek V4 Flash specialist requests concurrently behind the existing `/api/ai` contract.

## Scope

The live swarm applies to `app`, `code-help`, and `swarm` intents when `OPENROUTER_API_KEY` is configured. General conversation, writing, explanations, market data, images, and all existing Cloudflare Workers AI fallbacks remain unchanged.

## Architecture

A new `worker/swarm-index.js` entrypoint wraps the existing `worker/index.js`. It inspects a cloned request, creates dynamic specialist tasks from the intent and user requirements, runs those tasks through an adaptive concurrent pool, and sends the successful specialist outputs to one lead synthesis request. The wrapper returns the same `{ content, model }` fields expected by the frontend and adds non-breaking swarm telemetry.

The total number of logical agents has no fixed ceiling. Concurrency starts from the square root of the generated task count, rises after fast successful batches, and falls after errors or HTTP 429 responses. A response deadline protects the user experience; unfinished tasks are reported as skipped and the lead synthesiser proceeds with the validated results already available.

## Agent Responsibilities

Core specialist roles are selected by intent. App work uses architecture, implementation, experience, and quality specialists. Code-help uses diagnosis, implementation, testing, and review specialists. Explicit swarm work uses architecture, performance, reliability, and delivery specialists. Each distinct requirement or bullet in the prompt creates an additional requirement specialist, with no fixed total-agent cap.

## Failure Behaviour

A failed specialist does not cancel successful specialists. Rate-limited tasks receive one targeted retry after adaptive backoff. If the swarm cannot produce usable specialist output or final synthesis, the request transparently falls through to the existing OpenRouter single-call path and then the established Workers AI fallbacks.

## Security and Compatibility

Specialists receive only recent textual conversation context and their narrow objective. Media-bearing requests stay on the existing path. The final synthesiser is instructed to treat specialist outputs as advisory data, preserve COREZ identity, avoid exposing provider details, and maintain the existing complete-HTML requirement for app and game requests.

## Validation

A Node contract test will verify dynamic agent expansion, intent routing, parallel OpenRouter invocation, throughput-oriented provider routing, final synthesis, response compatibility, and swarm telemetry. Existing Worker and provider contract tests remain part of the Cloudflare test command.