#!/usr/bin/env bash
set -u

worker="worker/index.js"
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

check 'Worker uses the GLM-4.7-Flash model' '@cf/zai-org/glm-4[.]7-flash' "$worker"
check_absent 'Worker does not use the paid-only GLM-5.2 model' '@cf/zai-org/glm-5[.]2' "$worker"
check 'Worker invokes the native AI binding' 'env[.]AI[.]run' "$worker"
check 'Worker sends a system message' "role: 'system'" "$worker"
check 'Worker sends a user message' "role: 'user'" "$worker"
check 'frontend calls the public AI route' "fetch\(AI_PROXY_ENDPOINT" "$service"
check 'frontend configures the public AI route' "AI_PROXY_ENDPOINT = '/api/ai'" "$service"
check 'frontend retains local fallback' 'generateLocalAIResponse' "$service"
check_absent 'Worker has no OpenRouter endpoint' 'openrouter[.]ai' "$worker"
check_absent 'active Worker has no OpenRouter key' 'OPENROUTER_API_KEY' "$worker"
check_absent 'frontend has no model override storage' 'corez_openrouter_model|VITE_OPENROUTER_MODEL' "$service"

if (( failures > 0 )); then
  printf '%d Workers AI provider contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Workers AI provider contract checks passed.\n'
