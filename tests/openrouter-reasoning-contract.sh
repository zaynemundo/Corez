#!/usr/bin/env bash
set -u

api="api/openrouter.js"
service="src/services/aiService.js"
settings="src/components/SettingsModal.jsx"
readme="README.md"
skill=".agents/skills/ask-env-values/SKILL.md"
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

check 'DeepSeek V4 Flash is the server default model' 'deepseek/deepseek-v4-flash' "$api"
check 'DeepSeek V4 Flash is the frontend default model' 'deepseek/deepseek-v4-flash' "$service"
check 'DeepSeek V4 Flash is the settings default model' 'deepseek/deepseek-v4-flash' "$settings"
check 'OpenRouter reasoning effort env var is supported' 'OPENROUTER_REASONING_EFFORT' "$api"
check 'max reasoning defaults to xhigh' 'xhigh' "$api"
check 'OpenRouter request sends reasoning_effort' 'reasoning_effort' "$api"
check 'reasoning effort is validated against allowed values' 'minimal.*low.*medium.*high.*xhigh.*none|none.*minimal.*low.*medium.*high.*xhigh' "$api"
check 'README documents reasoning effort env var' 'OPENROUTER_REASONING_EFFORT' "$readme"
check 'env skill asks for reasoning effort' 'OPENROUTER_REASONING_EFFORT' "$skill"
check_absent 'repo does not contain a real OpenRouter key in docs or source' 'sk-or-v1-[A-Za-z0-9]+' "$readme"
check_absent 'skill does not contain a real OpenRouter key' 'sk-or-v1-[A-Za-z0-9]+' "$skill"

if (( failures > 0 )); then
  printf '%d OpenRouter reasoning contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'OpenRouter reasoning contract checks passed.\n'
