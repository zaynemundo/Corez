# Codex Review of AGY Corez Skills Research

Date: 2026-07-18
Reviewed artifact: `artifacts/agy/agy-corez-skills-research-48-20260718.md`

## Review Result

AGY delivered a useful finite inventory of 48 skill families across the twelve
requested categories. The taxonomy and architecture diagnosis are accepted as a
product-planning input, not as an implementation specification. Provider-specific
examples must be revalidated immediately before implementation because model and
API capabilities change independently.

The central finding is correct: Corez is currently a single-turn text proxy with
a browser preview canvas. Prompt-only text skills work now, while conversation
history, streaming, structured outputs, tools, files, multimodal input/output,
memory, connectors, and autonomous workflows require explicit architecture work.

## Material Corrections and Qualifications

1. OpenRouter currently documents both the request-level `web` plugin and the
   `openrouter:web_search` server tool. Neither should be described as deprecated.
   The plugin uses `plugins: [{ "id": "web" }]`; the server tool uses the `tools`
   array. They have different execution semantics and cost controls.
2. Structured output is model-dependent. A schema request is not a universal
   guarantee across every routed model; Corez must select a compatible model,
   validate every response locally, and handle refusal or malformed output.
3. Tool calling is model-dependent. Corez must implement the execution loop,
   validation, timeouts, budgets, and approval policy; submitting a `tools` array
   alone does not create a safe agent.
4. Media generation should use the currently documented dedicated image, speech,
   transcription, and video APIs or server tools. AGY's examples of older model
   slugs and generic chat-completion return formats are illustrative only and are
   not approved integration contracts.
5. Reasoning configuration must follow OpenRouter's documented `reasoning` object
   and the selected model's supported effort levels. Hidden reasoning must not be
   exposed as a user-facing chain-of-thought feature. Corez can present concise
   conclusions, evidence, assumptions, and tradeoffs instead.
6. OpenRouter usage data may be returned in response bodies and platform APIs,
   but Corez must code against the verified endpoint schema rather than assuming
   the custom headers listed by AGY always exist.
7. Browser speech recognition is not uniformly offline or private. Browser and OS
   implementations may send audio to a remote speech service, so the UI must
   disclose microphone use and degrade cleanly when unsupported.
8. Regex-based PII or prompt-injection detection is only a warning layer. It
   cannot guarantee secret detection or make untrusted tool execution safe.
9. "Offline prompt skill" is only honest when deterministic local logic produces
   the result. A prompt template still requires a locally available model or the
   OpenRouter network call.
10. Legal and healthcare packs must be informational and include domain-appropriate
    safety constraints; they must not be marketed as professional diagnosis,
    treatment, or legal advice.

## Accepted Capability Families

### Works With the Current Proxy

- concise writing, rewriting, translation, explanation, ideation, critique, and
  structured tradeoff responses;
- single-file HTML/CSS/JavaScript app and visualization generation;
- local deterministic exports, calculations, format conversion, and preview
  utilities;
- safety warnings, basic redaction assistance, and local validation that do not
  claim complete protection.

### Requires Core Proxy Upgrades

- real multi-turn conversation and iterative canvas refinement;
- SSE streaming and cancellation;
- JSON Schema responses and locally validated structured app patches;
- web search/fetch with normalized citations;
- image, PDF, audio, and video inputs;
- image, speech, transcription, and video output APIs;
- token, cost, latency, routing, and error observability;
- bounded tool calling with human approval.

### Requires New Stateful Infrastructure

- durable memory, user profiles, synchronization, and retrieval;
- OAuth connectors for GitHub, Drive, Notion, calendars, or email;
- background jobs, webhook handling, and long-running media generation;
- multi-agent delegation, resumable plans, budgets, and audit trails;
- organization administration, permissions, and policy enforcement.

### Avoid Until Guardrails Exist

- public arbitrary shell or code execution;
- unrestricted server file read/write or patch application;
- autonomous external mutations without per-action approval;
- client-side storage of provider or connector secrets;
- unbounded tool loops or spend;
- high-stakes medical, legal, or financial decisions presented as authoritative.

## Recommended Corez Roadmap

1. Train and integrate the deterministic local intent router already specified.
2. Add multi-turn message history with server-side validation and context limits.
3. Add streaming, cancellation, timeout handling, and visible failure recovery.
4. Add iterative canvas refinement through structured, validated app patches.
5. Add usage, cost, latency, model, and routing observability.
6. Add local TXT/Markdown/CSV ingestion, followed by PDF input with explicit data
   disclosure and size limits.
7. Add grounded web search/fetch with citation rendering and source validation.
8. Add vision screenshot-to-code and image generation as separate, model-qualified
   media workflows.
9. Add deterministic data analysis and charts before permitting generated code to
   operate on sensitive uploads.
10. Add a bounded server-tool framework with authentication, per-tool schemas,
    approval prompts, rate limits, cost ceilings, audit logs, and deny-by-default
    access before considering connectors, shell, files, or subagents.

## Verified Primary Documentation

Accessed 2026-07-18:

- OpenRouter documentation index: https://openrouter.ai/docs/llms.txt
- Web search plugin: https://openrouter.ai/docs/guides/features/plugins/web-search
- Web search server tool: https://openrouter.ai/docs/guides/features/server-tools/web-search
- Web fetch server tool: https://openrouter.ai/docs/guides/features/server-tools/web-fetch
- Streaming: https://openrouter.ai/docs/api_reference/streaming
- Tool calling: https://openrouter.ai/docs/guides/features/tool-calling
- Structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- Multimodal overview: https://openrouter.ai/docs/guides/overview/multimodal/overview
- Image generation: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- Speech-to-text: https://openrouter.ai/docs/guides/overview/multimodal/stt
- Text-to-speech: https://openrouter.ai/docs/guides/overview/multimodal/tts
- Video generation: https://openrouter.ai/docs/guides/overview/multimodal/video-generation
- Reasoning tokens: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- Agent SDK tools and approvals: https://openrouter.ai/docs/agent-sdk/call-model/tools
- Agent SDK approval state: https://openrouter.ai/docs/agent-sdk/call-model/tool-approval-state

