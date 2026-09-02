---
name: ai-infrastructure
description: Use for AI deployment architecture, provider routing, local inference, GPU capacity, quantization, RAG, reranking, agent workflows, and token or cost optimization; not for ordinary application code changes.
---

# AI Infrastructure Skill

Use this skill when designing, building, or optimizing AI model integrations,
LLM API proxies, model routing, RAG retrieval, and prompt token efficiency.
CoreZ does not currently use Cloudflare Workers AI or a vector database; treat
those topics as generic architecture work unless implementation is requested.

```
  ┌─────────────────────────────────────────────────────────────┐
  │  AI INFRASTRUCTURE ARCHITECTURE                             │
  │  1. Model Router (Primary LLM -> Secondary Failover)        │
  │  2. Token Budget & Context Manager                          │
  │  3. RAG Pipeline (Embedding -> Vector DB -> Reranker)       │
  │  4. Public API Gateway & Response Streaming (SSE)           │
  └─────────────────────────────────────────────────────────────┘
```

---

## 1. Model Routing & Primary/Secondary Failovers

- **Routing Logic**: Direct fast structured classification tasks to lightweight local logic (e.g. the repo's `src/services/intentClassifier.js`) and complex reasoning/art direction to the primary model (Muse Spark 1.3, `muse-spark-1.3-contributor`).
- **Graceful Failover**: CoreZ runs OpenCode Go -> official DeepSeek ->
  OpenRouter in `worker/providerChain.js`. Transient failures use bounded
  per-request retries and persisted retry schedules; permanent authentication,
  authorization, and invalid-request failures do not retry. Client disconnect
  is the generation abort signal; do not add an arbitrary provider timeout.
- **Image routing**: `POST /api/image` uses the server-controlled OpenRouter
  image model chain. `OPENROUTER_IMAGE_MODEL` may override it with one model,
  and the response reports the model actually used.

---

## 2. Token Budget & Context Window Management

- **Truncation & Summarization**: preserve current instructions, exact code,
  errors, and the latest user turn when compaction is required. Do not invent a
  fixed threshold that is absent from the runtime contract.
- **System Prompt Compression**: Strip unnecessary markdown boilerplate in automated agent-to-agent payloads while preserving exact JSON contracts.

---

## 3. RAG & Vector Retrieval Optimization

This is generic design guidance, not a description of the current CoreZ
runtime. CoreZ memory search is keyword-based unless a vector store is added.

- **Chunking Strategy**: Chunk documents into 256–512 token segments with 10% overlap to preserve context across boundaries.
- **Hybrid Search**: Combine vector similarity search (cosine distance) with keyword BM25 search for precise document recall.
- **Reranking**: Apply cross-encoder reranking on top-N candidates before passing context to the LLM generation prompt.

---

## 4. Response Streaming & SSE Protocols

- Use Server-Sent Events (`text/event-stream`) for real-time model token streaming.
- Implement robust client-side `AbortController` listeners so users can interrupt generation at any moment.

## Repository verification

- Provider routing: `tests/provider-chain.test.js` and
  `tests/workers-ai-provider-contract.sh`.
- Public AI contracts: `npm run test:cloudflare`.
- Full static and production checks: `npm run lint` and `npm run build`.
