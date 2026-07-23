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

check 'Worker routes text through Tencent HY3 Preview or Kimi K3' 'tencent/hy3-preview|kimi-k3-code' "$worker"
check_absent 'Worker no longer routes through MiMo V2.5' 'xiaomi/mimo-v2[.]5' "$worker"
check 'Worker uses Kimi K3 Code as the primary Workers AI fallback' '@cf/moonshotai/kimi-k3-code' "$worker"
check 'Worker uses DeepSeek R1 Distill as the secondary Workers AI fallback' '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' "$worker"
check 'Worker uses FLUX Schnell as the image model' '@cf/black-forest-labs/flux-1-schnell' "$worker"
check_absent 'Worker no longer uses FLUX dev' '@cf/black-forest-labs/flux-1-dev' "$worker"
check 'Worker invokes the native AI binding' 'env[.]AI[.]run' "$worker"
check 'Worker sends a system message' "role: 'system'" "$worker"
check 'Worker sends a user message' "role: 'user'" "$worker"
check 'Worker supports the OpenRouter text endpoint' 'openrouter[.]ai' "$worker"
check 'Worker supports OPENROUTER_API_KEY' 'OPENROUTER_API_KEY' "$worker"
check 'Worker recognises canonical code-help intent' "'code-help'" "$worker"
check 'Worker recognises canonical swarm intent' "'swarm'" "$worker"
check_absent 'Worker no longer branches on retired coding intent' "intentType === 'coding'" "$worker"
check_absent 'Worker no longer branches on retired complex intent' "intentType === 'complex'" "$worker"
check_absent 'Worker no longer branches on retired fast-path labels' "intentType === 'math'|intentType === 'chat'|intentType === 'simple'" "$worker"
check_absent 'Worker does not use the paid-only GLM-5.2 model' '@cf/zai-org/glm-5[.]2' "$worker"
check 'frontend calls the public AI route' "fetch\(AI_PROXY_ENDPOINT" "$service"
check 'frontend configures the public AI route' "AI_PROXY_ENDPOINT = '/api/ai'" "$service"
check 'frontend retains local fallback' 'generateLocalAIResponse' "$service"
check_absent 'frontend has no model override storage' 'corez_openrouter_model|VITE_OPENROUTER_MODEL' "$service"

if (( failures > 0 )); then
  printf '%d Workers AI provider contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Workers AI provider contract checks passed.\n'
