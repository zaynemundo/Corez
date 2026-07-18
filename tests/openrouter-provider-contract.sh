#!/usr/bin/env bash
set -u

service="src/services/aiService.js"
settings="src/components/SettingsModal.jsx"
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

check 'OpenRouter endpoint is configured' 'https://openrouter[.]ai/api/v1/chat/completions' "$service"
check 'OpenOrca is the default model option' 'open-orca/mistral-7b-openorca' "$service"
check 'API key can come from browser storage' 'corez_openrouter_api_key' "$service"
check 'API key can come from Vite env fallback' 'VITE_OPENROUTER_API_KEY' "$service"
check 'OpenRouter request sends authorization header' 'Authorization.*Bearer' "$service"
check 'OpenRouter request sends system and user messages' "role: 'system'|role: \"system\"" "$service"
check 'AI response falls back when OpenRouter is not configured' 'generateLocalAIResponse' "$service"
check 'OpenRouter failures fall back locally' 'catch.*openRouterError|openRouterError' "$service"
check_absent 'no real API key is committed' 'sk-or-v1-|OPENROUTER_API_KEY=' "$service"
check 'settings UI has OpenRouter API key field' 'OpenRouter API key' "$settings"
check 'settings UI has OpenRouter model field' 'OpenRouter model' "$settings"
check 'settings UI persists OpenRouter API key' 'corez_openrouter_api_key' "$settings"
check 'settings UI persists OpenRouter model' 'corez_openrouter_model' "$settings"

if (( failures > 0 )); then
  printf '%d OpenRouter provider contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'OpenRouter provider contract checks passed.\n'
