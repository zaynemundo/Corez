---
name: ai-infrastructure
description: Evaluates and designs LLM deployments, APIs, model routing, local inference, GPU and server capacity, quantisation, RAG, reranking, agent workflows, and token or cost optimisation.
---

# AI Models & Infrastructure

## Supported work
- Model and provider comparisons, API integration, token and cost analysis, routing, fallbacks, context management, caching, structured outputs, tool use, and observability.
- Local inference planning across desktop, workstation, server, Apple silicon, Jetson, and other supported hardware.
- GPU memory estimates, quantisation, concurrency, throughput, latency, storage, networking, and deployment trade-offs.
- Retrieval-augmented generation, embeddings, chunking, reranking, citations, evaluation, guardrails, and agent orchestration.

## Workflow
1. Identify the workload: model size, modality, context, concurrency, latency, privacy, uptime, and budget.
2. Verify current model names, provider pricing, limits, licences, hardware specifications, and software compatibility when these affect the recommendation.
3. Estimate memory and cost explicitly, including model weights, KV cache, runtime overhead, input/output tokens, and expected utilisation.
4. Recommend the smallest architecture that meets quality and reliability requirements.
5. Include fallback, rate-limit, retry, logging, evaluation, and security strategies.
6. Distinguish theoretical fit from measured performance and recommend benchmarking with the user's real workload.

## Guardrails
- Do not claim a model fits hardware without accounting for quantisation and runtime overhead.
- Do not present unofficial benchmarks or community usage reports as guaranteed limits.
- Never expose API keys or encourage account-limit evasion.
- Treat provider policies, model catalogues, prices, and limits as current information requiring verification.
