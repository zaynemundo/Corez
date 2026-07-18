#!/usr/bin/env bash
set -u

api="api/openrouter.js"
service="src/services/aiService.js"
readme="README.md"
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

check 'server proxy route exists' 'export default async function handler' "$api"
check 'server proxy reads private OpenRouter key from env' 'process[.]env[.]OPENROUTER_API_KEY' "$api"
check 'server proxy calls OpenRouter chat completions' 'https://openrouter[.]ai/api/v1/chat/completions' "$api"
check 'server proxy uses OpenOrca default model' 'open-orca/mistral-7b-openorca' "$api"
check 'server proxy requests detailed public answers' 'detailed|thorough|structured' "$api"
check 'server proxy never sends API key to client response' 'sendJson.*response, 200.*content' "$api"
check 'frontend calls public proxy first' "fetch\\('/api/openrouter'" "$service"
check 'frontend falls back to local response when proxy is unavailable' 'generateLocalAIResponse' "$service"
check_absent 'frontend does not read Vite OpenRouter API key' 'VITE_OPENROUTER_API_KEY' "$service"
check_absent 'settings no longer asks public users for API key' 'OpenRouter API key' "$settings"
check 'settings still allows model override' 'OpenRouter model' "$settings"
check 'README documents server env key' 'OPENROUTER_API_KEY' "$readme"
check 'README says public users do not need an API key' 'public users.*not need|do not need.*API key' "$readme"

if (( failures > 0 )); then
  printf '%d public OpenRouter proxy contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Public OpenRouter proxy contract checks passed.\n'
