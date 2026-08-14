#!/usr/bin/env bash
set -u

service="src/services/aiService.js"
settings="src/components/SettingsModal.jsx"
readme="README.md"
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

check 'frontend exposes a hosted AI response function' 'generateHostedAIResponse' "$service"
check 'frontend uses the public AI route' '/api/ai' "$service"
check 'frontend sends prompt, canonical intent, and message history' 'messages:[[:space:]]*compactConversationForRequest\(history\)' "$service"
check 'hosted failures use provider-neutral fallback wording' 'Hosted AI unavailable; using local Corez fallback' "$service"
check 'frontend retains local response fallback' 'generateLocalAIResponse' "$service"
check_absent 'hardcoded gold quote is retired' '3,240[.]50|3240[.]50' "$service"
check_absent 'hardcoded bitcoin quote is retired' '66,259[.]00|66259[.]00' "$service"
check_absent 'local fallback does not claim a live snapshot' 'live market snapshot' "$service"
check 'settings explains automatic server-managed routing' 'automatically routes.*managed server-side|managed server-side.*automatically routes' "$settings"
check_absent 'settings does not expose provider or model names' 'GLM|DeepSeek|Kimi|MiMo|OpenRouter|FLUX|Cloudflare Workers AI|@cf/' "$settings"
check 'README documents the OpenCode Go secret' 'OPENCODE_GO_API_KEY' "$readme"
check 'README documents the DeepSeek fallback secret' 'DEEPSEEK_API_KEY' "$readme"
check 'README documents the OpenRouter fallback secret' 'OPENROUTER_API_KEY' "$readme"
check 'README documents primary text routing' 'deepseek-v4-flash' "$readme"
check 'README documents the OpenRouter image model' 'google/gemini-3[.]1-flash-lite-image' "$readme"
check_absent 'README no longer documents the retired FLUX model' 'black-forest-labs/flux-1-schnell' "$readme"
check_absent 'README no longer documents MiMo V2.5' 'xiaomi/mimo-v2[.]5' "$readme"
check_absent 'README no longer documents Cloudflare Workers AI models' '@cf/' "$readme"
check_absent 'README no longer describes GLM-4.7-Flash as the active model' 'GLM-4[.]7-Flash|@cf/zai-org/glm-4[.]7-flash' "$readme"
check_absent 'settings has no model override storage' 'corez_openrouter_model' "$settings"

if (( failures > 0 )); then
  printf '%d public AI proxy contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Public AI proxy contract checks passed.\n'
