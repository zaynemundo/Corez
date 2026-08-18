#!/usr/bin/env bash
set -u

worker="worker/index.js"
entry="worker/entry.js"
providerChain="worker/providerChain.js"
service="src/services/aiService.js"
failures=0

check() {
  local description="$1"
  local pattern="$2"
  local file="$3"

  if ! grep -Eq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local description="$1"
  local pattern="$2"
  local file="$3"

  if grep -Eq -- "$pattern" "$file" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'Worker routes text through OpenCode Go with the Mimo V2.5 build' 'mimo-v2[.]5' "$providerChain"
check_absent 'Worker never hardcodes OpenRouter-prefixed model ids' 'xiaomi/mimo-v2[.]5' "$worker"
check_absent 'Worker imposes no AI generation timeouts' 'AbortSignal[.]timeout' "$worker"
check_absent 'Worker imposes no AI output token caps' 'max_tokens' "$worker"
check 'Worker reports provider failure details' 'recordFailure' "$providerChain"
check_absent 'Text generation does not use Workers AI GLM models' '@cf/zai-org/glm' "$worker"
check 'Worker sends a system message' "role: 'system'" "$worker"
check 'Worker sends a user message' "role: 'user'" "$worker"
check 'Worker routes to the OpenRouter text endpoint' 'openrouter[.]ai' "$providerChain"
check 'Worker accepts OPENROUTER_API_KEY' 'OPENROUTER_API_KEY' "$providerChain"
check 'Worker routes to the official DeepSeek API' 'api[.]deepseek[.]com' "$providerChain"
check 'Worker accepts DEEPSEEK_API_KEY' 'DEEPSEEK_API_KEY' "$providerChain"
check 'Worker uses the OpenCode Go endpoint' 'opencode[.]ai' "$providerChain"
check 'Worker keeps OpenCode Go as the preferred provider' 'OPENCODE_GO_API_KEY' "$providerChain"
check 'Worker recognises canonical code-help intent' "'code-help'" "$worker"
check 'Public AI entrypoint routes /api/ai POST requests through the inline Worker' 'baseWorker[.]fetch\(baseRequest, env, ctx\)' "$entry"
check_absent 'Public AI entrypoint no longer invokes retired swarm execution' 'runSwarm|executeSwarm|handleSwarm' "$entry"
check_absent 'Worker no longer branches on retired swarm intent' "intentType === 'swarm'" "$worker"
check_absent 'Worker no longer branches on retired coding intent' "intentType === 'coding'" "$worker"
check_absent 'Worker no longer branches on retired complex intent' "intentType === 'complex'" "$worker"
check_absent 'Worker no longer branches on retired fast-path labels' "intentType === 'math'|intentType === 'chat'|intentType === 'simple'" "$worker"
check_absent 'Worker does not use the paid-only GLM-5.2 model' '@cf/zai-org/glm-5[.]2' "$worker"
check 'Worker uses the Workers AI rerank model' '@cf/baai/bge-reranker-base' worker/aiModels.js
check 'Worker uses the Workers AI embedding model' '@cf/baai/bge-m3' worker/aiModels.js
check 'Worker invokes the Workers AI binding for ranking models' 'env[.]AI[.]run' worker/aiModels.js
check 'Worker routes /api/rerank' "pathname === '/api/rerank'" "$worker"
check 'Worker routes /api/embed' "pathname === '/api/embed'" "$worker"
check 'Search prefers the free Workers AI rerank first' 'rerankWithWorkersAI' worker/search.js
check 'Search falls back to Workers AI embeddings' 'rankWithEmbeddingsWorkersAI' worker/search.js
check 'Workers AI ranking can be disabled' 'WORKERS_AI_RERANK_DISABLED' worker/search.js
check 'frontend calls the public AI route' "fetch\(AI_PROXY_ENDPOINT" "$service"
check 'frontend configures the public AI route' "AI_PROXY_ENDPOINT = isPublicHost" "$service"
check 'frontend keeps the same-origin /api/ai fallback' "'/api/ai'" "$service"
check 'frontend has a direct Worker fallback for zone WAF challenges' 'chat[.]zayne-mayo[.]workers[.]dev/api/ai' "$service"
check 'frontend retains local fallback' 'generateLocalAIResponse' "$service"
check_absent 'frontend has no model override storage' 'corez_openrouter_model|VITE_OPENROUTER_MODEL' "$service"

if (( failures > 0 )); then
  printf '%d Workers AI provider contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Workers AI provider contract checks passed.\n'
