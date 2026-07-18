#!/usr/bin/env bash
set -u

service="src/services/aiService.js"
settings="src/components/SettingsModal.jsx"
api="api/openrouter.js"
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

check 'OpenRouter endpoint is configured server-side' 'https://openrouter[.]ai/api/v1/chat/completions' "$api"
check 'DeepSeek V4 Flash is the default model option' 'deepseek/deepseek-v4-flash' "$service"
check 'private API key is read server-side' 'process[.]env[.]OPENROUTER_API_KEY' "$api"
check 'OpenRouter request sends authorization header server-side' 'Authorization.*Bearer' "$api"
check 'OpenRouter request sends system and user messages server-side' "role: 'system'|role: \"system\"" "$api"
check 'frontend calls the public OpenRouter proxy' "fetch\\('/api/openrouter'" "$service"
check 'AI response falls back locally when proxy is not configured' 'generateLocalAIResponse' "$service"
check 'OpenRouter failures fall back locally' 'catch.*openRouterError|openRouterError' "$service"
check_absent 'frontend does not read API keys' 'corez_openrouter_api_key|VITE_OPENROUTER_API_KEY' "$service"
check_absent 'settings UI does not ask public users for API key' 'OpenRouter API key' "$settings"
check 'settings UI has OpenRouter model field' 'OpenRouter model' "$settings"
check 'settings UI persists OpenRouter model' 'corez_openrouter_model' "$settings"

if (( failures > 0 )); then
  printf '%d OpenRouter provider contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'OpenRouter provider contract checks passed.\n'
