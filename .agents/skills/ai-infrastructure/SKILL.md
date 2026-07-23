---
name: ai-infrastructure
description: Evaluates and designs LLM deployments, APIs, model routing, local inference, GPU/server capacity, quantization, RAG, reranking, agent workflows, and token/cost optimization.
---

# AI Infrastructure Skill

Use this skill when designing, building, or optimizing AI model integrations, LLM API proxies, model routing, Workers AI pipelines, RAG vector retrieval, and prompt token efficiency.

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

- **Routing Logic**: Direct fast structured classification tasks to lightweight models (e.g. Workers AI `@cf/meta/llama-3-8b-instruct`), and complex reasoning/art direction to high-capability models (e.g. MiMo V2.5, DeepSeek V4 Flash).
- **Graceful Failover**: If the primary API endpoint times out (8–12s) or returns 5xx status codes, automatically degrade to secondary backup providers without throwing unhandled UI errors.

---

## 2. Token Budget & Context Window Management

- **Truncation & Summarization**: Keep conversation history bounded by sliding context windows. Summarize older steps when context usage exceeds 70% threshold.
- **System Prompt Compression**: Strip unnecessary markdown boilerplate in automated agent-to-agent payloads while preserving exact JSON contracts.

---

## 3. RAG & Vector Retrieval Optimization

- **Chunking Strategy**: Chunk documents into 256–512 token segments with 10% overlap to preserve context across boundaries.
- **Hybrid Search**: Combine vector similarity search (cosine distance) with keyword BM25 search for precise document recall.
- **Reranking**: Apply cross-encoder reranking on top-N candidates before passing context to the LLM generation prompt.

---

## 4. Response Streaming & SSE Protocols

- Use Server-Sent Events (`text/event-stream`) for real-time model token streaming.
- Implement robust client-side `AbortController` listeners so users can interrupt generation at any moment.
