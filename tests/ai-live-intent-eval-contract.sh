#!/usr/bin/env bash
set -u

script="scripts/evaluate-ai-intents.mjs"
failures=0

check() {
  local description="$1"
  local pattern="$2"

  if ! grep -Eq -- "$pattern" "$script" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local description="$1"
  local pattern="$2"

  if grep -Eq -- "$pattern" "$script" 2>/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check 'live eval script exists' 'OPENROUTER_API_KEY' 
check 'live eval refuses to run without API key' 'OPENROUTER_API_KEY.*required|requires OPENROUTER_API_KEY'
check 'live eval defaults to DeepSeek V4 Flash' 'deepseek/deepseek-v4-flash'
check 'live eval uses max reasoning effort' 'OPENROUTER_REASONING_EFFORT.*xhigh|xhigh.*OPENROUTER_REASONING_EFFORT'
check 'live eval covers app intent' "id: 'app'"
check 'live eval covers code-help intent' "id: 'code-help'"
check 'live eval covers writing intent' "id: 'writing'"
check 'live eval covers explanation intent' "id: 'explanation'"
check 'live eval covers general intent' "id: 'general'"
check 'live eval scores minimum answer quality' 'minimumScore'
check 'live eval reports failures with snippets only' 'snippet'
check_absent 'live eval does not contain a real OpenRouter key' 'sk-or-v1-[A-Za-z0-9]+'

if (( failures > 0 )); then
  printf '%d AI live intent eval contract check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf 'AI live intent eval contract checks passed.\n'
