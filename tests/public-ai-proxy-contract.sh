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

check 'frontend exposes a hosted AI response function' 'generateHostedAIResponse' "$service"
check 'frontend uses the public AI route' '/api/ai' "$service"
check 'frontend sends prompt and intent only' 'JSON[.]stringify\(\{ prompt, intent \}\)' "$service"
check 'hosted failures use provider-neutral fallback wording' 'Hosted AI unavailable; using local Corez fallback' "$service"
check 'frontend retains local response fallback' 'generateLocalAIResponse' "$service"
check 'settings identifies Cloudflare Workers AI' 'Cloudflare Workers AI' "$settings"
check 'settings identifies GLM-5.2' 'GLM-5[.]2' "$settings"
check_absent 'settings has no OpenRouter model field' 'OpenRouter model|openrouter-model' "$settings"
check_absent 'settings has no OpenRouter model storage' 'corez_openrouter_model' "$settings"

if (( failures > 0 )); then
  printf '%d public AI proxy contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'Public AI proxy contract checks passed.\n'
